# P1 — Express API Foundation (COMPLETE)

**Status:** all 15 tasks shipped and merged to `staging` (PR #9, PR #10). Full gate green: typecheck,
lint, build, 159/159 tests. Render deploy prep (`render.yaml`) landed in Task 15 and is not yet deployed.

> This file originally tracked a task-by-task TDD plan (write failing test → implement → gate → commit).
> Now that P1 is done and the code is the source of truth, it's condensed to a completion record: what
> shipped, and the non-obvious "why" behind each deviation or landmine hit along the way. The step-by-step
> instructions themselves are gone — read the actual source and tests instead. For current architecture,
> read `CLAUDE.md` and the spec below, not this file.

**Goal:** Build `apps/api` — a versioned, layered, session-authenticated Express REST API with correct
authorization — deployable and fully demoable with curl alone, before any UI exists.

**Architecture:** Thin routers delegate to a service layer that owns all business logic and all
serialization decisions (including premium content gating). Identity always comes from
`req.session.userId`, never from a request body. Typed errors are thrown by services and translated to
HTTP status codes in exactly one place. Every route is reachable only through one ordered middleware
chain, which an integration test asserts.

**Tech Stack:** Express 5 + TypeScript, `express-session` + `connect-redis` (node-redis), Mongoose 8, Zod
3, Vitest + Supertest + `mongodb-memory-server`, tsup (build), tsx (dev), Docker Compose.

**Spec:** `docs/superpowers/specs/2026-07-16-express-react-rebuild-design.md` — read §3, §5, §6, §10 before
touching this area. This plan implemented the P1 row of §13.

**Branch:** built on `dev/express-api-foundation` (merged, deleted); CI on `dev/ci-cd-pipeline` (merged,
deleted); deploy prep on `dev/render-deploy-gate`.

---

## Global Constraints — landmines still worth knowing

These are facts that cost real debugging time during P1 and are not written down anywhere else. Standing
project rules (middleware order, no business logic in handlers, no secrets in source, etc.) live in
`CLAUDE.md` — not repeated here.

**Verified against the live registry on 2026-07-16 — not recollections:**

- **Express 5.2.1: `app.get('*')` throws at startup** (`Missing parameter name at index 1: *`). Express 5
  uses path-to-regexp v8, where a bare `*` is invalid. The SPA catch-all is `app.get('/*splat', ...)`
  (`apps/api/src/static.ts`). The spec's §3 hazard #2 example predates this — it showed Express 4 syntax.
- **Express 5 auto-forwards rejected promises** from handlers/middleware to the error handler. No
  `express-async-errors`, no try/catch-just-to-call-`next(err)`.
- **`connect-redis@9` peer-depends on `redis` (node-redis) `>=5`, not `ioredis`.** Use `redis@^6`. Its
  export is named: `import { RedisStore } from 'connect-redis'` — no default export.
- **`trustProxy` and `secure` are coupled, not independent:** `express-session` decides "is this request
  secure" via its own `issecure()` check, which only trusts `X-Forwarded-Proto` when `trust proxy` is
  enabled. Passing `secure: true` alone against a plain request doesn't just drop the `Secure` attribute —
  it makes `express-session` withhold `Set-Cookie` entirely (`express-session/index.js`:
  `if (cookie.secure && !issecure(req, trustProxy)) return`). This matches Render's real topology: TLS
  terminates at the load balancer, so the app sees plain HTTP and must trust `X-Forwarded-Proto`.
- **`@blog/shared` ships TypeScript source** (`main: ./src/index.ts`). `apps/api` builds with tsup +
  `noExternal: ['@blog/shared']`, which inlines it — but esbuild then recursively bundles everything
  `@blog/shared` imports too, including `mongoose`. Its CJS `require()` of Node builtins (`crypto`) doesn't
  survive being merged that deep into an ESM bundle (`Dynamic require of "crypto" is not supported`). Fix:
  `external: ['mongoose']` in `apps/api/tsup.config.ts` — dropped the bundle from 2.73 MB to 22.5 KB and
  fixed the crash. Do not add a root `tsc --build` — CLAUDE.md records that it was tried and reverted.
- **`req.params` typing is a landmine, twice over**, because `tsconfig.base.json` sets
  `noUncheckedIndexedAccess: true`:
  - A bare `Request` types `req.params.slug` as `string | string[] | undefined`. Typing a standalone
    loader `Request<{ slug: string }>` then fails on contravariance against a non-generic
    `load: (req: Request) => ...` parameter. Fix: make the consumer generic over params (`requireOwner<P>`,
    `apps/api/src/middleware/require-owner.ts`) instead of "simplifying" back to a bare `Request`.
  - Mixing an untyped `RequestHandler` (e.g. `requireAuth`) into a multi-handler call for a `:param` route
    collapses the **whole chain's** inferred `P` to `ParamsDictionary` — not just that handler's. A
    single-handler `GET '/:slug', handler` infers fine; the identical shape with `requireAuth` in front of
    it does not. `requireAuth` itself doesn't need to be generic (it never reads `req.params`) — fix at the
    call site instead: `postsRouter.put<{ slug: string }>('/:slug/likes', requireAuth, handler)`.
- **Any test chaining two `[...]` indexes on an array/tuple value under `noUncheckedIndexedAccess`** fails
  `tsc --noEmit` even though it runs fine under vitest (the first index already produces `T | undefined`,
  so the second index errors) — hit independently on `vi.fn().mock.calls[0][0]` and
  `res.headers['set-cookie'][0]`. Fix, same shape both times: optional-chain the *second* index only
  (`next.mock.calls[0]?.[0]`, `res.headers['set-cookie']?.[0]`). Standard idiom in every test file now.

**Version pins — do not upgrade without a dedicated migration branch:**

| Package | Pin | Why not latest |
|---|---|---|
| `zod` | `^3.24.0` | v4 (4.4.3) is breaking (`z.string().email()` → `z.email()`, `.flatten()` deprecated) |
| `mongoose` | `^8.9.0` | v9 (9.7.4) is out; spec §2 says Mongoose 8 |
| `vitest` | `^2.1.0` | v4 is out; not P1's job |
| `bcryptjs` | `^2.4.3` | v3 is ESM-first with a changed API; existing service/tests use v2 |

**Node >= 22** (`.nvmrc` = 22).

---

## File Structure (as shipped)

**Modified at the root:** `package.json` (typecheck fanout, `seed` → `@blog/api`), `eslint.config.mjs`
(dropped dead `.next` ignore, added `argsIgnorePattern: '^_'` for the 4-arg Express error handler),
`.env.example` (session vars, not Auth.js).

**Modified in `packages/shared`:** `src/errors.ts` (+`ValidationError`, `+ConflictError`),
`src/schemas/post.ts` (`UpdatePostSchema` drops `postId`, becomes partial — the slug identifies the post
via the URL), `src/models/user.ts`/`post.ts` (stale-comment fixes).

**Created in `apps/api`:**

```
apps/api/
├── package.json / tsconfig.json / tsup.config.ts / Dockerfile
└── src/
    ├── index.ts                     # composition root: env → redis → db → app → listen
    ├── app.ts                       # buildApp(): middleware order, routers, error handler
    ├── static.ts                    # SPA catch-all (Express 5 /*splat), prod only, no-ops with no build
    ├── types/express-session.d.ts   # SessionData augmentation (userId, username)
    ├── lib/
    │   ├── env.ts                   # Zod-validated env; no secret fallbacks
    │   ├── redis.ts                 # globalThis-cached node-redis client
    │   ├── session.ts               # express-session + connect-redis wiring
    │   └── services/
    │       ├── user.ts / post.ts / like.ts
    ├── middleware/
    │   ├── require-auth.ts / require-owner.ts / validate.ts / not-found.ts / error-handler.ts
    ├── routes/v1/
    │   ├── index.ts                 # mounts v1 routers + /health
    │   ├── auth.ts / posts.ts / users.ts
    ├── scripts/seed.ts
    └── test/helpers.ts              # buildTestApp(), useTestDb() — shared across all route tests
```

**Created at the root:** `.dockerignore`, `compose.yaml`, `compose.e2e.yaml`, `render.yaml`,
`secrets/{dev,e2e}/session_secret.txt.example` + `secrets/README.md`,
`.github/workflows/{pr-to-staging,staging-pipeline,pr-to-master}.yml`.

### Two decisions this plan made that the spec doesn't spell out

1. **`buildApp({ session })` takes one grouped, all-or-nothing session config** (`{ store, secret, secure }`)
   rather than three independent optional fields. A per-field fallback (`secret: opts.sessionSecret ??
   TEST_SECRET`) is an if/else a reader of `app.ts` can't verify is safe without trusting a comment in a
   *different* file. Grouping means a caller either supplies a complete real config or gets no session
   middleware — no partial, no default, no in-between state. The test-only convenience this removes lives
   instead in `apps/api/src/test/helpers.ts`'s `buildTestApp()`, which `src/index.ts` never imports —
   unreachable from the tsup bundle and the Docker image by construction, not by convention.
2. **`ConflictError` → 409 is added** alongside the spec §10's four error types. A duplicate username/email
   is a conflict, not a validation failure, and §3 says to prefer correct HTTP semantics.

---

## Completion log

Each task below: what shipped, tests, and any deviation/landmine specific to that task not already covered
above.

**Task 1 — Root config re-shape and `packages/shared` corrections.** Re-established per-workspace
`typecheck` fanout and the Task-1-required `argsIgnorePattern` eslint fix (both existed on the abandoned
`dev/web-app-scaffold` and had to be redone here). Added `ValidationError`/`ConflictError`, reshaped
`UpdatePostSchema` to partial-with-no-`postId`, rewrote `.env.example` for session vars. Tests:
`packages/shared/src/errors.test.ts`, `schemas.test.ts`.

**Task 2 — `apps/api` skeleton.** First runnable Express app: middleware chain, error-handler, `/health`.
Error JSON shape (`{ error: { message, fields? } }`) is depended on by every later task. Test:
`app.test.ts` asserts the exact middleware order.

**Task 3 — Session wiring.** Redis client (globalThis-cached) + `connect-redis` store + cookie policy. See
the `trustProxy`/`secure` coupling and the grouped-`SessionOptions` decision above. Test: `session.test.ts`.

**Task 4 — `requireAuth` and `requireOwner`.** The fix for all five legacy authorization holes. See the
`req.params` generic-typing landmine above — `requireOwner<P>` exists specifically because of it. Tests:
`require-auth.test.ts`, `require-owner.test.ts`.

**Task 5 — Test helpers, `validate` middleware, `userService`.** Extracted `useTestDb()` (shared
mongodb-memory-server boilerplate) alongside `buildTestApp()`. `userService` covers signup, credential
verification, and public-profile projection. Tests: `validate.test.ts`, `user.test.ts`.

**Task 6 — Auth routes.** `signup`/`login`/`logout`/`me`. Login returns an identical response shape for a
wrong password and an unknown username (no username-enumeration oracle). Session id regenerates on login
(fixation prevention). Test: `auth.test.ts`.

**Task 7 — `postService`.** CRUD, slug, teaser derivation, and the single most important rule in P1 (spec
§6): a premium post's full body is never serialized for an anonymous reader — gating happens in the
service, not a route handler or a component. Test: `post.test.ts`.

**Task 8 — Posts routes.** CRUD wired to `postService` with owner-enforced auth via `requireOwner`. This is
where the §14 security checklist gets enforced against real HTTP. Test: `posts.test.ts`.

**Task 9 — Likes.** Idempotent `PUT`/`DELETE` (not `POST /toggle`), identity from the session, DB unique
index as the last line of defense against double-liking. See the `requireAuth`-collapses-route-typing
landmine above — fixed with an explicit type argument at the route call site, not by making `requireAuth`
generic. Route ordering: the `/:slug/likes` routes must be registered before the bare `/:slug` handlers so
a later refactor can't shadow them (Express itself already matches full paths correctly). Tests:
`like.test.ts`, `likes.test.ts`.

**Task 10 — Users routes.** The account-takeover fix: `PATCH`/`DELETE /:id` compare `req.params.id` to
`req.session.userId` directly rather than via `requireOwner` — a User has no `author` field, the user *is*
the resource, same rule as Task 4 in a different shape. Test: `users.test.ts`.

**Task 11 — Composition root and the SPA catch-all.** `mountStatic()` no-ops when the client-dist directory
is absent (P1's default — no client exists yet). Shipped anyway in P1 because the Express 5 wildcard change
is a startup-time crash and the catch-all is the one route that can shadow the entire API — proving both
now against a fixture directory means P2 only has to drop a real build in. Test: `static.test.ts`.

**Task 12 — Docker and Compose.** `compose.yaml` (dev, hot reload) and `compose.e2e.yaml` (prod `runner`
target for CI). Only `SESSION_SECRET` is treated as a real secret (Mongo/Redis run unauthenticated in
dev/e2e by design, so those stay plain `environment:` vars) — wired through Compose file-based secrets
(`SESSION_SECRET_FILE` convention, same as official Docker images). Real secret files are gitignored;
`*.txt.example` templates are committed instead (a habit worth keeping in a public repo regardless of what
the throwaway dev values actually are). Landmines hit: the bundled mongodb driver's dynamic `crypto`
require (see `external: ['mongoose']` above); a stale `compose.override.yaml` service name left over from
the abandoned Next.js branch (`web` → `api`) that silently no-op'd the Avast `extra-ca` TLS secret. Test:
`env.test.ts` (the `_FILE` convention).

**Task 13 — Seed script.** `npm run seed` — idempotent demo dataset seeding one premium post, so the
gating rule is demoable with curl alone.

**Task 14 — CI workflow.** Originally planned as one `pull_request`-triggered job gated by a
`production` GitHub Environment; that was never committed. Two problems: most PRs target `staging`, not
`master`, but GitHub Environment deployment-branch policies are built around real branch refs and don't
reliably interact with `pull_request` runs (which execute against a synthetic `refs/pull/N/merge` ref).
Replaced with three workflows gated by branch protection instead (the tool actually designed to control PR
mergeability):
- **`pr-to-staging.yml`** (`pull_request → staging`): rejects any head branch that isn't `dev/*`, then
  build/typecheck/lint → test → e2e-smoke (`compose.e2e.yaml`, hits `/api/v1/health`).
- **`staging-pipeline.yml`** (`push → staging`): re-runs build/test/e2e-smoke on the *merged* result (two
  `dev/*` PRs can each pass individually and still break each other combined), and opens/updates a single
  aggregating `staging → master` PR via `gh pr create`.
- **`pr-to-master.yml`** (`pull_request → master`): only validates the head branch is exactly `staging` —
  does not re-run build/test, since GitHub matches required status checks by commit SHA and
  `staging-pipeline.yml` already ran them on that SHA.

Both `staging` and `master` got branch protection: required status checks, required PR (no direct push),
no force-push/delete, `enforce_admins: true` (blocks even an admin's direct push/merge), `master` keeps
`required_approving_review_count: 1`. The `production` Environment created for the abandoned design was
deleted. This work needed its own branch per CLAUDE.md's one-branch-per-feature rule: the abandoned
Next.js-era `dev/ci-cd-pipeline` (PR #8, closed unmerged) was renamed to `dev/ci-cd-pipeline-nextjs-abandoned`
(kept, not deleted) and a fresh `dev/ci-cd-pipeline` branched from `dev/express-api-foundation`'s tip
(PR #9, merged).

**Task 15 — `render.yaml`, docs, deploy gate.** `render.yaml` declares the `apps/api` web service (region
confirmed against the existing live Render service) + a Key Value (Redis) addon with `ipAllowList: []`
(no public access — internal connections are unauthenticated by default). `SESSION_SECRET` uses
`generateValue: true`; `MONGODB_URI` uses `sync: false` — no secret committed, no hardcoded fallback.
README got a quick-start + curl gating demo. `docs/architecture/deployment-architecture.md` status markers
updated. Spec §14's regression checklist ticked against the real P1 test suite (18 items verified against
actual test names). Shipped on `dev/render-deploy-gate` → PR #13 into `staging`. **Does not deploy anything
by itself** — Render only deploys on a push to `master`, and that requires explicit user approval every
time (never autonomous).

---

## Self-Review Notes (from the original planning pass)

**Spec coverage.** Every P1 element of §13 maps to a task: monorepo re-shape (1), `apps/api` (2), session
auth on Redis (3), guards (4), posts CRUD with authorization (7–8), Supertest suite (throughout), Compose
dev + e2e (12), seed (13), CI (14), Render deploy prep (15). Likes (9) and users (10) come from the §3 REST
table. §14 is audited in Task 15, with out-of-scope items (P2/P4/P5) named rather than dropped.

**Four places this plan knowingly diverged from the spec** (each detailed at its task above): the `/*splat`
Express 5 fix over the spec's `app.get('*')` example; `requireOwner` made generic over params (the spec's
signature doesn't compile under `noUncheckedIndexedAccess`); `ConflictError` added as a fifth error type;
`static.ts` shipped in P1 with no client to serve yet.

**One design decision the spec leaves open:** `buildApp` takes an injected session store, so the
integration suite runs with no Redis container. Real Redis is covered by `compose.e2e.yaml` in CI.

**What was verified rather than assumed** (against the live registry / a real compile on 2026-07-16): the
Express 5 wildcard crash; Express 5 async-rejection forwarding; `connect-redis@9`'s named `RedisStore`
export and its `redis`-not-`ioredis` peer dep; node-redis v6's client API; tsup inlining `@blog/shared`
into a bundle that runs on plain `node`; the eslint arity failure on a 4-param error handler; `req.params`
typing under `noUncheckedIndexedAccess`; and the service code typechecking against the real Mongoose models
(including that `InferSchemaType` does expose `createdAt`/`updatedAt`).

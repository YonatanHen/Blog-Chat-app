# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A from-scratch rebuild of a legacy MERN (CRA/Redux/Express/Socket.io) blog + chat app as a modern
**Express + React (Vite) + TypeScript** monorepo, done as a portfolio piece targeting fullstack/backend
roles. The legacy app still lives on `master` and is live on Render; the rebuild happens on `dev/*` branches
that merge into `staging` first, **never directly into `master`**.

The full design rationale (REST surface, session auth model, content-gating mechanism, Redis usage,
production topology, and why the API and client are one deployed service) lives in
`docs/superpowers/specs/2026-07-16-express-react-rebuild-design.md` — read it before making architectural
changes, not just this file. `docs/architecture/deployment-architecture.md` is the living topology
reference. The task-by-task plan for the current phase is under `docs/superpowers/plans/`.

The build is phased (P1–P6), each a dedicated branch, each independently deployable.

> **History:** this rebuild was originally designed on Next.js 15, and Tasks 1–7 of that plan were built
> before the stack pivoted on 2026-07-16. `dev/web-app-scaffold` and `dev/ci-cd-pipeline` (PR #8) are
> **abandoned unmerged** — retained in git history.
**Plan checkboxes are never ticked.** The active plan reads 0% complete while most of its tasks are
merged, so status must be derived from git and the working tree, never from `- [ ]`. Use the
`plan-status` skill — it does this and reports the next task.

## Commands

npm workspaces monorepo (`packages/*`, `apps/*`). Run from the repo root.

```bash
npm run dev          # docker compose watch — full stack (api, client, mongo, redis), hot reload
npm run typecheck    # fans out to each workspace's own typecheck script (no root tsconfig.json)
npm run lint         # eslint . (flat config, typescript-eslint recommended + no-explicit-any as error)
npm run test         # vitest run, across packages/**/*.test.ts and apps/**/*.test.ts
npm run test -- path/to/one.test.ts   # single test file
npm run test:e2e     # playwright, against infra/compose.e2e.yaml (prod-target build)
npm run seed         # seed the database
```

**Why `typecheck` fans out instead of `tsc --build`:** apps that set `composite: false` are incompatible
with TypeScript's project-references build mode. There is no root `tsconfig.json`. Don't reintroduce a root
`tsc --build` — it's been tried and reverted.

**Don't run `typecheck` or `lint` locally — CI owns them.** Both run on every PR; running them again on
each edit costs minutes per change and buys nothing the PR won't catch. Write clean code, push, and fix
whatever CI flags. This applies to agents and subagents too: a dispatch should not instruct one to "run
the full gate" before reporting.

`npm run test` is **not** covered by that rule — keep running it. Tests are the working feedback loop, not
a gate: TDD depends on watching a test fail before it passes, and a suite that only runs in CI stops being
usable for that. The same goes for a single-file run while iterating.

`npm run test:e2e` needs the prod Docker image, which currently won't build on this machine (see the Avast
note below). Treat E2E as CI-verified until that's fixed, and say so plainly rather than implying a spec
passed locally when it never ran.

**Docker:** per-app multi-stage Dockerfiles (`base → deps → dev`/`builder → runner`) live inside each app
(`apps/server/Dockerfile`). Orchestration/deploy config lives in `infra/`: `compose.yaml` is the dev stack
(`target: dev`, hot reload); `compose.e2e.yaml` builds the `runner` target — the actual production image —
so a broken prod build is caught before Render is. `render.yaml` is the prod infra-as-code and lives at
the **repo root**, not in `infra/` — Render discovers Blueprints there and nowhere else.

- **Invoke both compose files with `--project-directory .` from the repo root.** Their `context`/
  `develop.watch`/secrets paths are written relative to the repo root, but Compose resolves them relative
  to the compose file's own directory. Already wired into `npm run dev` and CI.
- **Containers bake source at build time.** If an edit isn't showing up, the container is serving stale
  code — rebuild before debugging the code itself (`docker-compose-rebuild` skill).
- **Avast on this machine breaks all container TLS** (`UNABLE_TO_VERIFY_LEAF_SIGNATURE` at `npm ci`). The
  Dockerfiles accept an optional `extra-ca` BuildKit secret; see `infra/compose.override.yaml` (gitignored),
  which needs an explicit `-f` because `-f infra/compose.yaml` disables Compose's auto-merge. Never bake a
  CA cert into an image or commit one.

## Architecture

```
apps/
  server/      # Express REST API + Socket.io (P4); also serves the built SPA in prod → Render web service
  client/      # React + Vite SPA → static bundle, served by apps/server
packages/
  zod-shared/  # Zod schemas only — the cross-app package (server validates and client forms both use it)
```

**One origin, one service — with no exceptions.** `apps/server` serves `/api/v1/*`, the built SPA
(catch-all → `index.html`), and the Socket.io server, all from one process. In dev, Vite's `server.proxy`
forwards `/api` to the API container, reproducing the same origin. This is load-bearing: the httpOnly
session cookie works identically in dev, CI, and prod, and **CORS is never needed anywhere**.

There is **no `apps/realtime`** (decided 2026-07-29). It was designed as a separate service, which forced a
signed handshake ticket — a separate origin cannot receive the session cookie, and Render subdomains are on
the Public Suffix List so widening the cookie's domain is refused by the browser, not merely unwise.
Running Socket.io in the same process removes the ticket, the shared sign/verify package it needed, and
CORS. The socket reads the session directly via `io.engine.use(sessionMiddleware)`; identity always comes
from `socket.data.user`, never from a message payload. Rationale:
`docs/superpowers/specs/2026-07-29-realtime-chat-design.md`.

**Zod is the single source of truth for validation.** Schemas live in `packages/zod-shared/src/schemas/`;
types are inferred (`z.infer<...>`), never hand-declared. The same schema validates the request on the
server and drives the form on the client — the only reason `zod-shared` is a separate package.

`UpdatePostSchema` is `CreatePostSchema.partial()`, so its fields carry two wrappers
(`ZodOptional<ZodDefault<...>>`). Anything introspecting a schema must peel wrappers until the type
stabilises — a single-level unwrap misclassifies `tags` on the edit form. **Editing uses the partial
schema; never substitute the create schema to dodge this — that turns an update into a full recreate.**

**Mongoose models use explicit `Model<T>` typing** (`apps/server/src/models/*.ts`) —
`mongoose.models.X as Model<T> ?? mongoose.model<T>(...)` — because the untyped union return breaks
`.create()`'s overload resolution. Models are server-only, never imported by the client.

**Mongo/Redis connections are cached on `globalThis`** (`apps/server/src/lib/db.ts`, `lib/redis.ts`). A
naive `connect()` opens a new connection per module reload until the pool is exhausted (Render's free Redis
caps at 50). Never call `mongoose.connect()` / `new Redis()` outside these cached wrappers.

**Sessions:** `express-session` + `connect-redis`. The cookie is httpOnly + Secure + SameSite=Lax and holds
only an opaque session ID; data lives in Redis. `SameSite=Lax` is sufficient CSRF protection **only because**
the SPA is same-origin — if the client ever moves to its own origin, CSRF tokens become mandatory.

**Three-layer authorization**, all required, none sufficient alone:
1. `requireAuth` middleware — 401 for anonymous requests on protected routers.
2. `requireOwner(loadResource)` — 403 unless `req.session.userId` matches the resource author. Identity
   **always** comes from the session, **never** from a body field. This is the fix for all five legacy
   authorization holes.
3. Database constraints (e.g. the unique `(user, post)` index on `Like`) as the last line of defense.

**Middleware order is load-bearing** and asserted by an integration test:
`helmet → json → session → routers → 404 → error handler`. The legacy app registered `cors()` *after* its
routers, so it never applied. The error handler is always last.

**Content gating lives in the service layer, not the UI.** `postService.getBySlug(slug, viewerId)` omits the
full `body` when there's no session — the API never serializes it, so there is nothing to find in DevTools.
Gating in a component would be cosmetic.

The wall is **per-reader, not per-post**: there is no `premium` flag and no paid tier. Every post is teased
for anonymous readers and full for any signed-in one, so signing up (free) is what unlocks content. The
feed (`postService.list`) is teasers for *everyone* — a list endpoint never ships full bodies — which is why
`PostDto.gated` means "this reader is locked out", **not** "this body is truncated". Those two are separate
arguments to `toDto` on purpose; collapsing them reports every feed item as locked.

## Git and workflow

- One branch = one feature. Never implement separate features in the same branch.
- Create feature branches from `staging`, never from another feature branch. Tell the developer if
  `staging` is not up to date.
- Never commit a feature directly to `master` or `staging`.
- **Never merge without a PR.** No fast-forwards, no direct pushes to a shared branch.
- **Exception: `README.md`-only changes may be pushed directly to `staging`** — no branch, no PR, no
  CI. This is the one deliberate carve-out from the rule above (decided 2026-07-29). `staging`'s GitHub
  branch protection was relaxed to allow it (`required_status_checks` and `required_pull_request_reviews`
  removed; `allow_force_pushes`/`allow_deletions` stay off). Because GitHub can't scope a bypass to one
  path, this technically opens direct pushes of *any* file to `staging`, not just the README — never use
  that opening for anything beyond `README.md`; every other change still goes through the full
  branch → PR → review → CI → merge flow.
- Never name a branch or PR by its task number — name it for the feature.
- Never merge to `master` or deploy to production without explicit approval, mid-project or not.
- Never add Claude attribution or `Co-Authored-By` trailers to commits.

## Code constraints

- Never write credentials, tokens, or connection strings into source. Use gitignored `.env` locally and
  each app's `.env.example` for documentation; production secrets are set in the Render dashboard
  (`render.yaml` uses `sync: false`). A leaked credential was found in this repo's history on 2026-07-16 —
  this is not hypothetical.
- Business logic lives in `lib/services/`. Routers and middleware stay thin: authenticate, authorize,
  validate with Zod, delegate. Never put business logic in a route handler.
- REST routes are versioned and grouped by prefix (`/api/v1/posts/*`), one Router module per resource.
  Prefer correct HTTP semantics over convenience: like/unlike is idempotent `PUT`/`DELETE`, not
  `POST /toggle`; logout is `POST`, not `GET`.
- Services throw typed errors from `lib/errors.ts`; `middleware/error-handler.ts` translates them once.
  Handlers never build error responses ad hoc. The shape is fixed:
  `{ error: { message, fields? } }`, `fields` only on a 400.
- One component per `.tsx` file, split `ui/` (styling primitives) / `patterns/` (composed) / `layouts/`
  (page chrome). A component shared across apps keeps its prop-driven base in a shared location — don't
  fork per app.
- Server state belongs to TanStack Query. No Redux. Components never call `fetch` directly — go through
  the typed wrappers in `apps/client/src/api/*`, which send `credentials: 'include'`. Mutations invalidate
  query keys rather than hand-patching a cache.
- No `any` — `@typescript-eslint/no-explicit-any` is an error repo-wide.
- Never mention spec section numbers in code. Cite them in docs and plans instead.
- Add `console.*` tracing to API calls, service methods, and middleware during development — request
  path/method, payload, status, errors. Gate with `if (process.env.DEBUG)` to keep production quiet.
  - Avoid from long comments in the code, if you feel that a comments is necessarry write 2 lines max.
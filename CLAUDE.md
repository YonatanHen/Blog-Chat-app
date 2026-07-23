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
> before the stack pivoted on 2026-07-16 (see spec §2 for why). `dev/web-app-scaffold` and
> `dev/ci-cd-pipeline` (PR #8) are **abandoned unmerged** — retained in git history. If you find Next.js
> code, Auth.js config, or Server Actions, you are on an abandoned branch.

## Commands

npm workspaces monorepo (`packages/*`, `apps/*`). Run from the repo root.

```bash
npm run dev          # docker compose watch — full stack (api, client, mongo, redis), hot reload
npm run typecheck    # fans out to each workspace's own typecheck script (no root tsconfig.json — see below)
npm run lint         # eslint . (flat config, typescript-eslint recommended + no-explicit-any as error)
npm run test         # vitest run, across packages/**/*.test.ts and apps/**/*.test.ts
npm run test -- path/to/one.test.ts   # single test file
npm run test:e2e     # playwright, against infra/compose.e2e.yaml (prod-target build)
npm run seed         # seed the database
```

**Why `typecheck` fans out per-workspace instead of `tsc --build`:** apps that set `composite: false` are
incompatible with TypeScript's project-references build mode. There is no root `tsconfig.json`; each
workspace declares its own `typecheck` script and the root runs `npm run typecheck --workspaces
--if-present`. Don't reintroduce a root `tsc --build` — it's been tried and reverted.

**Docker:** per-app multi-stage Dockerfiles (`base → deps → dev`/`builder → runner`), kept inside each app
(`apps/server/Dockerfile`). Orchestration/deploy config lives in `infra/`: `infra/compose.yaml` is the dev
stack (`target: dev`, hot reload); `infra/compose.e2e.yaml` builds the `runner` target — the actual production
image — for CI/E2E, so a broken prod build is caught before Render is; `infra/render.yaml` is the prod
infra-as-code. **Both compose files must be invoked with `--project-directory .` from the repo root** — they
live in `infra/` but their `context`/`develop.watch`/secrets paths are written relative to the repo root, and
Compose resolves them relative to the compose file's own directory otherwise (already wired into `npm run
dev` and the CI workflows — don't invoke `docker compose -f infra/compose*.yaml` without it). If you're behind
a TLS-intercepting proxy/AV locally (Avast on this machine breaks all container TLS), the Dockerfiles accept
an optional `extra-ca` BuildKit secret (see `infra/compose.override.yaml`, gitignored) — **never bake a CA
cert into an image or commit one**.

## Architecture

```
apps/
  server/      # Express REST API; also serves the built SPA in prod → Render web service
  client/      # React + Vite SPA → static bundle, served by apps/server
  realtime/    # Socket.io service (P4) → separate Render web service
packages/
  zod-shared/  # Zod schemas only — the cross-app package (server validates and client forms both use it)
```

**One origin, one service.** `apps/server` serves both `/api/v1/*` and the built SPA (catch-all →
`index.html`). In dev, Vite's `server.proxy` forwards `/api` to the API container, reproducing the same
origin. This is load-bearing: the httpOnly session cookie works identically in dev, CI, and prod, and **CORS
is never needed anywhere**. `apps/realtime` is the exception — it's a separate origin, which is exactly why
it needs a signed handshake ticket instead of the cookie (Render subdomains are on the Public Suffix List and
cannot share cookies).

**Zod is the single source of truth for validation.** Schemas live in `packages/zod-shared/src/schemas/`;
TypeScript types are inferred from them (`z.infer<...>`), never hand-declared. The same schema validates the
request on the server and drives the form on the client — this is the only reason `zod-shared` is a separate
package rather than living inside `apps/server`.

**Mongoose models use explicit `Model<T>` typing** (`apps/server/src/models/*.ts`) —
`mongoose.models.X as Model<T> ?? mongoose.model<T>(...)` — because the untyped union return breaks
`.create()`'s overload resolution otherwise. Models are server-only — never imported by the client.

**Mongo/Redis connections are cached on `globalThis`** (`apps/server/src/lib/db.ts`,
`apps/server/src/lib/redis.ts`). A naive `connect()` opens a new connection per module reload until the pool
is exhausted (Render's free Redis caps at 50 connections). Never call `mongoose.connect()` / `new Redis()`
outside these cached wrappers.

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

**Content gating lives in the service layer, not the UI.** `postService.getPost(slug, session)` omits the
full `body` from its return value when a post is premium and there's no session — the API never serializes
it, so there is nothing to find in DevTools. Gating in a component would be cosmetic. See spec §6.

## Project constraints

- **Never write credentials, tokens, or connection strings into source.** Use `.env` (gitignored) locally;
  each app's own `.env.example` (`apps/server/.env.example`, `apps/client/.env.example`) documents its
  variables with no real values. In production, secrets are set in the Render dashboard (`infra/render.yaml`
  uses `sync: false`) — never committed, never hardcoded as a fallback. (A leaked credential was found in
  this repo's git history on 2026-07-16 and scrubbed — this is not hypothetical.)
- **Business logic is isolated from request handling.** `lib/services/` holds the logic; routers and
  middleware stay thin — authenticate, authorize, validate with Zod, delegate to a service. Never put
  business logic in a route handler.
- **REST routes are versioned and grouped by prefix** — `/api/v1/auth/*`, `/api/v1/posts/*`,
  `/api/v1/users/*` — never flat or unversioned. Each resource gets its own Router module. Prefer correct
  HTTP semantics over convenience: like/unlike is idempotent `PUT`/`DELETE`, not `POST /toggle`; logout is
  `POST`, not `GET`.
- **Errors are typed and translated once.** Services throw `UnauthorizedError`/`ForbiddenError`/
  `NotFoundError`/`ValidationError` from `apps/server/src/lib/errors.ts`; `middleware/error-handler.ts` maps
  them to status codes and a consistent JSON shape. Handlers never build error responses ad hoc.
- **One component per `.tsx` file.** Follow the three-tier split under `apps/client/src/components/`:
  `ui/` (styling primitives, `cva` variants — e.g. `Button`), `patterns/` (composed app-level components),
  `layouts/` (page chrome, e.g. `PageShell`). If a component must be shared across apps, its prop-driven
  base belongs in a shared location and the per-app version wraps/extends it — don't fork per app.
- **Server state belongs to TanStack Query, not a client store.** No Redux. Components never call `fetch`
  directly — go through the typed wrappers in `apps/client/src/api/*`, which send `credentials: 'include'`.
  Mutations invalidate query keys rather than hand-patching a cache.
- Never implement separate features in the same branch.
- Never name a feature branch and PR by the task number.
- Create feature branch from the `staging` branch. Never create a feature branch from another feature branch. Inform the developer if `staging` is not updated. 

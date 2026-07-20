# P1 — Express API Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `apps/api` — a versioned, layered, session-authenticated Express REST API with correct authorization — deployable and fully demoable with curl alone, before any UI exists.

**Architecture:** Thin routers delegate to a service layer that owns all business logic and all serialization decisions (including premium content gating). Identity always comes from `req.session.userId`, never from a request body. Typed errors are thrown by services and translated to HTTP status codes in exactly one place. Every route is reachable only through one ordered middleware chain, which an integration test asserts.

**Tech Stack:** Express 5 + TypeScript, `express-session` + `connect-redis` (node-redis), Mongoose 8, Zod 3, Vitest + Supertest + `mongodb-memory-server`, tsup (build), tsx (dev), Docker Compose.

**Spec:** `docs/superpowers/specs/2026-07-16-express-react-rebuild-design.md`. Read §3, §5, §6, §10 before starting. This plan implements the P1 row of §13.

**Branch:** `dev/express-api-foundation` (already created from `staging`, already contains the spec commit).

---

## Global Constraints

Every task's requirements implicitly include this section.

**Verified facts (checked against the live registry on 2026-07-16 — these are not recollections):**

- **Express 5.2.1. `app.get('*')` THROWS AT STARTUP** — `Missing parameter name at index 1: *`. Express 5 uses path-to-regexp v8, where a bare `*` is not a valid path. The SPA catch-all **must** be written `app.get('/*splat', ...)`. Spec §3 hazard #2 shows `app.get('*')` — **the spec is wrong on this detail and this plan is correct.**
- **Express 5 auto-forwards rejected promises** from handlers and middleware to the error handler. Do **not** add `express-async-errors`, and do **not** wrap handlers in try/catch just to call `next(err)`.
- **`connect-redis@9` peer-depends on `redis` (node-redis) `>=5`, NOT `ioredis`.** Use `redis@^6`. Its export is **named**: `import { RedisStore } from 'connect-redis'` — there is no default export.
- **`@blog/shared` ships TypeScript source** (`main: ./src/index.ts`). `apps/api` therefore builds with **tsup + `noExternal: ['@blog/shared']`**, which inlines it. Verified: the bundle runs on plain `node` with no tsx and no shared package at runtime. Do not add a root `tsc --build` — CLAUDE.md records that it was tried and reverted.
- **`req.params` typing is a landmine here**, because `tsconfig.base.json` sets `noUncheckedIndexedAccess: true`:
  - Inside a handler registered on a literal path (`router.get('/:slug', h)`), Express infers the params and **`req.params.slug` is a plain `string`**. Nothing to do.
  - In a **standalone** middleware or loader typed with a bare `Request`, `params` is an index signature, so `req.params.slug` is **`string | string[] | undefined`** — note the `string[]`, which means `?? ''` does **not** rescue it.
  - Fix: type the function to its route — `Request<{ slug: string }>` / `RequestHandler<{ id: string }>` — and make any middleware factory that accepts such a function generic over the params (see Task 4's `requireOwner`). A non-generic `load: (req: Request) => ...` parameter **rejects** a `Request<{slug: string}>` loader on contravariance.
- **Double-indexing any array-typed value fails `tsc --noEmit` under `noUncheckedIndexedAccess`, even when it runs fine under vitest** — this bit twice, same root cause, two different arrays:
  - `vi.fn().mock.calls[0][0]`, found during Task 4/5 execution (three parallel agents building Tasks 4, 5, and 7 all hit it independently). Fix: `next.mock.calls[0]?.[0]` — optional chain on the *second* index only.
  - `res.headers['set-cookie'][0]` (a supertest `Response`), found in Task 6's own Step-1 test code. Fix, same shape: `res.headers['set-cookie']?.[0]`.
  - In both cases `tsc` flags the second index because the first index already produced a possibly-undefined value (`T | undefined`) under this flag; vitest's runtime types don't surface this, only `tsc` does. **The general rule:** any time a test chains two `[...]` indexes on an array/tuple-shaped value (mock calls, header arrays, split results, etc.), add `?.` before the second index. This is now the standard idiom in every test file in this plan — don't reintroduce the unguarded double-index form in Tasks 9/10 if a similar pattern shows up.

**Version pins — do NOT upgrade these in P1:**

| Package | Pin | Why not the latest |
|---|---|---|
| `zod` | `^3.24.0` | v4 is out (4.4.3) and is breaking: `z.string().email()` → `z.email()`, `.flatten()` deprecated. The existing schemas use v3 idioms. A Zod migration is its own branch. |
| `mongoose` | `^8.9.0` | v9 is out (9.7.4). Spec §2 says Mongoose 8. |
| `vitest` | `^2.1.0` | v4 is out. Not P1's job. |
| `bcryptjs` | `^2.4.3` | v3 is ESM-first with a changed API. The carried-forward service and its tests use v2. |

**Rules:**

- **Node >= 22** (`.nvmrc` = 22).
- **Never hardcode a secret, token, or connection string in source.** `SESSION_SECRET` has **no fallback default** — the app must refuse to boot without it. `.env` is gitignored; `.env.example` documents every variable with no real values.
- **Identity is always `req.session.userId`.** Never trust a body field for identity. This is the fix for all five legacy authorization holes.
- **Middleware order is load-bearing:** `helmet → json → session → routers → 404 → error handler`. The error handler is always last.
- **Business logic lives in `src/lib/services/`.** Routers authenticate, authorize, validate, delegate. Never put business logic in a route handler.
- **Gating happens at the serialization boundary** (the service), never in a handler or a component.
- **No `any`** — `@typescript-eslint/no-explicit-any` is an error.
- **Commit messages carry no Claude attribution** and no `Co-Authored-By` trailer.
- **Never push to `master` and never deploy to production without asking, every time.** Task 15 stops for this.
- After each task: `npm run typecheck && npm run lint && npm run test` must all pass before committing.

---

## File Structure

**Modified at the root:**

| File | Change |
|---|---|
| `package.json` | `typecheck` → per-workspace fanout; `seed` → `@blog/api`; add `build` |
| `eslint.config.mjs` | drop the dead `**/.next/**` ignore; add `argsIgnorePattern: '^_'` (**required** — see Task 1) |
| `.env.example` | replace the Auth.js vars with session vars |

**Modified in `packages/shared`:**

| File | Change |
|---|---|
| `src/errors.ts` | add `ValidationError` (§10 requires it; it does not exist yet) and `ConflictError` |
| `src/schemas/post.ts` | `UpdatePostSchema` drops `postId` and becomes partial — the slug now identifies the post in the URL |
| `src/models/user.ts`, `src/models/post.ts` | correct stale comments (S3 → Cloudinary, Server Actions → API, P4 → P5) |

**Created in `apps/api`:**

```
apps/api/
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── Dockerfile
└── src/
    ├── index.ts                     # composition root: env → redis → db → app → listen
    ├── app.ts                       # buildApp(): middleware order, routers, error handler
    ├── static.ts                    # SPA catch-all (Express 5 /*splat), prod only
    ├── types/express-session.d.ts   # SessionData augmentation
    ├── lib/
    │   ├── env.ts                   # Zod-validated env; no secret fallbacks
    │   ├── redis.ts                 # globalThis-cached node-redis client
    │   ├── session.ts               # express-session + connect-redis wiring
    │   └── services/
    │       ├── user.ts              # signup, verifyCredentials, profile ops
    │       ├── post.ts              # CRUD + gating + slug + teaser
    │       └── like.ts              # idempotent like/unlike
    ├── middleware/
    │   ├── require-auth.ts
    │   ├── require-owner.ts
    │   ├── validate.ts
    │   ├── not-found.ts
    │   └── error-handler.ts
    ├── routes/v1/
    │   ├── index.ts                 # mounts v1 routers + /health
    │   ├── auth.ts
    │   ├── posts.ts
    │   └── users.ts
    ├── scripts/seed.ts
    └── test/helpers.ts              # shared mongodb-memory-server + agent helpers
```

**Created at the root:** `.dockerignore`, `compose.yaml`, `compose.e2e.yaml`, `render.yaml`, `.github/workflows/ci.yml`

### Two decisions this plan makes that the spec does not spell out

1. **`buildApp({ session })` takes one grouped, all-or-nothing session config** (`{ store, secret, secure }`, the same `SessionOptions` type `lib/session.ts` declares) rather than three independent optional fields. Integration tests pass `MemoryStore`; the composition root passes `RedisStore` and `env.SESSION_SECRET`. Grouping the fields means there is no per-field fallback and no default secret living in `app.ts` — a caller either supplies a complete, real session config or gets no session middleware at all. Test files that need a working session but don't care about its secret use `buildTestApp()` from `apps/api/src/test/helpers.ts`, which is deliberately outside anything `src/index.ts` ever imports (unreachable from the tsup bundle and the Docker image), so the test-only secret it holds cannot end up in production by construction, not by convention. This keeps the whole Supertest suite runnable with no Redis container; real Redis is exercised by the Compose e2e stack in Task 12.
2. **`ConflictError` → 409 is added** alongside the four error types §10 lists. Duplicate username/email is a conflict, not a validation failure, and §3 says "prefer correct HTTP semantics over convenience." This is an addition consistent with the spec, not a contradiction of it.

---

## Task 1: Root config re-shape and `packages/shared` corrections

The branch was cut from `staging`, so the per-workspace typecheck fanout and lint fixes that lived on the abandoned `dev/web-app-scaffold` are **not here** — spec §13 lists them as carried forward. This task re-establishes them and closes three real gaps in `packages/shared`.

**Files:**
- Modify: `package.json`
- Modify: `eslint.config.mjs`
- Modify: `.env.example`
- Modify: `packages/shared/src/errors.ts`
- Modify: `packages/shared/src/schemas/post.ts`
- Modify: `packages/shared/src/models/user.ts`
- Modify: `packages/shared/src/models/post.ts`
- Modify: `packages/shared/package.json`
- Test: `packages/shared/src/errors.test.ts` (create)
- Test: `packages/shared/src/schemas/schemas.test.ts` (modify)

**Interfaces:**
- Produces:
  - `ValidationError(message: string, fields?: Record<string, string[]>)` — has `.fields`
  - `ConflictError(message: string)`
  - `UpdatePostSchema` — `CreatePostSchema.partial()`, **no `postId`**
  - `type UpdatePost = z.infer<typeof UpdatePostSchema>` — every field optional
  - root script `npm run typecheck` — fans out to each workspace
- Consumes: nothing (first task)

- [ ] **Step 1: Write the failing test for the two new error types**

Create `packages/shared/src/errors.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { ConflictError, ValidationError } from './errors.js'

describe('ValidationError', () => {
  it('carries per-field messages so the API can return them verbatim', () => {
    const err = new ValidationError('Invalid input.', { title: ['Title must be at least 3 characters'] })
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe('ValidationError')
    expect(err.fields).toEqual({ title: ['Title must be at least 3 characters'] })
  })

  it('defaults fields to an empty object so callers never guard on undefined', () => {
    expect(new ValidationError('Invalid input.').fields).toEqual({})
  })
})

describe('ConflictError', () => {
  it('is a distinct type so the error handler can map it to 409', () => {
    const err = new ConflictError('That username is taken.')
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe('ConflictError')
    expect(err.message).toBe('That username is taken.')
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm run test -- packages/shared/src/errors.test.ts`
Expected: FAIL — `No "ValidationError" export is defined on the "./errors.js" mock` / `SyntaxError: The requested module './errors.js' does not provide an export named 'ValidationError'`

- [ ] **Step 3: Add the two error types**

Append to `packages/shared/src/errors.ts` (leave the three existing classes untouched):

```ts
/** 400 — input failed schema validation. `fields` mirrors Zod's flatten().fieldErrors. */
export class ValidationError extends Error {
  readonly fields: Record<string, string[]>
  constructor(message = 'Invalid input.', fields: Record<string, string[]> = {}) {
    super(message)
    this.name = 'ValidationError'
    this.fields = fields
  }
}

/** 409 — the request is well-formed but conflicts with existing state (duplicate username/email). */
export class ConflictError extends Error {
  constructor(message = 'That already exists.') {
    super(message)
    this.name = 'ConflictError'
  }
}
```

- [ ] **Step 4: Run it and confirm it passes**

Run: `npm run test -- packages/shared/src/errors.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Write the failing test for the reshaped `UpdatePostSchema`**

`UpdatePostSchema` currently is `CreatePostSchema.extend({ postId: z.string().min(1) })`. That belonged to a Server Action that received the post id in the form body. The REST design identifies the post by `:slug` in the URL, and `PATCH` is partial by definition — so `postId` must go and every field becomes optional.

Append to `packages/shared/src/schemas/schemas.test.ts`:

```ts
describe('UpdatePostSchema', () => {
  it('accepts a partial update — PATCH does not require every field', () => {
    const result = UpdatePostSchema.safeParse({ title: 'Just The New Title' })
    expect(result.success).toBe(true)
  })

  it('accepts an empty object — a no-op PATCH is valid, not a 400', () => {
    expect(UpdatePostSchema.safeParse({}).success).toBe(true)
  })

  it('still enforces field rules on the fields that ARE present', () => {
    const result = UpdatePostSchema.safeParse({ title: 'no' })
    expect(result.success).toBe(false)
  })

  it('does not carry postId — the slug in the URL identifies the post', () => {
    const parsed = UpdatePostSchema.parse({ title: 'A Valid Title', postId: 'attacker-supplied' })
    expect(parsed).not.toHaveProperty('postId')
  })
})
```

Make sure `UpdatePostSchema` is in that file's import from `./post.js`.

- [ ] **Step 6: Run it and confirm it fails**

Run: `npm run test -- packages/shared/src/schemas/schemas.test.ts`
Expected: FAIL — the partial and empty-object cases fail because `postId`, `title` and `body` are still required.

- [ ] **Step 7: Reshape `UpdatePostSchema`**

In `packages/shared/src/schemas/post.ts`, replace the `UpdatePostSchema` declaration:

```ts
// PATCH /api/v1/posts/:slug — the slug identifies the post, so the body carries
// no id, and every field is optional. A body field must never identify a
// resource or its owner (spec §5).
export const UpdatePostSchema = CreatePostSchema.partial()
```

Leave `export type UpdatePost = z.infer<typeof UpdatePostSchema>` as it is — it re-infers automatically.

- [ ] **Step 8: Run it and confirm it passes**

Run: `npm run test -- packages/shared/src/schemas/schemas.test.ts`
Expected: PASS

- [ ] **Step 9: Fix the root `package.json`**

Two things are broken on this branch: `typecheck` uses the root `tsc --build` that CLAUDE.md says was tried and reverted, and `seed` points at `@blog/web`, a workspace that does not exist. Replace the `scripts` block:

```json
  "scripts": {
    "dev": "docker compose watch",
    "build": "npm run build --workspaces --if-present",
    "typecheck": "npm run typecheck --workspaces --if-present",
    "lint": "eslint .",
    "test": "vitest run",
    "test:e2e": "playwright test",
    "seed": "npm run seed --workspace=@blog/api"
  },
```

- [ ] **Step 10: Give `packages/shared` a `typecheck` script**

The fanout only works if each workspace declares one. Add to `packages/shared/package.json`:

```json
  "scripts": {
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
```

Place it after `"exports"` and before `"dependencies"`.

- [ ] **Step 11: Fix `eslint.config.mjs` — this is REQUIRED, not cosmetic**

An Express error handler **must** declare four parameters or Express does not recognize it as an error handler. The fourth is unused. Under the current config that is a lint **error** (verified: `'_next' is defined but never used`), so `npm run lint` would fail the moment Task 2 lands. Replace the file:

```js
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/dist/**', '**/coverage/**', '**/test-results/**'] },
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      // Express identifies an error handler by its ARITY: (err, req, res, next).
      // The unused params are structural, not sloppiness — allow the _ prefix.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },
)
```

The `**/.next/**` ignore is dropped — there is no Next.js in this repo any more.

- [ ] **Step 12: Rewrite `.env.example`**

It still documents the Auth.js variables. Replace the whole file:

```bash
# Copy to .env and fill in. NEVER commit .env — it is gitignored.
# Every value here is a placeholder: no real credential belongs in this file.

# --- Required ---
# Mongo connection string. Local dev uses the Compose container.
MONGODB_URI=mongodb://localhost:27017/blogchat
# Redis connection string. Local dev uses the Compose container.
REDIS_URL=redis://localhost:6379
# Signs the session cookie. Generate with: openssl rand -base64 32
# There is NO fallback: the API refuses to boot without this.
SESSION_SECRET=generate-me-with-openssl-rand-base64-32

# --- Optional ---
# Port the API listens on.
PORT=3000
# Directory holding the built SPA. Unset in P1 (no client yet); set in P2.
# CLIENT_DIST=../client/dist
```

- [ ] **Step 13: Correct the stale comments in the shared models**

These reference a stack and a phase plan that no longer exist. In `packages/shared/src/models/user.ts`:

```ts
    image: { type: String },    // Cloudinary public ID
    // TODO(P5): no Zod schema covers `bio` yet — there is no profile-update
    // feature in P1. Add a matching length bound here once one exists.
```

In `packages/shared/src/models/post.ts`, replace the comment above `title`:

```ts
    // Bounds mirror CreatePostSchema as defense-in-depth: Zod guards the API
    // boundary, and scripts/seed.ts writes to PostModel directly.
```

and the comment above the text index (full-text search is P5 — `dev/media-and-search` — not P4):

```ts
// Full-text search (used in P5). Replaces the legacy client-side .includes() filter.
```

- [ ] **Step 14: Run the full gate**

Run: `npm run typecheck && npm run lint && npm run test`
Expected: all three pass. `typecheck` now prints `@blog/shared` running its own `tsc --noEmit` instead of a root build.

- [ ] **Step 15: Commit**

```bash
git add package.json eslint.config.mjs .env.example packages/shared
git commit -m "chore: re-establish workspace config and correct shared package for the REST design

- typecheck fans out per workspace (no root tsc --build; see CLAUDE.md)
- eslint allows _-prefixed unused args: Express error handlers need arity 4
- add ValidationError (spec §10 requires it) and ConflictError (409)
- UpdatePostSchema drops postId and goes partial: the slug identifies the post
- .env.example documents session vars, not the withdrawn Auth.js ones"
```

---

## Task 2: `apps/api` skeleton — middleware order, error handler, health

The first runnable Express app. It ships the middleware chain and the error translation layer, and an integration test asserts the ordering that the legacy app got wrong.

**Files:**
- Create: `apps/api/package.json`, `apps/api/tsconfig.json`, `apps/api/tsup.config.ts`
- Create: `apps/api/src/lib/env.ts`
- Create: `apps/api/src/middleware/error-handler.ts`, `apps/api/src/middleware/not-found.ts`
- Create: `apps/api/src/routes/v1/index.ts`
- Create: `apps/api/src/app.ts`
- Test: `apps/api/src/app.test.ts`

**Interfaces:**
- Consumes: `ValidationError`, `ConflictError`, `UnauthorizedError`, `ForbiddenError`, `NotFoundError` from `@blog/shared` (Task 1)
- Produces:
  - `buildApp(opts: { sessionStore?: session.Store }): express.Express`
  - `errorHandler: ErrorRequestHandler`
  - `notFound: RequestHandler`
  - `env: { NODE_ENV, PORT, MONGODB_URI, REDIS_URL, SESSION_SECRET, CLIENT_DIST? }`
  - `v1Router: Router` mounted at `/api/v1`
  - Error JSON shape — **every** later task depends on this exact shape:
    ```json
    { "error": { "message": "...", "fields": { "title": ["..."] } } }
    ```
    `fields` is present only on a 400.

- [ ] **Step 1: Create the workspace manifest**

Create `apps/api/package.json`:

```json
{
  "name": "@blog/api",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsup",
    "start": "node dist/index.js",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "seed": "tsx src/scripts/seed.ts"
  },
  "dependencies": {
    "@blog/shared": "*",
    "bcryptjs": "^2.4.3",
    "connect-redis": "^9.0.0",
    "express": "^5.2.1",
    "express-session": "^1.19.0",
    "helmet": "^8.3.0",
    "redis": "^6.1.0",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "@types/express": "^5.0.6",
    "@types/express-session": "^1.19.0",
    "@types/supertest": "^7.2.1",
    "mongodb-memory-server": "^10.1.0",
    "supertest": "^7.2.2",
    "tsup": "^8.5.1",
    "tsx": "^4.23.1"
  }
}
```

`redis` is a direct dependency because `connect-redis@9` peer-depends on it and `src/lib/redis.ts` imports `createClient` itself.

- [ ] **Step 2: Create the TypeScript and build config**

Create `apps/api/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "noEmit": true,
    "composite": false,
    "declaration": false,
    "lib": ["ES2022"],
    "types": ["node"]
  },
  "include": ["src/**/*", "tsup.config.ts"]
}
```

`composite: false` and `declaration: false` override `tsconfig.base.json`: this is an application that emits via tsup, not a library. (`declaration: true` inherited from the base is what produced the TS2742 failure on the abandoned branch.) `lib` drops `DOM` — this is a Node process.

Create `apps/api/tsup.config.ts`:

```ts
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node22',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  // @blog/shared ships TypeScript source (main: ./src/index.ts), so it must be
  // bundled in. Left external, `node dist/index.js` would try to import raw .ts
  // at runtime and crash.
  noExternal: ['@blog/shared'],
})
```

- [ ] **Step 3: Install**

Run: `npm install`
Expected: `@blog/api` is linked into the workspace; `added N packages`.

- [ ] **Step 4: Write the env module**

Create `apps/api/src/lib/env.ts`:

```ts
import { z } from 'zod'

// Validate the environment once, at boot, and fail loudly. A missing
// SESSION_SECRET must stop the process — never fall back to a default, because
// a hardcoded fallback silently makes every production session forgeable.
const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters'),
  CLIENT_DIST: z.string().optional(),
})

export type Env = z.infer<typeof EnvSchema>

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = EnvSchema.safeParse(source)
  if (!result.success) {
    const details = Object.entries(result.error.flatten().fieldErrors)
      .map(([key, messages]) => `  ${key}: ${messages?.join(', ')}`)
      .join('\n')
    throw new Error(`Invalid environment:\n${details}`)
  }
  return result.data
}
```

- [ ] **Step 5: Write the failing test for the middleware chain**

Create `apps/api/src/app.test.ts`:

```ts
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { buildApp } from './app.js'

const app = buildApp({})

describe('middleware order', () => {
  // The legacy app.js:19 registered cors() AFTER the routers, so it never ran.
  // Order is load-bearing; assert it rather than trusting it.
  it('runs helmet before the routers — security headers are present on a route response', async () => {
    const res = await request(app).get('/api/v1/health')
    expect(res.status).toBe(200)
    expect(res.headers['x-dns-prefetch-control']).toBe('off')
    expect(res.headers['x-content-type-options']).toBe('nosniff')
  })

  it('parses a JSON body before the routers reach it', async () => {
    const res = await request(app).post('/api/v1/echo-test').send({ hello: 'world' })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ hello: 'world' })
  })

  it('sends a malformed JSON body to the error handler, not to a router', async () => {
    const res = await request(app)
      .post('/api/v1/echo-test')
      .set('Content-Type', 'application/json')
      .send('{"broken": ')
    expect(res.status).toBe(400)
    expect(res.body.error.message).toMatch(/json/i)
  })
})

describe('404 handler', () => {
  it('returns the standard error shape for an unknown API route', async () => {
    const res = await request(app).get('/api/v1/does-not-exist')
    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: { message: 'Route not found: GET /api/v1/does-not-exist' } })
  })
})

describe('error handler', () => {
  it('translates a thrown NotFoundError to 404 with the standard shape', async () => {
    const res = await request(app).get('/api/v1/throw-test/not-found')
    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: { message: 'Nothing here.' } })
  })

  it('translates a thrown ValidationError to 400 and includes field errors', async () => {
    const res = await request(app).get('/api/v1/throw-test/validation')
    expect(res.status).toBe(400)
    expect(res.body).toEqual({
      error: { message: 'Invalid input.', fields: { title: ['Too short'] } },
    })
  })

  it('translates an async rejection — Express 5 forwards it with no try/catch', async () => {
    const res = await request(app).get('/api/v1/throw-test/async-forbidden')
    expect(res.status).toBe(403)
  })

  it('does not leak an unexpected error message to the client', async () => {
    const res = await request(app).get('/api/v1/throw-test/boom')
    expect(res.status).toBe(500)
    // The real message ("db password rejected") must never reach the client.
    expect(res.body).toEqual({ error: { message: 'Internal server error.' } })
  })
})
```

- [ ] **Step 6: Run it and confirm it fails**

Run: `npm run test -- apps/api/src/app.test.ts`
Expected: FAIL — `Cannot find module './app.js'`

- [ ] **Step 7: Write the error handler**

Create `apps/api/src/middleware/error-handler.ts`:

```ts
import type { ErrorRequestHandler } from 'express'
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '@blog/shared'

/**
 * The ONE place a thrown error becomes an HTTP response. Services throw typed
 * errors; handlers never build an error response ad hoc. Must be registered
 * LAST, and must keep all four parameters — Express identifies an error handler
 * by arity, so dropping `_next` silently turns this into a normal middleware.
 */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof ValidationError) {
    res.status(400).json({ error: { message: err.message, fields: err.fields } })
    return
  }
  if (err instanceof UnauthorizedError) {
    res.status(401).json({ error: { message: err.message } })
    return
  }
  if (err instanceof ForbiddenError) {
    res.status(403).json({ error: { message: err.message } })
    return
  }
  if (err instanceof NotFoundError) {
    res.status(404).json({ error: { message: err.message } })
    return
  }
  if (err instanceof ConflictError) {
    res.status(409).json({ error: { message: err.message } })
    return
  }

  // express.json() rejects a malformed body with a SyntaxError carrying status 400.
  if (err instanceof SyntaxError && 'body' in err) {
    res.status(400).json({ error: { message: 'Malformed JSON body.' } })
    return
  }

  // Anything reaching here is a bug, not an expected outcome. Log it server-side
  // and return an opaque message: internal messages can carry connection strings.
  console.error(`Unhandled error on ${req.method} ${req.originalUrl}:`, err)
  res.status(500).json({ error: { message: 'Internal server error.' } })
}
```

- [ ] **Step 8: Write the 404 handler**

Create `apps/api/src/middleware/not-found.ts`:

```ts
import type { RequestHandler } from 'express'
import { NotFoundError } from '@blog/shared'

/**
 * Registered after every router and before the error handler: any request that
 * matched no route lands here and is converted into the standard error shape.
 */
export const notFound: RequestHandler = (req, _res, next) => {
  next(new NotFoundError(`Route not found: ${req.method} ${req.originalUrl}`))
}
```

- [ ] **Step 9: Write the v1 router with health and the test-only routes**

Create `apps/api/src/routes/v1/index.ts`:

```ts
import { Router } from 'express'
import { ForbiddenError, NotFoundError, ValidationError } from '@blog/shared'

export const v1Router = Router()

// Liveness probe. Used by the Compose healthcheck and the CI smoke test.
v1Router.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})

// Routes that exist only to let app.test.ts assert the middleware chain from the
// outside. Registered only outside production so they can never ship.
if (process.env.NODE_ENV !== 'production') {
  v1Router.post('/echo-test', (req, res) => {
    res.json(req.body)
  })
  v1Router.get('/throw-test/not-found', () => {
    throw new NotFoundError('Nothing here.')
  })
  v1Router.get('/throw-test/validation', () => {
    throw new ValidationError('Invalid input.', { title: ['Too short'] })
  })
  v1Router.get('/throw-test/async-forbidden', async () => {
    await Promise.resolve()
    throw new ForbiddenError()
  })
  v1Router.get('/throw-test/boom', () => {
    throw new Error('db password rejected')
  })
}
```

- [ ] **Step 10: Write `app.ts`**

Create `apps/api/src/app.ts`:

```ts
import express from 'express'
import type session from 'express-session'
import helmet from 'helmet'
import { errorHandler } from './middleware/error-handler.js'
import { notFound } from './middleware/not-found.js'
import { v1Router } from './routes/v1/index.js'

export type BuildAppOptions = {
  /**
   * Session store. The composition root passes RedisStore; integration tests
   * pass express-session's MemoryStore so the suite needs no Redis container.
   * Wired in Task 3 — until then the chain runs without a session middleware.
   */
  sessionStore?: session.Store
  /** Behind Render's proxy this must be set, or Secure cookies are dropped. */
  trustProxy?: boolean
}

/**
 * Builds the Express app. Order is load-bearing and asserted by app.test.ts:
 *   helmet → json → session → routers → 404 → error handler
 */
export function buildApp(_opts: BuildAppOptions): express.Express {
  const app = express()

  app.use(helmet())
  app.use(express.json({ limit: '100kb' }))
  // session goes here — Task 3
  app.use('/api/v1', v1Router)
  // static SPA catch-all goes here — Task 11
  app.use(notFound)
  app.use(errorHandler)

  return app
}
```

- [ ] **Step 11: Run the test and confirm it passes**

Run: `npm run test -- apps/api/src/app.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 12: Gate**

Run: `npm run typecheck && npm run lint`
Expected: both pass.

Do **not** run `npm run build` yet — tsup's entry is `src/index.ts`, the composition root, which Task 11 creates. The build is first exercised in Task 11 Step 7.

- [ ] **Step 13: Commit**

```bash
git add apps/api package.json package-lock.json
git commit -m "feat(api): express app skeleton with asserted middleware order

- buildApp() composes helmet → json → session → routers → 404 → error handler
- error handler is the single place typed errors become status codes
- unexpected errors return an opaque 500: internal messages can carry secrets
- env is Zod-validated at boot; SESSION_SECRET has no fallback
- integration test asserts the chain, incl. Express 5 async rejection forwarding"
```

---

## Task 3: Session wiring — Redis client, store, cookie policy

**Files:**
- Create: `apps/api/src/lib/redis.ts`
- Create: `apps/api/src/lib/session.ts`
- Create: `apps/api/src/types/express-session.d.ts`
- Create: `apps/api/src/test/helpers.ts` (`buildTestApp()` — pulled forward from Task 5)
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/routes/v1/index.ts` (add a test-only session route)
- Test: `apps/api/src/lib/session.test.ts`

**Interfaces:**
- Consumes: `buildApp`, `env` (Task 2)
- Produces:
  - `getRedis(url: string): Promise<RedisClientType>` — globalThis-cached
  - `buildSessionMiddleware(opts: SessionOptions): RequestHandler` where `SessionOptions = { store: session.Store; secret: string; secure: boolean }`
  - `BuildAppOptions.session?: SessionOptions` — grouped, all-or-nothing. There is no per-field default and no fallback secret in `app.ts`: a caller either supplies a complete real config or gets no session middleware. This is a correction made during implementation — see the note after Step 6.
  - `buildTestApp(overrides?: Partial<BuildAppOptions>): express.Express` (`apps/api/src/test/helpers.ts`) — wraps `buildApp` with an in-memory store and a fixed test-only secret, for tests that need a working session but don't care about its value. Because `src/index.ts` never imports anything under `src/test/`, this secret is unreachable from the tsup bundle and the Docker image — isolation by construction, not by convention. Later tasks (6, 8, 9, 10) use this instead of hand-rolling `sessionStore: new session.MemoryStore()`.
  - `req.session.userId?: string` and `req.session.username?: string` (module augmentation) — **every later task reads these**

- [ ] **Step 1: Augment the session type**

Create `apps/api/src/types/express-session.d.ts`:

```ts
import 'express-session'

declare module 'express-session' {
  interface SessionData {
    /** The ONLY source of caller identity. Never read identity from a body field. */
    userId?: string
    username?: string
  }
}
```

- [ ] **Step 2: Write the cached Redis client**

Create `apps/api/src/lib/redis.ts`:

```ts
import { createClient, type RedisClientType } from 'redis'

type Cache = { client: RedisClientType | null; promise: Promise<RedisClientType> | null }

// Cached on globalThis for the same reason as packages/shared/src/db.ts: tsx
// watch reloads modules on every save, and a fresh createClient() per reload
// exhausts Render's free Key Value connection cap (50) in a few minutes.
const globalCache = globalThis as typeof globalThis & { _redis?: Cache }
const cache: Cache = (globalCache._redis ??= { client: null, promise: null })

export async function getRedis(url: string): Promise<RedisClientType> {
  if (cache.client) return cache.client
  cache.promise ??= (async () => {
    const client: RedisClientType = createClient({ url })
    client.on('error', (err) => console.error('Redis client error:', err))
    await client.connect()
    return client
  })()
  cache.client = await cache.promise
  return cache.client
}
```

- [ ] **Step 3: Write the failing test for the cookie policy**

Create `apps/api/src/lib/session.test.ts`:

```ts
import session from 'express-session'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { buildApp } from '../app.js'

const SECRET = 'test-secret-at-least-32-characters-long'

function appWith(secure: boolean, trustProxy = false) {
  return buildApp({
    session: { store: new session.MemoryStore(), secret: SECRET, secure },
    trustProxy,
  })
}

/**
 * Reads the Set-Cookie header for our session cookie, or '' if absent.
 * When `secure` and `trustProxy` are both true, sends X-Forwarded-Proto:
 * https — this is what express-session actually checks (see issecure() in
 * express-session/index.js). Render's proxy sends this header for real; a
 * plain supertest request never looks secure without it.
 */
async function sessionCookie(secure: boolean, trustProxy = false, path = '/api/v1/session-test/login') {
  const req = request(appWith(secure, trustProxy)).post(path)
  if (trustProxy) req.set('X-Forwarded-Proto', 'https')
  const res = await req.send({})
  const raw = res.headers['set-cookie']
  const cookies = Array.isArray(raw) ? raw : raw ? [raw] : []
  return cookies.find((c) => c.startsWith('sid=')) ?? ''
}

describe('session cookie policy', () => {
  it('is httpOnly — JavaScript cannot read it, unlike the legacy localStorage JWT', async () => {
    expect(await sessionCookie(false)).toMatch(/HttpOnly/i)
  })

  it('is SameSite=Lax — the only CSRF defense, and sufficient because we are same-origin', async () => {
    expect(await sessionCookie(false)).toMatch(/SameSite=Lax/i)
  })

  it('is named sid, not the default connect.sid — no need to advertise the stack', async () => {
    expect(await sessionCookie(false)).toMatch(/^sid=/)
  })

  it('is Secure in production — behind Render, trustProxy + X-Forwarded-Proto make the request look secure', async () => {
    expect(await sessionCookie(true, true)).toMatch(/Secure/i)
  })

  it('withholds the cookie entirely if secure is true but the request is not actually secure', async () => {
    // express-session does not merely omit the Secure attribute here — it
    // refuses to send Set-Cookie at all. Proven by reading its source rather
    // than assumed: cookie.secure && !issecure() short-circuits before touch.
    expect(await sessionCookie(true, false)).toBe('')
  })

  it('is NOT Secure in dev — a Secure cookie over plain http:// is silently dropped', async () => {
    expect(await sessionCookie(false)).not.toMatch(/Secure/i)
  })
})

describe('session lifecycle', () => {
  it('does not set a cookie for an anonymous request (saveUninitialized: false)', async () => {
    // Otherwise every crawler hit writes a session into a 25 MB Redis.
    const res = await request(appWith(false)).get('/api/v1/health')
    expect(res.headers['set-cookie']).toBeUndefined()
  })

  it('round-trips userId across requests on the same agent', async () => {
    const agent = request.agent(appWith(false))
    await agent.post('/api/v1/session-test/login').send({})
    const res = await agent.get('/api/v1/session-test/whoami')
    expect(res.body).toEqual({ userId: 'user-123' })
  })
})
```

> **Why `trustProxy` matters here, not just `secure`:** `express-session` decides whether a
> request "is secure" via its own `issecure()` check, which only trusts `X-Forwarded-Proto`
> when the app has `trust proxy` enabled. Passing `secure: true` alone, against a plain
> supertest request with no trust-proxy setup, doesn't just omit the `Secure` attribute — it
> makes `express-session` withhold `Set-Cookie` entirely (verified by reading
> `express-session/index.js`: `if (cookie.secure && !issecure(req, trustProxy)) return`). The
> two options are coupled by design, and that coupling matches Render's real topology: TLS
> terminates at Render's proxy, which forwards `X-Forwarded-Proto: https`, and `trustProxy`
> is exactly what makes Express believe that header.

- [ ] **Step 4: Run it and confirm it fails**

Run: `npm run test -- apps/api/src/lib/session.test.ts`
Expected: FAIL — `buildApp` does not accept a `session` option, and `/api/v1/session-test/*` does not exist.

- [ ] **Step 5: Write the session middleware factory**

Create `apps/api/src/lib/session.ts`:

```ts
import session from 'express-session'
import type { RequestHandler } from 'express'

const ONE_WEEK_MS = 1000 * 60 * 60 * 24 * 7

export type SessionOptions = {
  store: session.Store
  secret: string
  /** true in production only: a Secure cookie is dropped over plain http://. */
  secure: boolean
}

export function buildSessionMiddleware({ store, secret, secure }: SessionOptions): RequestHandler {
  return session({
    store,
    secret,
    name: 'sid', // not the default connect.sid — don't advertise the stack
    resave: false,
    // Do NOT persist a session for a request that never wrote to it. Otherwise
    // every anonymous read allocates a Redis key on a 25 MB instance.
    saveUninitialized: false,
    cookie: {
      httpOnly: true, // JS cannot read it — removes the legacy XSS token-theft path
      sameSite: 'lax', // the CSRF defense; sufficient ONLY because we are same-origin
      secure,
      maxAge: ONE_WEEK_MS,
      path: '/',
    },
  })
}
```

- [ ] **Step 6: Wire the session into `app.ts` — grouped config, no fallback secret**

Replace `apps/api/src/app.ts` in full:

```ts
import express from 'express'
import helmet from 'helmet'
import { buildSessionMiddleware, type SessionOptions } from './lib/session.js'
import { errorHandler } from './middleware/error-handler.js'
import { notFound } from './middleware/not-found.js'
import { v1Router } from './routes/v1/index.js'

export type BuildAppOptions = {
  /**
   * Omit entirely to build an app with NO session middleware (used by tests
   * that only exercise the base chain). To enable sessions, every field of
   * SessionOptions is required TOGETHER — there is no default secret anywhere
   * in this file. index.ts always supplies the real store/secret/secure from
   * validated env; env.ts refuses to boot without SESSION_SECRET, so a
   * production app can never be built with a missing or fallback secret.
   */
  session?: SessionOptions
  /** Behind Render's proxy this must be set, or Secure cookies are dropped. */
  trustProxy?: boolean
}

/**
 * Builds the Express app. Order is load-bearing and asserted by app.test.ts:
 *   helmet → json → session → routers → 404 → error handler
 */
export function buildApp(opts: BuildAppOptions): express.Express {
  const app = express()

  if (opts.trustProxy) {
    // Render terminates TLS at a proxy. Without this Express sees the proxy's
    // IP, marks the connection insecure, and silently drops the Secure cookie.
    app.set('trust proxy', 1)
  }

  app.use(helmet())
  app.use(express.json({ limit: '100kb' }))

  if (opts.session) {
    app.use(buildSessionMiddleware(opts.session))
  }

  app.use('/api/v1', v1Router)
  // static SPA catch-all goes here — Task 11
  app.use(notFound)
  app.use(errorHandler)

  return app
}
```

> **Why this is grouped rather than three independent optional fields (`sessionStore` /
> `sessionSecret` / `secure`), and why there is no `TEST_SECRET` constant in this file:** a
> per-field `secret: opts.sessionSecret ?? TEST_SECRET` fallback is an if/else that a reader of
> `app.ts` cannot verify is safe without trusting a comment about a *different* file
> (`env.ts`). Grouping the fields means a caller either supplies a complete, real
> `SessionOptions` or gets no session middleware at all — there is no partial, no default, no
> in-between state to reason about. The test-only convenience this removes is restored in
> Step 6a below, in a location (`src/test/`) that is unreachable from the production bundle by
> construction, not by convention.

- [ ] **Step 6a: Add the test-only app builder**

Every later task's route tests need a *working* session without caring about its secret.
Rather than repeat `{ store: new session.MemoryStore(), secret: '<32-char-literal>', secure:
false }` in every test file — or reintroduce a fallback into `app.ts` — put that boilerplate
in one place that is provably test-only.

Create `apps/api/src/test/helpers.ts`:

```ts
import session from 'express-session'
import type express from 'express'
import { buildApp, type BuildAppOptions } from '../app.js'

// Test-only. Never imported by src/index.ts, so it is unreachable from the
// tsup bundle and the production image. Production secrets always come from
// validated env (apps/api/src/lib/env.ts) — this constant exists so tests that
// need a working session don't each have to invent their own 32-char string.
const TEST_SESSION_SECRET = 'test-only-secret-never-used-in-production-32c'

/**
 * Builds an app with a real (in-memory) session for tests that need one but
 * don't care about its exact secret or store. Tests asserting the cookie
 * policy itself (session.test.ts) call buildApp() directly instead.
 */
export function buildTestApp(overrides: Partial<BuildAppOptions> = {}): express.Express {
  return buildApp({
    session: { store: new session.MemoryStore(), secret: TEST_SESSION_SECRET, secure: false },
    ...overrides,
  })
}
```

(Task 5 extends this same file with `useTestDb()` — they live together as the project's one
test-infrastructure module.)

- [ ] **Step 7: Add the test-only session routes**

In `apps/api/src/routes/v1/index.ts`, inside the existing `if (process.env.NODE_ENV !== 'production')` block, append:

```ts
  v1Router.post('/session-test/login', (req, res) => {
    req.session.userId = 'user-123'
    res.json({ ok: true })
  })
  v1Router.get('/session-test/whoami', (req, res) => {
    res.json({ userId: req.session?.userId ?? null })
  })
```

- [ ] **Step 8: Run the test and confirm it passes**

Run: `npm run test -- apps/api/src/lib/session.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 9: Confirm Task 2's tests still pass**

`app.test.ts` calls `buildApp({})` with no session, so the session middleware is skipped and the chain still runs.

Run: `npm run test -- apps/api && npm run typecheck && npm run lint`
Expected: all pass.

- [ ] **Step 10: Commit**

```bash
git add apps/api
git commit -m "feat(api): session middleware on redis with a hardened cookie policy

- cookie is httpOnly + SameSite=Lax + Secure-in-prod, named sid
- saveUninitialized: false — anonymous reads must not allocate redis keys
- redis client cached on globalThis: tsx watch reloads would exhaust the 50-conn cap
- BuildAppOptions.session groups store/secret/secure: no per-field fallback,
  no default secret in app.ts; buildTestApp() isolates the test-only secret
  in src/test/, unreachable from the production bundle
- SessionData augmented with userId: the only source of caller identity"
```

---

## Task 4: `requireAuth` and `requireOwner`

Re-homed from the abandoned branch's Auth.js `auth()` calls to `req.session`, and converted from "helper you must remember to call" into real middleware. **This is the fix for all five legacy authorization holes.**

**Files:**
- Create: `apps/api/src/middleware/require-auth.ts`
- Create: `apps/api/src/middleware/require-owner.ts`
- Test: `apps/api/src/middleware/require-auth.test.ts`
- Test: `apps/api/src/middleware/require-owner.test.ts`

**Interfaces:**
- Consumes: `req.session.userId` (Task 3); `UnauthorizedError`, `ForbiddenError`, `NotFoundError` (`@blog/shared`)
- Produces:
  - `requireAuth: RequestHandler`
  - `requireOwner<P>(load: (req: Request<P>) => Promise<OwnedResource | null>): RequestHandler<P>`
  - `type OwnedResource = { author: Types.ObjectId }`

> **Why `requireOwner` is generic over `P`** (verified against `@types/express@5` with this
> repo's `noUncheckedIndexedAccess: true`): a bare `Request` types `req.params.slug` as
> `string | string[] | undefined`, so a loader written against it cannot pass a `string` to a
> service. Typing the loader `Request<{ slug: string }>` fixes that, but then handing it to a
> `load: (req: Request) => ...` parameter **fails on contravariance** —
> `Property 'slug' is missing in type 'ParamsDictionary'`. Making `requireOwner` generic and
> returning `RequestHandler<P>` resolves both: the loader sees a real `string`, and the result
> still matches the route it mounts on. Do not "simplify" this back to a bare `Request`.

- [ ] **Step 1: Write the failing test for `requireAuth`**

Create `apps/api/src/middleware/require-auth.test.ts`:

```ts
import type { NextFunction, Request, Response } from 'express'
import { UnauthorizedError } from '@blog/shared'
import { describe, expect, it, vi } from 'vitest'
import { requireAuth } from './require-auth.js'

function ctx(session: Partial<{ userId: string }> | undefined) {
  const req = { session } as unknown as Request
  const res = {} as Response
  const next = vi.fn() as unknown as NextFunction
  return { req, res, next: next as ReturnType<typeof vi.fn> }
}

describe('requireAuth', () => {
  it('calls next() with no error when a session identity is present', () => {
    const { req, res, next } = ctx({ userId: 'u1' })
    requireAuth(req, res, next)
    expect(next).toHaveBeenCalledWith()
  })

  it('passes UnauthorizedError when the session has no userId', () => {
    const { req, res, next } = ctx({})
    requireAuth(req, res, next)
    expect(next.mock.calls[0]?.[0]).toBeInstanceOf(UnauthorizedError)
  })

  it('passes UnauthorizedError when there is no session at all', () => {
    const { req, res, next } = ctx(undefined)
    requireAuth(req, res, next)
    expect(next.mock.calls[0]?.[0]).toBeInstanceOf(UnauthorizedError)
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm run test -- apps/api/src/middleware/require-auth.test.ts`
Expected: FAIL — `Cannot find module './require-auth.js'`

- [ ] **Step 3: Implement `requireAuth`**

Create `apps/api/src/middleware/require-auth.ts`:

```ts
import type { RequestHandler } from 'express'
import { UnauthorizedError } from '@blog/shared'

/**
 * 401 for anonymous callers. Mount on protected routers.
 *
 * Layer 1 of the three-layer authorization model (spec §5). It proves only that
 * SOMEONE is signed in — never that they may touch a particular resource. That
 * is requireOwner's job, and both are required.
 */
export const requireAuth: RequestHandler = (req, _res, next) => {
  if (!req.session?.userId) {
    next(new UnauthorizedError())
    return
  }
  next()
}
```

- [ ] **Step 4: Run it and confirm it passes**

Run: `npm run test -- apps/api/src/middleware/require-auth.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Write the failing test for `requireOwner`**

Create `apps/api/src/middleware/require-owner.test.ts`:

```ts
import type { NextFunction, Request, Response } from 'express'
import { ForbiddenError, NotFoundError, UnauthorizedError } from '@blog/shared'
import { Types } from 'mongoose'
import { describe, expect, it, vi } from 'vitest'
import { requireOwner } from './require-owner.js'

function ctx(userId?: string) {
  const req = { session: userId ? { userId } : {}, params: {} } as unknown as Request
  const res = {} as Response
  const next = vi.fn() as unknown as NextFunction
  return { req, res, next: next as ReturnType<typeof vi.fn> }
}

describe('requireOwner', () => {
  it('calls next() with no error when the session identity is the author', async () => {
    const id = new Types.ObjectId()
    const { req, res, next } = ctx(id.toString())
    await requireOwner(async () => ({ author: id }))(req, res, next)
    expect(next).toHaveBeenCalledWith()
  })

  it('passes ForbiddenError for a signed-in non-owner', async () => {
    // THE legacy vulnerability: post.js:42 let any signed-in user delete any post.
    const { req, res, next } = ctx(new Types.ObjectId().toString())
    await requireOwner(async () => ({ author: new Types.ObjectId() }))(req, res, next)
    expect(next.mock.calls[0]?.[0]).toBeInstanceOf(ForbiddenError)
  })

  it('passes UnauthorizedError for an anonymous caller — and never runs the loader', async () => {
    const load = vi.fn()
    const { req, res, next } = ctx(undefined)
    await requireOwner(load)(req, res, next)
    expect(next.mock.calls[0]?.[0]).toBeInstanceOf(UnauthorizedError)
    expect(load).not.toHaveBeenCalled() // don't hit the DB for a request we already reject
  })

  it('passes NotFoundError when the resource does not exist', async () => {
    const { req, res, next } = ctx(new Types.ObjectId().toString())
    await requireOwner(async () => null)(req, res, next)
    expect(next.mock.calls[0]?.[0]).toBeInstanceOf(NotFoundError)
  })

  it('forwards a loader rejection instead of swallowing it into a 403', async () => {
    const { req, res, next } = ctx(new Types.ObjectId().toString())
    const boom = new Error('db down')
    await requireOwner(async () => {
      throw boom
    })(req, res, next)
    expect(next).toHaveBeenCalledWith(boom)
  })
})
```

- [ ] **Step 6: Run it and confirm it fails**

Run: `npm run test -- apps/api/src/middleware/require-owner.test.ts`
Expected: FAIL — `Cannot find module './require-owner.js'`

- [ ] **Step 7: Implement `requireOwner`**

Create `apps/api/src/middleware/require-owner.ts`:

```ts
import type { Request, RequestHandler } from 'express'
import type { Types } from 'mongoose'
import { ForbiddenError, NotFoundError, UnauthorizedError } from '@blog/shared'

export type OwnedResource = { author: Types.ObjectId }

/**
 * 403 unless the session identity matches the resource's author.
 *
 * Layer 2 of the three-layer model (spec §5). `load` fetches the resource from
 * the request (usually by req.params.slug). The comparison is ALWAYS against
 * req.session.userId and NEVER against a body field — the legacy app trusted
 * body fields, which is exactly how /update-user became an account takeover.
 */
export const requireOwner =
  <P>(load: (req: Request<P>) => Promise<OwnedResource | null>): RequestHandler<P> =>
  async (req, _res, next) => {
    const userId = req.session?.userId
    // Check identity before touching the database: an anonymous request is
    // already rejected, so loading the resource would be a wasted query.
    if (!userId) {
      next(new UnauthorizedError())
      return
    }

    try {
      const resource = await load(req)
      if (!resource) {
        next(new NotFoundError())
        return
      }
      if (!resource.author.equals(userId)) {
        next(new ForbiddenError())
        return
      }
      next()
    } catch (err) {
      // A loader failure is a real error; it must not masquerade as a 403.
      next(err)
    }
  }
```

- [ ] **Step 8: Run it and confirm it passes**

Run: `npm run test -- apps/api/src/middleware/require-owner.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 9: Gate and commit**

Run: `npm run typecheck && npm run lint && npm run test`

```bash
git add apps/api/src/middleware
git commit -m "feat(api): requireAuth and requireOwner guards

Identity always comes from req.session.userId, never from a body field —
the root cause of all five legacy authorization holes.

- requireAuth: 401 for anonymous callers
- requireOwner(load): 403 unless the session identity is the author
- requireOwner rejects anonymous callers before querying the database
- a loader rejection forwards as itself, never as a 403"
```

---

## Task 5: Test helpers, `validate` middleware, and `userService`

**Files:**
- Modify: `apps/api/src/test/helpers.ts` (created in Task 3 with `buildTestApp()`; this task appends `useTestDb()` alongside it)
- Create: `apps/api/src/middleware/validate.ts`
- Create: `apps/api/src/lib/services/user.ts`
- Test: `apps/api/src/middleware/validate.test.ts`
- Test: `apps/api/src/lib/services/user.test.ts`

**Interfaces:**
- Consumes: `SignupSchema`, `UserModel`, `ConflictError`, `ValidationError` (`@blog/shared`)
- Produces:
  - `useTestDb(): void` — call at the top level of any test file needing Mongo
  - `validate(schema: ZodSchema): RequestHandler` — replaces `req.body` with the parsed value
  - `userService.signup(input: Signup): Promise<{ id: string; username: string }>`
  - `userService.verifyCredentials(username: string, password: string): Promise<{ id: string; username: string } | null>`
  - `userService.getPublicProfile(id: string): Promise<PublicUser>` where
    `type PublicUser = { id: string; username: string; bio?: string; image?: string; createdAt: Date }`

- [ ] **Step 1: Add the shared DB test helper alongside `buildTestApp()`**

`models.test.ts` and the abandoned `user.test.ts` each hand-rolled the same
mongodb-memory-server boilerplate. P1 adds several more DB-backed test files, so
extract it once. `apps/api/src/test/helpers.ts` already exists from Task 3
(it holds `buildTestApp()`) — append `useTestDb()` to it rather than
overwriting the file.

The file currently reads (from Task 3):

```ts
import session from 'express-session'
import type express from 'express'
import { buildApp, type BuildAppOptions } from '../app.js'

const TEST_SESSION_SECRET = 'test-only-secret-never-used-in-production-32c'

export function buildTestApp(overrides: Partial<BuildAppOptions> = {}): express.Express {
  return buildApp({
    session: { store: new session.MemoryStore(), secret: TEST_SESSION_SECRET, secure: false },
    ...overrides,
  })
}
```

Add these imports to the top and `useTestDb` below `buildTestApp` — do not remove `buildTestApp`:

```ts
import { CommentModel, LikeModel, PostModel, UserModel } from '@blog/shared'
import { MongoMemoryServer } from 'mongodb-memory-server'
import mongoose from 'mongoose'
import { afterAll, beforeAll, beforeEach } from 'vitest'

/**
 * Spins an in-memory MongoDB for the calling test file and truncates every
 * collection between tests. Call once at the top level of a test file.
 *
 * syncIndexes() is essential: unique indexes are layer 3 of the authorization
 * model, and without it Mongoose builds them lazily and the tests that assert
 * duplicate-key behaviour would silently pass for the wrong reason.
 */
export function useTestDb(): void {
  let mongod: MongoMemoryServer

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create()
    await mongoose.connect(mongod.getUri())
    await mongoose.syncIndexes()
  })

  afterAll(async () => {
    await mongoose.disconnect()
    await mongod.stop()
  })

  beforeEach(async () => {
    await Promise.all([
      UserModel.deleteMany({}),
      PostModel.deleteMany({}),
      LikeModel.deleteMany({}),
      CommentModel.deleteMany({}),
    ])
  })
}
```

- [ ] **Step 2: Write the failing test for `validate`**

Create `apps/api/src/middleware/validate.test.ts`:

```ts
import type { NextFunction, Request, Response } from 'express'
import { ValidationError } from '@blog/shared'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { validate } from './validate.js'

const Schema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters'),
  premium: z.coerce.boolean().default(false),
})

function ctx(body: unknown) {
  const req = { body } as Request
  const res = {} as Response
  const next = vi.fn() as unknown as NextFunction
  return { req, res, next: next as ReturnType<typeof vi.fn> }
}

describe('validate', () => {
  it('replaces req.body with the PARSED value, applying defaults and coercion', () => {
    // Handlers must read the parsed value: the raw body has no defaults applied.
    const { req, res, next } = ctx({ title: 'A Good Title' })
    validate(Schema)(req, res, next)
    expect(next).toHaveBeenCalledWith()
    expect(req.body).toEqual({ title: 'A Good Title', premium: false })
  })

  it('passes a ValidationError carrying Zod field errors', () => {
    const { req, res, next } = ctx({ title: 'no' })
    validate(Schema)(req, res, next)
    const err = next.mock.calls[0]?.[0]
    expect(err).toBeInstanceOf(ValidationError)
    expect(err.fields).toEqual({ title: ['Title must be at least 3 characters'] })
  })

  it('strips unknown keys so a client cannot smuggle extra fields into a handler', () => {
    // e.g. { title, author: '<someone-else>' } must never reach the service.
    const { req, res, next } = ctx({ title: 'A Good Title', author: 'attacker' })
    validate(Schema)(req, res, next)
    expect(req.body).not.toHaveProperty('author')
  })

  it('treats a missing body as an empty object rather than throwing', () => {
    const { req, res, next } = ctx(undefined)
    validate(Schema)(req, res, next)
    expect(next.mock.calls[0]?.[0]).toBeInstanceOf(ValidationError)
  })
})
```

- [ ] **Step 3: Run it and confirm it fails**

Run: `npm run test -- apps/api/src/middleware/validate.test.ts`
Expected: FAIL — `Cannot find module './validate.js'`

- [ ] **Step 4: Implement `validate`**

Create `apps/api/src/middleware/validate.ts`:

```ts
import type { RequestHandler } from 'express'
import { ValidationError } from '@blog/shared'
import type { ZodTypeAny } from 'zod'

/**
 * Validates req.body against a Zod schema and REPLACES it with the parsed
 * result, so handlers always see defaults applied, values coerced, and unknown
 * keys stripped (Zod objects are strip-by-default — a client cannot smuggle an
 * `author` field through to a service).
 *
 * The same schema validates the client form (spec §2), so the two cannot drift.
 */
export const validate =
  (schema: ZodTypeAny): RequestHandler =>
  (req, _res, next) => {
    const result = schema.safeParse(req.body ?? {})
    if (!result.success) {
      const fields = result.error.flatten().fieldErrors as Record<string, string[]>
      next(new ValidationError('Invalid input.', fields))
      return
    }
    req.body = result.data
    next()
  }
```

- [ ] **Step 5: Run it and confirm it passes**

Run: `npm run test -- apps/api/src/middleware/validate.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 6: Write the failing test for `userService`**

Carried forward from the abandoned branch, plus two new cases: the duplicate
race and the public profile.

Create `apps/api/src/lib/services/user.test.ts`:

```ts
import { ConflictError, NotFoundError, UserModel } from '@blog/shared'
import { describe, expect, it } from 'vitest'
import { useTestDb } from '../../test/helpers.js'
import { userService } from './user.js'

useTestDb()

const signup = (over: Partial<{ username: string; email: string; password: string }> = {}) =>
  userService.signup({
    username: 'yonatan',
    email: 'y@example.com',
    password: 'correct-horse',
    ...over,
  })

describe('userService.signup', () => {
  it('hashes the password — never stores plaintext', async () => {
    await signup()
    const user = await UserModel.findOne({ username: 'yonatan' })
    expect(user!.password).not.toBe('correct-horse')
    expect(user!.password).toMatch(/^\$2[aby]\$/) // bcrypt
  })

  it('uses bcrypt cost 12, not the legacy 8', async () => {
    await signup()
    const user = await UserModel.findOne({ username: 'yonatan' })
    expect(user!.password).toMatch(/^\$2[aby]\$12\$/)
  })

  it('throws ConflictError for a duplicate username', async () => {
    await signup()
    await expect(signup({ email: 'other@example.com' })).rejects.toThrow(ConflictError)
  })

  it('throws ConflictError for a duplicate email', async () => {
    await signup()
    await expect(signup({ username: 'someone-else' })).rejects.toThrow(ConflictError)
  })

  it('turns a duplicate-key race into ConflictError, not an unhandled 500', async () => {
    // Two concurrent signups both pass the findOne pre-check; one loses at the
    // unique index. That E11000 must surface as a 409, not a crash. The index is
    // the real guard — the pre-check only buys a nicer message.
    const results = await Promise.allSettled([signup(), signup()])
    const rejected = results.filter((r) => r.status === 'rejected')
    expect(rejected).toHaveLength(1)
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(ConflictError)
  })

  it('returns the new id and username', async () => {
    const result = await signup()
    expect(result.username).toBe('yonatan')
    expect(result.id).toMatch(/^[a-f0-9]{24}$/)
  })
})

describe('userService.verifyCredentials', () => {
  it('returns the user for a correct password', async () => {
    await signup()
    expect((await userService.verifyCredentials('yonatan', 'correct-horse'))?.username).toBe('yonatan')
  })

  it('returns null for a wrong password', async () => {
    await signup()
    expect(await userService.verifyCredentials('yonatan', 'wrong')).toBeNull()
  })

  it('returns null — not a distinguishable error — for an unknown username', async () => {
    // The legacy app threw "Unable to find user: <name>", leaking which usernames
    // exist. Both failure modes must be indistinguishable to the caller.
    expect(await userService.verifyCredentials('nobody', 'correct-horse')).toBeNull()
  })

  it('returns null for an OAuth user who has no password', async () => {
    await UserModel.create({ username: 'oauth', email: 'o@example.com' })
    expect(await userService.verifyCredentials('oauth', 'anything')).toBeNull()
  })
})

describe('userService.getPublicProfile', () => {
  it('never exposes the password hash or the email', async () => {
    const { id } = await signup()
    const profile = await userService.getPublicProfile(id)
    expect(profile).not.toHaveProperty('password')
    expect(profile).not.toHaveProperty('email')
    expect(profile.username).toBe('yonatan')
  })

  it('throws NotFoundError for an unknown id', async () => {
    await expect(userService.getPublicProfile('507f1f77bcf86cd799439011')).rejects.toThrow(NotFoundError)
  })

  it('throws NotFoundError for a malformed id rather than a cast error', async () => {
    await expect(userService.getPublicProfile('not-an-objectid')).rejects.toThrow(NotFoundError)
  })
})
```

- [ ] **Step 7: Run it and confirm it fails**

Run: `npm run test -- apps/api/src/lib/services/user.test.ts`
Expected: FAIL — `Cannot find module './user.js'`

- [ ] **Step 8: Implement `userService`**

Create `apps/api/src/lib/services/user.ts`:

```ts
import { ConflictError, NotFoundError, UserModel, type Signup } from '@blog/shared'
import bcrypt from 'bcryptjs'
import { Types } from 'mongoose'

const BCRYPT_COST = 12 // legacy used 8

export type PublicUser = {
  id: string
  username: string
  bio?: string
  image?: string
  createdAt: Date
}

/** MongoServerError code for a unique-index violation. */
const DUPLICATE_KEY = 11000

function isDuplicateKeyError(err: unknown): err is { code: number; keyPattern?: Record<string, 1> } {
  return typeof err === 'object' && err !== null && 'code' in err && err.code === DUPLICATE_KEY
}

export const userService = {
  async signup(input: Signup): Promise<{ id: string; username: string }> {
    // A pre-check only to produce a precise message. It is NOT the guard —
    // two concurrent signups can both pass it. The unique index is the guard,
    // and the catch below turns its E11000 into the same ConflictError.
    const existing = await UserModel.findOne({
      $or: [{ username: input.username }, { email: input.email }],
    })
    if (existing) {
      throw new ConflictError(
        existing.username === input.username
          ? 'That username is taken.'
          : 'That email is already registered.',
      )
    }

    const password = await bcrypt.hash(input.password, BCRYPT_COST)
    try {
      const user = await UserModel.create({ ...input, password })
      return { id: user._id.toString(), username: user.username }
    } catch (err) {
      if (isDuplicateKeyError(err)) {
        throw new ConflictError(
          err.keyPattern?.username ? 'That username is taken.' : 'That email is already registered.',
        )
      }
      throw err
    }
  },

  async verifyCredentials(
    username: string,
    password: string,
  ): Promise<{ id: string; username: string } | null> {
    const user = await UserModel.findOne({ username })
    // Return null for BOTH "no such user" and "wrong password" so the two are
    // indistinguishable to an attacker enumerating usernames.
    if (!user?.password) return null
    if (!(await bcrypt.compare(password, user.password))) return null
    return { id: user._id.toString(), username: user.username }
  },

  async getPublicProfile(id: string): Promise<PublicUser> {
    // A malformed id would otherwise throw a CastError and surface as a 500.
    if (!Types.ObjectId.isValid(id)) throw new NotFoundError('User not found.')

    const user = await UserModel.findById(id)
    if (!user) throw new NotFoundError('User not found.')

    // Built field by field, not by deleting from the document: a whitelist
    // cannot leak a field added to the schema later.
    return {
      id: user._id.toString(),
      username: user.username,
      bio: user.bio ?? undefined,
      image: user.image ?? undefined,
      createdAt: user.createdAt,
    }
  },
}
```

- [ ] **Step 9: Run it and confirm it passes**

Run: `npm run test -- apps/api/src/lib/services/user.test.ts`
Expected: PASS (13 tests)

- [ ] **Step 10: Gate and commit**

Run: `npm run typecheck && npm run lint && npm run test`

```bash
git add apps/api/src
git commit -m "feat(api): validate middleware and userService

- useTestDb() extracts the mongodb-memory-server boilerplate
- validate() replaces req.body with the parsed value: defaults applied,
  unknown keys stripped, so a client cannot smuggle fields into a service
- userService keeps the bcrypt-12 and username-enumeration fixes
- a duplicate-key race now surfaces as ConflictError, not an unhandled 500
- getPublicProfile whitelists fields: it cannot leak the hash or the email"
```

---

## Task 6: Auth routes

**Files:**
- Create: `apps/api/src/routes/v1/auth.ts`
- Modify: `apps/api/src/lib/session.ts` (adds `regenerateSession`/`destroySession`)
- Modify: `apps/api/src/routes/v1/index.ts`
- Test: `apps/api/src/routes/v1/auth.test.ts`

**Interfaces:**
- Consumes: `userService` (Task 5), `validate` (Task 5), `requireAuth` (Task 4), session (Task 3)
- Produces:
  - `POST /api/v1/auth/signup` → 201 `{ id, username }`, sets `sid`
  - `POST /api/v1/auth/login` → 200 `{ id, username }`, sets `sid`
  - `POST /api/v1/auth/logout` → 204, clears `sid`
  - `GET /api/v1/auth/me` → 200 `{ id, username }` or 401
  - `authRouter: Router`

- [ ] **Step 1: Write the failing integration test**

Create `apps/api/src/routes/v1/auth.test.ts`:

```ts
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { buildTestApp, useTestDb } from '../../test/helpers.js'

useTestDb()

const app = () => buildTestApp()
const CREDS = { username: 'yonatan', email: 'y@example.com', password: 'correct-horse' }

describe('POST /api/v1/auth/signup', () => {
  it('creates the user, returns 201, and starts a session', async () => {
    const res = await request(app()).post('/api/v1/auth/signup').send(CREDS)
    expect(res.status).toBe(201)
    expect(res.body).toEqual({ id: expect.any(String), username: 'yonatan' })
    expect(res.headers['set-cookie']?.[0]).toMatch(/^sid=/)
  })

  it('never returns the password or its hash', async () => {
    const res = await request(app()).post('/api/v1/auth/signup').send(CREDS)
    expect(JSON.stringify(res.body)).not.toContain('correct-horse')
    expect(res.body).not.toHaveProperty('password')
  })

  it('returns 400 with field errors for a short password', async () => {
    const res = await request(app()).post('/api/v1/auth/signup').send({ ...CREDS, password: 'short' })
    expect(res.status).toBe(400)
    expect(res.body.error.fields.password).toBeDefined()
  })

  it('returns 409 for a duplicate username', async () => {
    const agent = app()
    await request(agent).post('/api/v1/auth/signup').send(CREDS)
    const res = await request(agent).post('/api/v1/auth/signup').send({ ...CREDS, email: 'b@example.com' })
    expect(res.status).toBe(409)
  })
})

describe('POST /api/v1/auth/login', () => {
  it('returns 200 and starts a session for correct credentials', async () => {
    const agent = request.agent(app())
    await agent.post('/api/v1/auth/signup').send(CREDS)
    await agent.post('/api/v1/auth/logout')
    const res = await agent.post('/api/v1/auth/login').send({ username: 'yonatan', password: 'correct-horse' })
    expect(res.status).toBe(200)
    expect(res.body.username).toBe('yonatan')
  })

  it('returns a generic 401 for a wrong password — no hint that the user exists', async () => {
    const agent = request.agent(app())
    await agent.post('/api/v1/auth/signup').send(CREDS)
    const res = await agent.post('/api/v1/auth/login').send({ username: 'yonatan', password: 'wrong' })
    expect(res.status).toBe(401)
    expect(res.body.error.message).toBe('Invalid username or password.')
  })

  it('returns the IDENTICAL response for an unknown username', async () => {
    // The legacy app returned "Unable to find user: <name>", leaking existence.
    // Byte-identical responses are the whole point of this test.
    const agent = request.agent(app())
    await agent.post('/api/v1/auth/signup').send(CREDS)
    const wrongPassword = await agent.post('/api/v1/auth/login').send({ username: 'yonatan', password: 'wrong' })
    const unknownUser = await agent.post('/api/v1/auth/login').send({ username: 'nobody', password: 'wrong' })
    expect(unknownUser.status).toBe(wrongPassword.status)
    expect(unknownUser.body).toEqual(wrongPassword.body)
  })

  it('regenerates the session id on login to prevent session fixation', async () => {
    const agent = request.agent(app())
    await agent.post('/api/v1/auth/signup').send(CREDS)
    const before = await agent.get('/api/v1/auth/me')
    const beforeSid = before.headers['set-cookie']?.[0]
    await agent.post('/api/v1/auth/logout')
    const res = await agent.post('/api/v1/auth/login').send({ username: 'yonatan', password: 'correct-horse' })
    const afterSid = res.headers['set-cookie']?.[0]
    expect(afterSid).toBeDefined()
    expect(afterSid).not.toBe(beforeSid)
  })
})

describe('POST /api/v1/auth/logout', () => {
  it('returns 204 and clears the session', async () => {
    const agent = request.agent(app())
    await agent.post('/api/v1/auth/signup').send(CREDS)
    const res = await agent.post('/api/v1/auth/logout')
    expect(res.status).toBe(204)
    expect((await agent.get('/api/v1/auth/me')).status).toBe(401)
  })

  it('is POST-only — GET /logout is 404', async () => {
    // The legacy user.js:45 exposed logout over GET, so any <img src> logged you out.
    const res = await request(app()).get('/api/v1/auth/logout')
    expect(res.status).toBe(404)
  })

  it('requires authentication — an anonymous logout is 401', async () => {
    const res = await request(app()).post('/api/v1/auth/logout')
    expect(res.status).toBe(401)
  })
})

describe('GET /api/v1/auth/me', () => {
  it('returns the current user when signed in', async () => {
    const agent = request.agent(app())
    await agent.post('/api/v1/auth/signup').send(CREDS)
    const res = await agent.get('/api/v1/auth/me')
    expect(res.status).toBe(200)
    expect(res.body.username).toBe('yonatan')
  })

  it('returns 401 — never a redirect — for an anonymous caller', async () => {
    // An API must answer with a status, not a 302 to a login page.
    const res = await request(app()).get('/api/v1/auth/me')
    expect(res.status).toBe(401)
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm run test -- apps/api/src/routes/v1/auth.test.ts`
Expected: FAIL — every request 404s; `/api/v1/auth/*` is not mounted.

- [ ] **Step 3: Implement the auth router**

The promisified `session.regenerate`/`session.destroy` wrappers live in `apps/api/src/lib/session.ts`
as `regenerateSession`/`destroySession`, not inline in this file — `lib/session.ts` already owns every
other session concern (`buildSessionMiddleware`), and route files under `routes/v1/` stay route
definitions only, nothing else.

Add to `apps/api/src/lib/session.ts` (after `buildSessionMiddleware`):

```ts
/**
 * Promisified session.regenerate/destroy — express-session's callbacks,
 * wrapped so route handlers can await them like everything else and let
 * Express 5 forward a failure to the error handler automatically.
 */
export function regenerateSession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => (err ? reject(err) : resolve()))
  })
}

export function destroySession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.destroy((err) => (err ? reject(err) : resolve()))
  })
}
```

(This needs `Request` added to the `import type { Request, RequestHandler } from 'express'` at the top of `session.ts`.)

Create `apps/api/src/routes/v1/auth.ts`:

```ts
import { LoginSchema, SignupSchema, UnauthorizedError } from '@blog/shared'
import { Router } from 'express'
import { destroySession, regenerateSession } from '../../lib/session.js'
import { userService } from '../../lib/services/user.js'
import { requireAuth } from '../../middleware/require-auth.js'
import { validate } from '../../middleware/validate.js'

export const authRouter = Router()

authRouter.post('/signup', validate(SignupSchema), async (req, res) => {
  const user = await userService.signup(req.body)
  // Regenerate BEFORE writing identity: an attacker who planted a session id
  // must not end up holding a session that is now authenticated.
  await regenerateSession(req)
  req.session.userId = user.id
  req.session.username = user.username
  res.status(201).json(user)
})

authRouter.post('/login', validate(LoginSchema), async (req, res) => {
  const user = await userService.verifyCredentials(req.body.username, req.body.password)
  // One generic message for every failure mode. verifyCredentials already
  // returns null identically for "no such user" and "wrong password"; this
  // keeps the HTTP response identical too.
  if (!user) throw new UnauthorizedError('Invalid username or password.')

  await regenerateSession(req)
  req.session.userId = user.id
  req.session.username = user.username
  res.json(user)
})

// POST, never GET: the legacy GET logout meant any <img src="/logout"> on any
// page logged the visitor out. requireAuth makes an anonymous logout a 401.
authRouter.post('/logout', requireAuth, async (req, res) => {
  await destroySession(req)
  res.clearCookie('sid')
  res.status(204).end()
})

authRouter.get('/me', requireAuth, (req, res) => {
  res.json({ id: req.session.userId, username: req.session.username })
})
```

- [ ] **Step 4: Mount it**

In `apps/api/src/routes/v1/index.ts`, add the import at the top and mount it below the health route:

```ts
import { authRouter } from './auth.js'
```

```ts
v1Router.use('/auth', authRouter)
```

- [ ] **Step 5: Run it and confirm it passes**

Run: `npm run test -- apps/api/src/routes/v1/auth.test.ts`
Expected: PASS (12 tests)

- [ ] **Step 6: Gate and commit**

Run: `npm run typecheck && npm run lint && npm run test`

```bash
git add apps/api/src
git commit -m "feat(api): auth routes (signup, login, logout, me)

- logout is POST + requireAuth; GET /logout is 404 (legacy: unauthenticated GET)
- login returns one generic message for every failure — no username enumeration,
  asserted by comparing the wrong-password and unknown-user responses byte for byte
- session id is regenerated on signup and login: session-fixation defense
- GET /me answers 401, never a redirect"
```

---

## Task 7: `postService` — CRUD, slug, teaser, and the gating boundary

**This task contains the single most important rule in P1** (spec §6): the full body of a premium post must never be serialized for an anonymous reader.

**Files:**
- Create: `apps/api/src/lib/services/post.ts`
- Test: `apps/api/src/lib/services/post.test.ts`

**Interfaces:**
- Consumes: `PostModel`, `LikeModel`, `UserModel`, `slugify`, `deriveTeaser`, `NotFoundError`, `ConflictError` (`@blog/shared`)
- Produces:
  ```ts
  type PostAuthor = { id: string; username: string }
  type PostDto = {
    id: string; title: string; slug: string; body: string
    premium: boolean; gated: boolean
    author: PostAuthor; tags: string[]; likeCount: number
    coverImage?: string; createdAt: Date; updatedAt: Date
  }
  postService.list(): Promise<PostDto[]>                    // always teaser bodies
  postService.getBySlug(slug: string, viewerId?: string): Promise<PostDto>
  postService.create(input: CreatePost, authorId: string): Promise<PostDto>
  postService.update(slug: string, input: UpdatePost): Promise<PostDto>
  postService.remove(slug: string): Promise<void>
  postService.findBySlugForOwnerCheck(slug: string): Promise<{ author: Types.ObjectId } | null>
  ```

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/lib/services/post.test.ts`:

```ts
import { LikeModel, NotFoundError, PostModel, UserModel } from '@blog/shared'
import { Types } from 'mongoose'
import { beforeEach, describe, expect, it } from 'vitest'
import { useTestDb } from '../../test/helpers.js'
import { postService } from './post.js'

useTestDb()

let authorId: string
const LONG_BODY = 'Para one.\n\nPara two.\n\nPara three — this must never reach an anonymous reader.'

beforeEach(async () => {
  const author = await UserModel.create({ username: 'author', email: 'a@example.com', password: 'x' })
  authorId = author._id.toString()
})

const create = (over: Partial<{ title: string; body: string; premium: boolean; tags: string[] }> = {}) =>
  postService.create(
    { title: 'A Fine Title', body: LONG_BODY, premium: false, tags: [], ...over },
    authorId,
  )

describe('postService.create', () => {
  it('derives the slug from the title', async () => {
    expect((await create({ title: 'Hello World Again' })).slug).toBe('hello-world-again')
  })

  it('suffixes the slug when it collides, rather than failing on the unique index', async () => {
    await create({ title: 'Same Title' })
    expect((await create({ title: 'Same Title' })).slug).toBe('same-title-2')
  })

  it('sets the author from the caller id, never from the input', async () => {
    const post = await create()
    expect(post.author.id).toBe(authorId)
  })

  it('returns the full body to the creator', async () => {
    expect((await create()).body).toBe(LONG_BODY)
  })
})

describe('postService.list', () => {
  it('returns teaser bodies only — a list endpoint never ships full bodies', async () => {
    await create({ premium: false })
    const [post] = await postService.list()
    expect(post!.body).toBe('Para one.\n\nPara two.')
    expect(post!.body).not.toContain('Para three')
  })

  it('teases free posts too — the feed is a feed, not a paywall probe', async () => {
    await create({ premium: false })
    expect((await postService.list())[0]!.body).not.toContain('Para three')
  })

  it('includes the like count', async () => {
    const post = await create()
    await LikeModel.create({ user: new Types.ObjectId(), post: new Types.ObjectId(post.id) })
    expect((await postService.list())[0]!.likeCount).toBe(1)
  })

  it('populates the author instead of a denormalized copy', async () => {
    await create()
    expect((await postService.list())[0]!.author.username).toBe('author')
  })
})

describe('postService.getBySlug — THE gating rule (spec §6)', () => {
  it('returns the full body of a FREE post to an anonymous reader', async () => {
    const { slug } = await create({ premium: false })
    const post = await postService.getBySlug(slug, undefined)
    expect(post.body).toBe(LONG_BODY)
    expect(post.gated).toBe(false)
  })

  it('OMITS the full body of a PREMIUM post for an anonymous reader', async () => {
    const { slug } = await create({ premium: true })
    const post = await postService.getBySlug(slug, undefined)
    expect(post.body).toBe('Para one.\n\nPara two.')
    expect(post.gated).toBe(true)
  })

  it('leaves the gated bytes nowhere in the serialized object', async () => {
    // The real assertion: not "hidden", ABSENT. Serialize the whole DTO and grep.
    const { slug } = await create({ premium: true })
    const post = await postService.getBySlug(slug, undefined)
    expect(JSON.stringify(post)).not.toContain('Para three')
  })

  it('returns the full body of a PREMIUM post to a signed-in reader', async () => {
    const { slug } = await create({ premium: true })
    const reader = await UserModel.create({ username: 'reader', email: 'r@example.com', password: 'x' })
    const post = await postService.getBySlug(slug, reader._id.toString())
    expect(post.body).toBe(LONG_BODY)
    expect(post.gated).toBe(false)
  })

  it('throws NotFoundError for an unknown slug', async () => {
    await expect(postService.getBySlug('nope', undefined)).rejects.toThrow(NotFoundError)
  })
})

describe('postService.update', () => {
  it('applies a partial update and leaves other fields alone', async () => {
    const { slug } = await create({ title: 'Original Title' })
    const updated = await postService.update(slug, { title: 'A Brand New Title' })
    expect(updated.title).toBe('A Brand New Title')
    expect(updated.body).toBe(LONG_BODY)
  })

  it('re-slugs when the title changes so the URL tracks the title', async () => {
    const { slug } = await create({ title: 'Original Title' })
    expect((await postService.update(slug, { title: 'A Brand New Title' })).slug).toBe('a-brand-new-title')
  })

  it('does not change the slug when the title is untouched', async () => {
    const { slug } = await create({ title: 'Original Title' })
    expect((await postService.update(slug, { body: 'New body.' })).slug).toBe('original-title')
  })

  it('throws NotFoundError for an unknown slug', async () => {
    await expect(postService.update('nope', { title: 'Whatever Title' })).rejects.toThrow(NotFoundError)
  })
})

describe('postService.remove', () => {
  it('deletes the post', async () => {
    const { slug } = await create()
    await postService.remove(slug)
    expect(await PostModel.countDocuments()).toBe(0)
  })

  it('deletes the post likes too, so no orphans accumulate', async () => {
    const post = await create()
    await LikeModel.create({ user: new Types.ObjectId(), post: new Types.ObjectId(post.id) })
    await postService.remove(post.slug)
    expect(await LikeModel.countDocuments()).toBe(0)
  })

  it('throws NotFoundError for an unknown slug', async () => {
    await expect(postService.remove('nope')).rejects.toThrow(NotFoundError)
  })
})

describe('postService.findBySlugForOwnerCheck', () => {
  it('returns the author id for requireOwner', async () => {
    const { slug } = await create()
    const found = await postService.findBySlugForOwnerCheck(slug)
    expect(found!.author.toString()).toBe(authorId)
  })

  it('returns null for an unknown slug so requireOwner can 404', async () => {
    expect(await postService.findBySlugForOwnerCheck('nope')).toBeNull()
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm run test -- apps/api/src/lib/services/post.test.ts`
Expected: FAIL — `Cannot find module './post.js'`

- [ ] **Step 3: Implement `postService`**

Create `apps/api/src/lib/services/post.ts`:

```ts
import {
  LikeModel,
  NotFoundError,
  PostModel,
  deriveTeaser,
  slugify,
  type CreatePost,
  type Post,
  type UpdatePost,
} from '@blog/shared'
import { Types, type HydratedDocument } from 'mongoose'

export type PostAuthor = { id: string; username: string }

export type PostDto = {
  id: string
  title: string
  slug: string
  body: string
  premium: boolean
  /** true when `body` holds only the teaser because the reader is not signed in. */
  gated: boolean
  author: PostAuthor
  tags: string[]
  likeCount: number
  coverImage?: string
  createdAt: Date
  updatedAt: Date
}

type PopulatedAuthor = { _id: Types.ObjectId; username: string }

function isPopulated(author: unknown): author is PopulatedAuthor {
  return typeof author === 'object' && author !== null && 'username' in author
}

/**
 * THE serialization boundary — the single place a Post document becomes a
 * response object (spec §6).
 *
 * `full: false` means the full body is never copied into the returned object,
 * so it cannot leak: there is nothing to find in DevTools because the API never
 * put it there. Gating in a route handler or a component would be cosmetic.
 */
function toDto(post: HydratedDocument<Post>, likeCount: number, full: boolean): PostDto {
  const author = post.author
  return {
    id: post._id.toString(),
    title: post.title,
    slug: post.slug,
    body: full ? post.body : deriveTeaser(post.body),
    premium: post.premium,
    gated: !full,
    author: isPopulated(author)
      ? { id: author._id.toString(), username: author.username }
      : { id: String(author), username: '' },
    tags: post.tags ?? [],
    likeCount,
    coverImage: post.coverImage ?? undefined,
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
  }
}

/**
 * Finds a free slug, suffixing on collision: my-title, my-title-2, my-title-3.
 * The unique index is still the real guard; this just avoids losing a write to it.
 */
async function uniqueSlug(title: string, excludeId?: Types.ObjectId): Promise<string> {
  const base = slugify(title)
  for (let n = 1; ; n++) {
    const candidate = n === 1 ? base : `${base}-${n}`
    const clash = await PostModel.findOne({ slug: candidate })
    if (!clash || clash._id.equals(excludeId)) return candidate
  }
}

async function countLikes(postId: Types.ObjectId): Promise<number> {
  // Derived, never stored: the legacy `likes: Number` drifted from `likedBy: []`.
  return LikeModel.countDocuments({ post: postId })
}

export const postService = {
  /** The feed. Teaser bodies ALWAYS — a list endpoint never ships full bodies. */
  async list(): Promise<PostDto[]> {
    const posts = await PostModel.find().sort({ createdAt: -1 }).populate('author', 'username')
    return Promise.all(posts.map(async (p) => toDto(p, await countLikes(p._id), false)))
  },

  async getBySlug(slug: string, viewerId?: string): Promise<PostDto> {
    const post = await PostModel.findOne({ slug }).populate('author', 'username')
    if (!post) throw new NotFoundError('Post not found.')

    // The gating rule, stated once: a premium post shows its full body only to
    // a signed-in reader. Everything else about the post stays public.
    const full = !post.premium || Boolean(viewerId)
    return toDto(post, await countLikes(post._id), full)
  },

  async create(input: CreatePost, authorId: string): Promise<PostDto> {
    const post = await PostModel.create({
      ...input,
      slug: await uniqueSlug(input.title),
      // From the session, never from `input` — validate() strips an `author`
      // key anyway, and this is the second reason it cannot be spoofed.
      author: new Types.ObjectId(authorId),
    })
    await post.populate('author', 'username')
    return toDto(post, 0, true)
  },

  async update(slug: string, input: UpdatePost): Promise<PostDto> {
    const post = await PostModel.findOne({ slug })
    if (!post) throw new NotFoundError('Post not found.')

    if (input.title !== undefined && input.title !== post.title) {
      post.title = input.title
      post.slug = await uniqueSlug(input.title, post._id)
    }
    if (input.body !== undefined) post.body = input.body
    if (input.premium !== undefined) post.premium = input.premium
    if (input.tags !== undefined) post.tags = input.tags

    await post.save()
    await post.populate('author', 'username')
    // The owner is the only caller who reaches here, so the full body is correct.
    return toDto(post, await countLikes(post._id), true)
  },

  async remove(slug: string): Promise<void> {
    const post = await PostModel.findOne({ slug })
    if (!post) throw new NotFoundError('Post not found.')
    // Delete the likes first: a like pointing at a missing post is an orphan
    // that would inflate no count but would never be collected either.
    await LikeModel.deleteMany({ post: post._id })
    await post.deleteOne()
  },

  /** Loader for requireOwner. Returns only what the ownership check needs. */
  async findBySlugForOwnerCheck(slug: string): Promise<{ author: Types.ObjectId } | null> {
    const post = await PostModel.findOne({ slug }).select('author')
    return post ? { author: post.author } : null
  },
}
```

- [ ] **Step 4: Run it and confirm it passes**

Run: `npm run test -- apps/api/src/lib/services/post.test.ts`
Expected: PASS (22 tests — 4 create + 4 list + 5 getBySlug + 4 update + 3 remove + 2 findBySlugForOwnerCheck)

- [ ] **Step 5: Gate and commit**

Run: `npm run typecheck && npm run lint && npm run test`

```bash
git add apps/api/src/lib/services
git commit -m "feat(api): postService with gating at the serialization boundary

- toDto() is the ONE place a Post becomes a response; a gated body is never
  copied into the returned object, so there is nothing to find in DevTools
- list() always teases: a list endpoint never ships full bodies
- like counts are derived via countDocuments, never stored (legacy drifted)
- author comes from the caller id, never from input
- slug collisions get a numeric suffix; delete cascades to likes"
```

---

## Task 8: Posts routes — CRUD with authorization

Where the §14 security checklist gets enforced against real HTTP.

**Files:**
- Create: `apps/api/src/routes/v1/posts.ts`
- Modify: `apps/api/src/routes/v1/index.ts`
- Test: `apps/api/src/routes/v1/posts.test.ts`

**Interfaces:**
- Consumes: `postService` (Task 7), `requireAuth`/`requireOwner` (Task 4), `validate` (Task 5), `CreatePostSchema`/`UpdatePostSchema` (Task 1)
- Produces:
  - `GET /api/v1/posts` → 200 `PostDto[]`
  - `POST /api/v1/posts` → 201 `PostDto` (auth)
  - `GET /api/v1/posts/:slug` → 200 `PostDto`
  - `PATCH /api/v1/posts/:slug` → 200 `PostDto` (owner)
  - `DELETE /api/v1/posts/:slug` → 204 (owner)
  - `postsRouter: Router`

- [ ] **Step 1: Write the failing integration test**

Create `apps/api/src/routes/v1/posts.test.ts`:

```ts
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { buildTestApp, useTestDb } from '../../test/helpers.js'

useTestDb()

const app = () => buildTestApp()
const BODY = 'Para one.\n\nPara two.\n\nPara three — the gated bytes.'

/** Signs up a fresh user and returns an agent carrying their session cookie. */
async function signedInAgent(app: ReturnType<typeof buildTestApp>, username: string) {
  const agent = request.agent(app)
  await agent
    .post('/api/v1/auth/signup')
    .send({ username, email: `${username}@example.com`, password: 'correct-horse' })
  return agent
}

describe('GET /api/v1/posts', () => {
  it('is public and returns teaser bodies only', async () => {
    const a = app()
    const author = await signedInAgent(a, 'author')
    await author.post('/api/v1/posts').send({ title: 'A Fine Title', body: BODY })

    const res = await request(a).get('/api/v1/posts')
    expect(res.status).toBe(200)
    expect(res.body[0].body).not.toContain('Para three')
  })
})

describe('POST /api/v1/posts', () => {
  it('creates a post for a signed-in user', async () => {
    const author = await signedInAgent(app(), 'author')
    const res = await author.post('/api/v1/posts').send({ title: 'A Fine Title', body: BODY })
    expect(res.status).toBe(201)
    expect(res.body.slug).toBe('a-fine-title')
  })

  it('returns 401 — not a redirect — for an anonymous caller', async () => {
    const res = await request(app()).post('/api/v1/posts').send({ title: 'A Fine Title', body: BODY })
    expect(res.status).toBe(401)
  })

  it('returns 400 with field errors for an invalid body', async () => {
    const author = await signedInAgent(app(), 'author')
    const res = await author.post('/api/v1/posts').send({ title: 'no', body: '' })
    expect(res.status).toBe(400)
    expect(res.body.error.fields.title).toBeDefined()
  })

  it('ignores an author field in the body — identity comes from the session', async () => {
    const a = app()
    const victim = await signedInAgent(a, 'victim')
    const victimId = (await victim.get('/api/v1/auth/me')).body.id
    const attacker = await signedInAgent(a, 'attacker')

    const res = await attacker
      .post('/api/v1/posts')
      .send({ title: 'A Fine Title', body: BODY, author: victimId })
    expect(res.status).toBe(201)
    expect(res.body.author.username).toBe('attacker') // NOT victim
  })
})

describe('GET /api/v1/posts/:slug — gating over real HTTP (spec §6, §14)', () => {
  it('returns the full body of a free post to an anonymous reader', async () => {
    const a = app()
    const author = await signedInAgent(a, 'author')
    await author.post('/api/v1/posts').send({ title: 'A Fine Title', body: BODY, premium: false })

    const res = await request(a).get('/api/v1/posts/a-fine-title')
    expect(res.body.body).toContain('Para three')
    expect(res.body.gated).toBe(false)
  })

  it('leaves the gated bytes ABSENT from the RAW premium response for an anonymous reader', async () => {
    const a = app()
    const author = await signedInAgent(a, 'author')
    await author.post('/api/v1/posts').send({ title: 'A Fine Title', body: BODY, premium: true })

    const res = await request(a).get('/api/v1/posts/a-fine-title')
    expect(res.status).toBe(200)
    expect(res.body.gated).toBe(true)
    // Assert on the raw payload, not the parsed field: the bytes must not be
    // anywhere in the response, under any key.
    expect(res.text).not.toContain('Para three')
  })

  it('returns the full premium body to a signed-in reader', async () => {
    const a = app()
    const author = await signedInAgent(a, 'author')
    await author.post('/api/v1/posts').send({ title: 'A Fine Title', body: BODY, premium: true })
    const reader = await signedInAgent(a, 'reader')

    const res = await reader.get('/api/v1/posts/a-fine-title')
    expect(res.body.body).toContain('Para three')
    expect(res.body.gated).toBe(false)
  })

  it('returns 404 for an unknown slug', async () => {
    expect((await request(app()).get('/api/v1/posts/nope')).status).toBe(404)
  })
})

describe('PATCH /api/v1/posts/:slug', () => {
  it('lets the owner edit', async () => {
    const author = await signedInAgent(app(), 'author')
    await author.post('/api/v1/posts').send({ title: 'A Fine Title', body: BODY })
    const res = await author.patch('/api/v1/posts/a-fine-title').send({ title: 'An Edited Title' })
    expect(res.status).toBe(200)
    expect(res.body.title).toBe('An Edited Title')
  })

  it('REGRESSION: a non-owner gets 403 (legacy post.js:34 let anyone edit)', async () => {
    const a = app()
    const author = await signedInAgent(a, 'author')
    await author.post('/api/v1/posts').send({ title: 'A Fine Title', body: BODY })
    const attacker = await signedInAgent(a, 'attacker')

    const res = await attacker.patch('/api/v1/posts/a-fine-title').send({ title: 'Pwned Title' })
    expect(res.status).toBe(403)
  })

  it('returns 401 for an anonymous editor', async () => {
    const a = app()
    const author = await signedInAgent(a, 'author')
    await author.post('/api/v1/posts').send({ title: 'A Fine Title', body: BODY })
    expect((await request(a).patch('/api/v1/posts/a-fine-title').send({ title: 'Nope Title' })).status).toBe(401)
  })
})

describe('DELETE /api/v1/posts/:slug', () => {
  it('lets the owner delete', async () => {
    const author = await signedInAgent(app(), 'author')
    await author.post('/api/v1/posts').send({ title: 'A Fine Title', body: BODY })
    expect((await author.delete('/api/v1/posts/a-fine-title')).status).toBe(204)
  })

  it('REGRESSION: a non-owner gets 403 (legacy post.js:42 deleted any post)', async () => {
    const a = app()
    const author = await signedInAgent(a, 'author')
    await author.post('/api/v1/posts').send({ title: 'A Fine Title', body: BODY })
    const attacker = await signedInAgent(a, 'attacker')

    const res = await attacker.delete('/api/v1/posts/a-fine-title')
    expect(res.status).toBe(403)
    // And it is still there.
    expect((await request(a).get('/api/v1/posts/a-fine-title')).status).toBe(200)
  })

  it('returns 404 for an unknown slug', async () => {
    const author = await signedInAgent(app(), 'author')
    expect((await author.delete('/api/v1/posts/nope')).status).toBe(404)
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm run test -- apps/api/src/routes/v1/posts.test.ts`
Expected: FAIL — `/api/v1/posts` 404s.

- [ ] **Step 3: Implement the posts router**

Create `apps/api/src/routes/v1/posts.ts`:

```ts
import { CreatePostSchema, UpdatePostSchema } from '@blog/shared'
import { Router, type Request } from 'express'
import { postService } from '../../lib/services/post.js'
import { requireAuth } from '../../middleware/require-auth.js'
import { requireOwner } from '../../middleware/require-owner.js'
import { validate } from '../../middleware/validate.js'

export const postsRouter = Router()

/**
 * Loader for requireOwner: resolves :slug to the post's author.
 * Typed Request<{ slug: string }>, NOT a bare Request — a bare Request types
 * req.params.slug as `string | string[] | undefined` under this repo's
 * noUncheckedIndexedAccess, which will not pass to a `slug: string` service.
 */
const loadPostOwner = (req: Request<{ slug: string }>) =>
  postService.findBySlugForOwnerCheck(req.params.slug)

postsRouter.get('/', async (_req, res) => {
  res.json(await postService.list())
})

postsRouter.post('/', requireAuth, validate(CreatePostSchema), async (req, res) => {
  // requireAuth guarantees userId is set.
  res.status(201).json(await postService.create(req.body, req.session.userId!))
})

postsRouter.get('/:slug', async (req, res) => {
  // The viewer id is passed to the service, which decides what to serialize.
  // The handler does NOT branch on premium — gating belongs to one layer only.
  res.json(await postService.getBySlug(req.params.slug, req.session?.userId))
})

postsRouter.patch(
  '/:slug',
  requireOwner(loadPostOwner),
  validate(UpdatePostSchema),
  async (req, res) => {
    res.json(await postService.update(req.params.slug, req.body))
  },
)

postsRouter.delete('/:slug', requireOwner(loadPostOwner), async (req, res) => {
  await postService.remove(req.params.slug)
  res.status(204).end()
})
```

- [ ] **Step 4: Mount it**

In `apps/api/src/routes/v1/index.ts`:

```ts
import { postsRouter } from './posts.js'
```

```ts
v1Router.use('/posts', postsRouter)
```

- [ ] **Step 5: Run it and confirm it passes**

Run: `npm run test -- apps/api/src/routes/v1/posts.test.ts`
Expected: PASS (14 tests)

- [ ] **Step 6: Gate and commit**

Run: `npm run typecheck && npm run lint && npm run test`

```bash
git add apps/api/src
git commit -m "feat(api): posts CRUD with owner-enforced authorization

Regression tests for three legacy holes, against real routes:
- non-owner edit is 403 (was: post.js:34 let any signed-in user edit)
- non-owner delete is 403 (was: post.js:42 deleted any post)
- an author field in the body is ignored; identity comes from the session

Gating is asserted on the RAW response text, not the parsed body: the
premium bytes must be absent from the payload, not merely hidden."
```

---

## Task 9: Likes — idempotent `PUT`/`DELETE`

**Files:**
- Create: `apps/api/src/lib/services/like.ts`
- Modify: `apps/api/src/routes/v1/posts.ts`
- Test: `apps/api/src/lib/services/like.test.ts`
- Test: `apps/api/src/routes/v1/likes.test.ts`

**Interfaces:**
- Consumes: `LikeModel`, `PostModel`, `NotFoundError` (`@blog/shared`); `requireAuth` (Task 4)
- Produces:
  - `likeService.like(slug: string, userId: string): Promise<{ likeCount: number }>`
  - `likeService.unlike(slug: string, userId: string): Promise<{ likeCount: number }>`
  - `PUT /api/v1/posts/:slug/likes` → 200 `{ likeCount }` (auth)
  - `DELETE /api/v1/posts/:slug/likes` → 200 `{ likeCount }` (auth)

- [ ] **Step 1: Write the failing service test**

Create `apps/api/src/lib/services/like.test.ts`:

```ts
import { LikeModel, NotFoundError, PostModel, UserModel } from '@blog/shared'
import { beforeEach, describe, expect, it } from 'vitest'
import { useTestDb } from '../../test/helpers.js'
import { likeService } from './like.js'

useTestDb()

let userId: string
let slug: string

beforeEach(async () => {
  const user = await UserModel.create({ username: 'liker', email: 'l@example.com', password: 'x' })
  userId = user._id.toString()
  const post = await PostModel.create({ title: 'A Fine Title', slug: 'a-fine-title', body: 'b', author: user._id })
  slug = post.slug
})

describe('likeService.like', () => {
  it('records a like and returns the new count', async () => {
    expect(await likeService.like(slug, userId)).toEqual({ likeCount: 1 })
  })

  it('is IDEMPOTENT — liking twice still leaves exactly one like', async () => {
    // The whole reason like is PUT and not POST /toggle. The legacy toggle did
    // read-then-write, so two fast clicks could both read "not liked" and push.
    await likeService.like(slug, userId)
    expect(await likeService.like(slug, userId)).toEqual({ likeCount: 1 })
    expect(await LikeModel.countDocuments()).toBe(1)
  })

  it('survives a concurrent double-like without a duplicate or a crash', async () => {
    const results = await Promise.all([likeService.like(slug, userId), likeService.like(slug, userId)])
    expect(await LikeModel.countDocuments()).toBe(1)
    expect(results.every((r) => r.likeCount === 1)).toBe(true)
  })

  it('throws NotFoundError for an unknown slug', async () => {
    await expect(likeService.like('nope', userId)).rejects.toThrow(NotFoundError)
  })
})

describe('likeService.unlike', () => {
  it('removes the like and returns the new count', async () => {
    await likeService.like(slug, userId)
    expect(await likeService.unlike(slug, userId)).toEqual({ likeCount: 0 })
  })

  it('is IDEMPOTENT — unliking twice is not an error and never goes negative', async () => {
    await likeService.like(slug, userId)
    await likeService.unlike(slug, userId)
    expect(await likeService.unlike(slug, userId)).toEqual({ likeCount: 0 })
  })

  it('unliking a post that was never liked is a no-op, not a 404', async () => {
    expect(await likeService.unlike(slug, userId)).toEqual({ likeCount: 0 })
  })

  it('throws NotFoundError for an unknown slug', async () => {
    await expect(likeService.unlike('nope', userId)).rejects.toThrow(NotFoundError)
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm run test -- apps/api/src/lib/services/like.test.ts`
Expected: FAIL — `Cannot find module './like.js'`

- [ ] **Step 3: Implement `likeService`**

Create `apps/api/src/lib/services/like.ts`:

```ts
import { LikeModel, NotFoundError, PostModel } from '@blog/shared'
import type { Types } from 'mongoose'

async function resolvePostId(slug: string): Promise<Types.ObjectId> {
  const post = await PostModel.findOne({ slug }).select('_id')
  if (!post) throw new NotFoundError('Post not found.')
  return post._id
}

export const likeService = {
  /**
   * Idempotent like. Exposed as PUT because repeating it must not change the
   * outcome — which is why the count cannot be corrupted by a double click.
   * upsert + the unique (user, post) index make concurrency a non-event: the
   * loser of the race updates the same document instead of inserting a second.
   */
  async like(slug: string, userId: string): Promise<{ likeCount: number }> {
    const postId = await resolvePostId(slug)
    await LikeModel.updateOne(
      { user: userId, post: postId },
      { $setOnInsert: { user: userId, post: postId } },
      { upsert: true },
    )
    return { likeCount: await LikeModel.countDocuments({ post: postId }) }
  },

  /** Idempotent unlike. Deleting nothing is success, not a 404. */
  async unlike(slug: string, userId: string): Promise<{ likeCount: number }> {
    const postId = await resolvePostId(slug)
    await LikeModel.deleteOne({ user: userId, post: postId })
    return { likeCount: await LikeModel.countDocuments({ post: postId }) }
  },
}
```

- [ ] **Step 4: Run it and confirm it passes**

Run: `npm run test -- apps/api/src/lib/services/like.test.ts`
Expected: PASS (8 tests)

> If the concurrent test flakes with a duplicate-key error, that is Mongo
> reporting the upsert race honestly. Catch code 11000 in `like()` and fall
> through to the count — the index did its job.

- [ ] **Step 5: Write the failing route test**

Create `apps/api/src/routes/v1/likes.test.ts`:

```ts
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { buildTestApp, useTestDb } from '../../test/helpers.js'

useTestDb()

const app = () => buildTestApp()

async function signedInAgent(app: ReturnType<typeof buildTestApp>, username: string) {
  const agent = request.agent(app)
  await agent
    .post('/api/v1/auth/signup')
    .send({ username, email: `${username}@example.com`, password: 'correct-horse' })
  return agent
}

async function withPost() {
  const a = app()
  const author = await signedInAgent(a, 'author')
  await author.post('/api/v1/posts').send({ title: 'A Fine Title', body: 'Body.' })
  return { a, author }
}

describe('PUT /api/v1/posts/:slug/likes', () => {
  it('likes the post and returns the count', async () => {
    const { author } = await withPost()
    const res = await author.put('/api/v1/posts/a-fine-title/likes')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ likeCount: 1 })
  })

  it('REGRESSION: requires authentication (legacy liked as whoever the body said)', async () => {
    const { a } = await withPost()
    expect((await request(a).put('/api/v1/posts/a-fine-title/likes')).status).toBe(401)
  })

  it('ignores a user field in the body — identity comes from the session', async () => {
    const { a, author } = await withPost()
    const attacker = await signedInAgent(a, 'attacker')
    await attacker.put('/api/v1/posts/a-fine-title/likes').send({ user: 'someone-else' })
    // Exactly one like, attributed to the attacker's own session.
    expect((await author.put('/api/v1/posts/a-fine-title/likes')).body.likeCount).toBe(2)
  })

  it('is idempotent over HTTP — a double click cannot double-like', async () => {
    const { author } = await withPost()
    await author.put('/api/v1/posts/a-fine-title/likes')
    expect((await author.put('/api/v1/posts/a-fine-title/likes')).body).toEqual({ likeCount: 1 })
  })

  it('returns 404 for an unknown slug', async () => {
    const { author } = await withPost()
    expect((await author.put('/api/v1/posts/nope/likes')).status).toBe(404)
  })
})

describe('DELETE /api/v1/posts/:slug/likes', () => {
  it('unlikes and returns the count', async () => {
    const { author } = await withPost()
    await author.put('/api/v1/posts/a-fine-title/likes')
    const res = await author.delete('/api/v1/posts/a-fine-title/likes')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ likeCount: 0 })
  })

  it('requires authentication', async () => {
    const { a } = await withPost()
    expect((await request(a).delete('/api/v1/posts/a-fine-title/likes')).status).toBe(401)
  })

  it('is idempotent — the count never goes below zero', async () => {
    const { author } = await withPost()
    await author.delete('/api/v1/posts/a-fine-title/likes')
    expect((await author.delete('/api/v1/posts/a-fine-title/likes')).body).toEqual({ likeCount: 0 })
  })
})

describe('like route semantics', () => {
  it('has no POST /toggle — a toggle is not idempotent', async () => {
    const { author } = await withPost()
    expect((await author.post('/api/v1/posts/a-fine-title/likes/toggle')).status).toBe(404)
  })
})
```

- [ ] **Step 6: Run it and confirm it fails**

Run: `npm run test -- apps/api/src/routes/v1/likes.test.ts`
Expected: FAIL — the like routes 404.

- [ ] **Step 7: Add the like routes**

Append to `apps/api/src/routes/v1/posts.ts` (and add `likeService` to the imports):

```ts
// Like is PUT/DELETE, not POST /toggle: a toggle is not idempotent, and the
// unique (user, post) index exists precisely so repeating cannot corrupt the count.
postsRouter.put('/:slug/likes', requireAuth, async (req, res) => {
  res.json(await likeService.like(req.params.slug, req.session.userId!))
})

postsRouter.delete('/:slug/likes', requireAuth, async (req, res) => {
  res.json(await likeService.unlike(req.params.slug, req.session.userId!))
})
```

> **Ordering matters:** these must be registered BEFORE `postsRouter.delete('/:slug', ...)` would
> otherwise capture `/:slug/likes`. Express matches the full path, so `/:slug` does not match
> `/a-fine-title/likes` — but keep the like routes above the bare `/:slug` handlers anyway, so a
> later refactor to `/:slug/*` cannot silently shadow them.

- [ ] **Step 8: Run it and confirm it passes**

Run: `npm run test -- apps/api/src/routes/v1/likes.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 9: Gate and commit**

Run: `npm run typecheck && npm run lint && npm run test`

```bash
git add apps/api/src
git commit -m "feat(api): idempotent like/unlike as PUT/DELETE

- PUT/DELETE, never POST /toggle: repeating must not change the outcome
- upsert + the unique (user, post) index make a double click a non-event
- REGRESSION: like requires auth and uses session identity, not a body field
- unlike is a no-op when absent; the count cannot go below zero"
```

---

## Task 10: Users routes — the account-takeover fix

**Files:**
- Create: `apps/api/src/routes/v1/users.ts`
- Modify: `apps/api/src/lib/services/user.ts`
- Modify: `apps/api/src/routes/v1/index.ts`
- Create: `packages/shared/src/schemas/user.ts` → add `UpdateUserSchema`
- Test: `apps/api/src/routes/v1/users.test.ts`

**Interfaces:**
- Consumes: `userService` (Task 5), `requireAuth` (Task 4), `validate` (Task 5)
- Produces:
  - `UpdateUserSchema` (in `@blog/shared`) — `{ bio?, image?, password? }`
  - `userService.updateProfile(id: string, input: UpdateUser): Promise<PublicUser>`
  - `userService.remove(id: string): Promise<void>`
  - `GET /api/v1/users/:id` → 200 `PublicUser`
  - `PATCH /api/v1/users/:id` → 200 `PublicUser` (self only)
  - `DELETE /api/v1/users/:id` → 204 (self only)

> **Why not `requireOwner` here:** `requireOwner` compares `resource.author` to the session.
> A User has no `author` — the user *is* the resource. So the users router compares
> `req.params.id` to `req.session.userId` directly. Same rule, different shape.

- [ ] **Step 1: Add `UpdateUserSchema`**

Append to `packages/shared/src/schemas/user.ts`:

```ts
// PATCH /api/v1/users/:id — the id in the URL identifies the user and the
// session proves who is asking. The body carries NO id and NO username:
// the legacy /update-user took both from the body, which is exactly how it
// became an account takeover.
export const UpdateUserSchema = z.object({
  bio: z.string().trim().max(500, 'Bio must be at most 500 characters').optional(),
  image: z.string().trim().max(200).optional(),
  password: z.string().min(8, 'Password must be at least 8 characters').max(200).optional(),
})

export type UpdateUser = z.infer<typeof UpdateUserSchema>
```

- [ ] **Step 2: Write the failing test**

Create `apps/api/src/routes/v1/users.test.ts`:

```ts
import { UserModel } from '@blog/shared'
import bcrypt from 'bcryptjs'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { buildTestApp, useTestDb } from '../../test/helpers.js'

useTestDb()

const app = () => buildTestApp()

async function signedInAgent(app: ReturnType<typeof buildTestApp>, username: string) {
  const agent = request.agent(app)
  const res = await agent
    .post('/api/v1/auth/signup')
    .send({ username, email: `${username}@example.com`, password: 'correct-horse' })
  return { agent, id: res.body.id as string }
}

describe('GET /api/v1/users/:id', () => {
  it('is public and returns the profile', async () => {
    const a = app()
    const { id } = await signedInAgent(a, 'author')
    const res = await request(a).get(`/api/v1/users/${id}`)
    expect(res.status).toBe(200)
    expect(res.body.username).toBe('author')
  })

  it('never exposes the password hash or the email', async () => {
    const a = app()
    const { id } = await signedInAgent(a, 'author')
    const res = await request(a).get(`/api/v1/users/${id}`)
    expect(res.text).not.toContain('$2a$')
    expect(res.text).not.toContain('@example.com')
  })

  it('returns 404 for an unknown id', async () => {
    expect((await request(app()).get('/api/v1/users/507f1f77bcf86cd799439011')).status).toBe(404)
  })

  it('returns 404 — not 500 — for a malformed id', async () => {
    expect((await request(app()).get('/api/v1/users/not-an-objectid')).status).toBe(404)
  })
})

describe('PATCH /api/v1/users/:id', () => {
  it('lets a user update their own profile', async () => {
    const { agent, id } = await signedInAgent(app(), 'author')
    const res = await agent.patch(`/api/v1/users/${id}`).send({ bio: 'I write things.' })
    expect(res.status).toBe(200)
    expect(res.body.bio).toBe('I write things.')
  })

  it('REGRESSION: ACCOUNT TAKEOVER — a user cannot modify another user (legacy user.js:73)', async () => {
    const a = app()
    const { id: victimId } = await signedInAgent(a, 'victim')
    const { agent: attacker } = await signedInAgent(a, 'attacker')

    const res = await attacker.patch(`/api/v1/users/${victimId}`).send({ password: 'attacker-owns-you' })
    expect(res.status).toBe(403)

    // And the victim's password is untouched — they can still sign in.
    const check = request.agent(a)
    expect(
      (await check.post('/api/v1/auth/login').send({ username: 'victim', password: 'correct-horse' })).status,
    ).toBe(200)
  })

  it('returns 401 for an anonymous update', async () => {
    const a = app()
    const { id } = await signedInAgent(a, 'author')
    expect((await request(a).patch(`/api/v1/users/${id}`).send({ bio: 'x' })).status).toBe(401)
  })

  it('REGRESSION: does not reset the password when the field is absent (legacy user.js:79)', async () => {
    // The legacy handler compared plaintext to a hash, so every profile save
    // silently re-hashed and replaced the password.
    const { agent, id } = await signedInAgent(app(), 'author')
    const before = (await UserModel.findById(id))!.password
    await agent.patch(`/api/v1/users/${id}`).send({ bio: 'Just a bio.' })
    expect((await UserModel.findById(id))!.password).toBe(before)
  })

  it('hashes a new password rather than storing it plaintext', async () => {
    const { agent, id } = await signedInAgent(app(), 'author')
    await agent.patch(`/api/v1/users/${id}`).send({ password: 'a-brand-new-password' })
    const stored = (await UserModel.findById(id))!.password!
    expect(stored).not.toBe('a-brand-new-password')
    expect(await bcrypt.compare('a-brand-new-password', stored)).toBe(true)
  })

  it('ignores a username field — usernames are not editable here', async () => {
    const { agent, id } = await signedInAgent(app(), 'author')
    await agent.patch(`/api/v1/users/${id}`).send({ username: 'renamed' })
    expect((await UserModel.findById(id))!.username).toBe('author')
  })
})

describe('DELETE /api/v1/users/:id', () => {
  it('lets a user delete their own account', async () => {
    const { agent, id } = await signedInAgent(app(), 'author')
    expect((await agent.delete(`/api/v1/users/${id}`)).status).toBe(204)
    expect(await UserModel.findById(id)).toBeNull()
  })

  it('REGRESSION: a user cannot delete another user (legacy user.js:60)', async () => {
    const a = app()
    const { id: victimId } = await signedInAgent(a, 'victim')
    const { agent: attacker } = await signedInAgent(a, 'attacker')

    expect((await attacker.delete(`/api/v1/users/${victimId}`)).status).toBe(403)
    expect(await UserModel.findById(victimId)).not.toBeNull()
  })

  it('returns 401 for an anonymous delete', async () => {
    const a = app()
    const { id } = await signedInAgent(a, 'author')
    expect((await request(a).delete(`/api/v1/users/${id}`)).status).toBe(401)
  })
})
```

- [ ] **Step 3: Run it and confirm it fails**

Run: `npm run test -- apps/api/src/routes/v1/users.test.ts`
Expected: FAIL — `/api/v1/users` 404s.

- [ ] **Step 4: Extend `userService`**

Append to the `userService` object in `apps/api/src/lib/services/user.ts` (and add `UpdateUser` to the `@blog/shared` import):

```ts
  async updateProfile(id: string, input: UpdateUser): Promise<PublicUser> {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundError('User not found.')
    const user = await UserModel.findById(id)
    if (!user) throw new NotFoundError('User not found.')

    if (input.bio !== undefined) user.bio = input.bio
    if (input.image !== undefined) user.image = input.image
    // Only when explicitly provided. The legacy handler compared the plaintext
    // field to the stored hash, so every profile save reset the password.
    if (input.password !== undefined) {
      user.password = await bcrypt.hash(input.password, BCRYPT_COST)
    }

    await user.save()
    return this.getPublicProfile(id)
  },

  async remove(id: string): Promise<void> {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundError('User not found.')
    const result = await UserModel.findByIdAndDelete(id)
    if (!result) throw new NotFoundError('User not found.')
  },
```

- [ ] **Step 5: Implement the users router**

Create `apps/api/src/routes/v1/users.ts`:

```ts
import { ForbiddenError, UpdateUserSchema } from '@blog/shared'
import { Router, type RequestHandler } from 'express'
import { userService } from '../../lib/services/user.js'
import { requireAuth } from '../../middleware/require-auth.js'
import { validate } from '../../middleware/validate.js'

export const usersRouter = Router()

/**
 * A User has no `author` field — the user IS the resource — so requireOwner's
 * shape does not fit. Same rule, compared directly: the session identity must
 * match the id in the URL.
 *
 * This is THE account-takeover fix. The legacy /update-user read the target id
 * AND the new password from the request body, so anyone could rewrite anyone.
 */
const requireSelf: RequestHandler<{ id: string }> = (req, _res, next) => {
  if (req.session.userId !== req.params.id) {
    next(new ForbiddenError('You can only modify your own account.'))
    return
  }
  next()
}

usersRouter.get('/:id', async (req, res) => {
  res.json(await userService.getPublicProfile(req.params.id))
})

usersRouter.patch(
  '/:id',
  requireAuth,
  requireSelf,
  validate(UpdateUserSchema),
  async (req, res) => {
    res.json(await userService.updateProfile(req.params.id, req.body))
  },
)

usersRouter.delete('/:id', requireAuth, requireSelf, async (req, res) => {
  await userService.remove(req.params.id)
  req.session.destroy(() => {})
  res.status(204).end()
})
```

- [ ] **Step 6: Mount it**

In `apps/api/src/routes/v1/index.ts`:

```ts
import { usersRouter } from './users.js'
```

```ts
v1Router.use('/users', usersRouter)
```

- [ ] **Step 7: Run it and confirm it passes**

Run: `npm run test -- apps/api/src/routes/v1/users.test.ts`
Expected: PASS (12 tests)

- [ ] **Step 8: Gate and commit**

Run: `npm run typecheck && npm run lint && npm run test`

```bash
git add apps/api/src packages/shared/src/schemas/user.ts
git commit -m "feat(api): user profile routes — closes the account-takeover hole

REGRESSION tests for three legacy holes:
- a user cannot modify another user (user.js:73 — account takeover)
- a user cannot delete another user (user.js:60)
- a profile update no longer silently resets the password (user.js:79
  compared plaintext to a hash, so every save re-hashed)

UpdateUserSchema carries no id and no username: the URL identifies the
user and the session proves who is asking."
```

---

## Task 11: Composition root and the SPA catch-all

**Files:**
- Create: `apps/api/src/static.ts`
- Create: `apps/api/src/index.ts`
- Modify: `apps/api/src/app.ts`
- Test: `apps/api/src/static.test.ts`

**Interfaces:**
- Consumes: `buildApp` (Task 2/3), `loadEnv` (Task 2), `getRedis` (Task 3), `connectDb` (`@blog/shared`)
- Produces: `mountStatic(app: express.Express, clientDist: string): void`; a runnable `dist/index.js`

> **Why this is in P1 at all, with no client to serve:** the Express 5 wildcard
> change is a startup-time crash, and the catch-all is the one route that can
> shadow the entire API. Proving both now — against a fixture directory — means
> P2 only has to drop a real build in. `mountStatic` is skipped when the
> directory is absent, which is the P1 default.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/static.test.ts`:

```ts
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { buildApp } from './app.js'

/** A stand-in for apps/client/dist, which does not exist until P2. */
function fixtureDist() {
  const dir = mkdtempSync(join(tmpdir(), 'client-dist-'))
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>SPA</title>')
  writeFileSync(join(dir, 'app.js'), 'console.log("bundle")')
  return dir
}

const app = () => buildApp({ clientDist: fixtureDist() })

describe('SPA static serving', () => {
  it('serves index.html at the root', async () => {
    const res = await request(app()).get('/')
    expect(res.status).toBe(200)
    expect(res.text).toContain('<title>SPA</title>')
  })

  it('serves a real asset from the build', async () => {
    const res = await request(app()).get('/app.js')
    expect(res.status).toBe(200)
    expect(res.text).toContain('bundle')
  })

  it('returns index.html for a client route so a refresh does not 404', async () => {
    const res = await request(app()).get('/blog/some-post')
    expect(res.status).toBe(200)
    expect(res.text).toContain('<title>SPA</title>')
  })
})

describe('the catch-all MUST NOT shadow the API (spec §3 hazard 2, §14)', () => {
  it('still routes a real API request to the API', async () => {
    const res = await request(app()).get('/api/v1/health')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ status: 'ok' })
  })

  it('returns JSON 404 — not index.html — for an unknown API route', async () => {
    // If the catch-all wins here, every mistyped API call returns HTML with a
    // 200 and debugging becomes miserable.
    const res = await request(app()).get('/api/v1/does-not-exist')
    expect(res.status).toBe(404)
    expect(res.headers['content-type']).toMatch(/json/)
    expect(res.text).not.toContain('<title>SPA</title>')
  })

  it('returns JSON 401 — not index.html — for an unauthorized API route', async () => {
    const res = await request(app()).get('/api/v1/auth/me')
    expect(res.status).toBe(401)
    expect(res.headers['content-type']).toMatch(/json/)
  })
})

describe('no client build present (the P1 default)', () => {
  it('boots fine and serves the API', async () => {
    const res = await request(buildApp({})).get('/api/v1/health')
    expect(res.status).toBe(200)
  })

  it('404s a client route instead of crashing', async () => {
    expect((await request(buildApp({})).get('/blog')).status).toBe(404)
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm run test -- apps/api/src/static.test.ts`
Expected: FAIL — `buildApp` does not accept `clientDist`.

- [ ] **Step 3: Implement `mountStatic`**

Create `apps/api/src/static.ts`:

```ts
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import express from 'express'

/**
 * Serves the built SPA and returns index.html for any non-API route, so a
 * refresh on a client route survives (spec §11: one origin, no CORS anywhere).
 *
 * Registered AFTER the API routers and BEFORE the 404 handler.
 */
export function mountStatic(app: express.Express, clientDist: string): void {
  const dir = resolve(clientDist)
  if (!existsSync(dir)) {
    // The P1 default: there is no client yet. Serving the API alone is correct.
    console.warn(`No client build at ${dir} — serving the API only.`)
    return
  }

  app.use(express.static(dir, { index: false }))

  // EXPRESS 5: '*' is NOT a valid path — path-to-regexp v8 throws
  // "Missing parameter name at index 1" AT STARTUP. The wildcard must be named:
  // '/*splat'. (Spec §3 hazard 2 shows the Express 4 form; it would crash here.)
  app.get('/*splat', (req, res, next) => {
    // Never let the SPA answer for the API. Without this guard an unknown API
    // route returns index.html with a 200, and a fetch() gets HTML where it
    // expected JSON — the single most confusing failure mode in this topology.
    if (req.path.startsWith('/api/')) {
      next()
      return
    }
    res.sendFile(join(dir, 'index.html'))
  })
}
```

- [ ] **Step 4: Wire it into `app.ts`**

Add to `BuildAppOptions`:

```ts
  /** Directory holding the built SPA. Absent in P1 — there is no client yet. */
  clientDist?: string
```

Add the import:

```ts
import { mountStatic } from './static.js'
```

And replace the `// static SPA catch-all goes here — Task 11` comment with:

```ts
  if (opts.clientDist) mountStatic(app, opts.clientDist)
```

- [ ] **Step 5: Run it and confirm it passes**

Run: `npm run test -- apps/api/src/static.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 6: Write the composition root**

Create `apps/api/src/index.ts`:

```ts
import { connectDb } from '@blog/shared'
import { RedisStore } from 'connect-redis' // NAMED export in v9 — there is no default
import { loadEnv } from './lib/env.js'
import { getRedis } from './lib/redis.js'
import { buildApp } from './app.js'

async function main(): Promise<void> {
  // Validate the environment FIRST: fail before opening any connection.
  const env = loadEnv()
  const isProd = env.NODE_ENV === 'production'

  const redis = await getRedis(env.REDIS_URL)
  await connectDb(env.MONGODB_URI)

  const app = buildApp({
    session: {
      store: new RedisStore({ client: redis, prefix: 'sess:' }),
      secret: env.SESSION_SECRET,
      secure: isProd, // a Secure cookie over plain http:// is silently dropped
    },
    trustProxy: isProd, // Render terminates TLS at a proxy
    clientDist: env.CLIENT_DIST,
  })

  app.listen(env.PORT, () => {
    console.log(`API listening on :${env.PORT} (${env.NODE_ENV})`)
  })
}

main().catch((err) => {
  console.error('Fatal startup error:', err)
  process.exit(1)
})
```

- [ ] **Step 7: Verify the production build runs**

This is the first time the whole tsup + `noExternal` chain is exercised.

Run: `npm run build --workspace=@blog/api`
Expected: `ESM dist/index.js` and `Build success`.

Then confirm the bundle inlined the shared package rather than leaving a bare import that would crash at runtime:

Run: `grep -c "@blog/shared" apps/api/dist/index.js || echo "inlined - good"`
Expected: `inlined - good`

Then confirm it fails correctly with no env — this proves the no-fallback rule:

Run: `node apps/api/dist/index.js`
Expected: exit 1, `Invalid environment:` listing `MONGODB_URI`, `REDIS_URL`, `SESSION_SECRET`. **It must not start.**

- [ ] **Step 8: Gate and commit**

Run: `npm run typecheck && npm run lint && npm run test`

```bash
git add apps/api
git commit -m "feat(api): composition root and SPA catch-all

- EXPRESS 5: the catch-all is '/*splat'; a bare '*' throws at startup
  (path-to-regexp v8). The spec's §3 example is the Express 4 form.
- the catch-all excludes /api/ so it cannot shadow the API — asserted:
  an unknown API route returns JSON 404, never index.html
- mountStatic no-ops when there is no build, which is the P1 default
- index.ts validates env before opening any connection and refuses to
  boot without SESSION_SECRET"
```

---

## Task 12: Docker and Compose

**Files:**
- Create: `apps/api/Dockerfile`
- Create: `.dockerignore`
- Create: `compose.yaml`
- Create: `compose.e2e.yaml`
- Modify: `.gitignore` (ensure `compose.override.yaml` is ignored)

**Interfaces:**
- Consumes: `apps/api` build (Task 11)
- Produces: `docker compose watch` dev stack; `compose.e2e.yaml` serving the prod image on :3000

- [ ] **Step 1: Write the `.dockerignore`**

Carried from the abandoned branch, minus the Next.js entries. Create `.dockerignore`:

```
**/node_modules
.git
.worktrees
.vscode
docs
dist
*.tsbuildinfo
.env*
coverage
test-results
playwright-report
.DS_Store
```

- [ ] **Step 2: Write the Dockerfile**

Create `apps/api/Dockerfile`:

```dockerfile
# syntax=docker/dockerfile:1
FROM node:22-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/
# The optional extra-ca build secret lets machines behind a TLS-intercepting
# proxy/AV supply their interception root CA (via gitignored
# compose.override.yaml) without it ever entering the image or the repo.
# When the secret is absent — CI, Render, any normal machine — this is a no-op.
RUN --mount=type=secret,id=extra-ca,target=/tmp/extra-ca.pem \
    if [ -s /tmp/extra-ca.pem ]; then export NODE_EXTRA_CA_CERTS=/tmp/extra-ca.pem; fi \
    && npm ci

FROM deps AS dev
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev", "--workspace=@blog/api"]

FROM deps AS builder
COPY . .
RUN npm run build --workspace=@blog/api

FROM base AS runner
ENV NODE_ENV=production
# Non-root. The legacy Dockerfile ran as root with a Windows WORKDIR in a Linux image.
RUN addgroup -g 1001 nodejs && adduser -S -u 1001 -G nodejs api
# tsup bundles @blog/shared and every workspace import into dist/index.js, so the
# runner needs the bundle and the production node_modules — no source, no tsx.
COPY --from=builder --chown=api:nodejs /app/apps/api/dist ./dist
COPY --from=builder --chown=api:nodejs /app/node_modules ./node_modules
USER api
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

- [ ] **Step 3: Write the dev Compose file**

Create `compose.yaml`:

```yaml
name: blogchat

services:
  api:
    build:
      context: .
      dockerfile: apps/api/Dockerfile
      target: dev
    ports: ['3000:3000']
    environment:
      NODE_ENV: development
      MONGODB_URI: mongodb://mongo:27017/blogchat
      REDIS_URL: redis://redis:6379
      # Dev-only throwaway. It protects nothing and grants nothing: the real
      # secret is set in the Render dashboard and never lives in this repo.
      SESSION_SECRET: dev-only-session-secret-not-for-production
    depends_on:
      mongo: { condition: service_healthy }
      redis: { condition: service_healthy }
    develop:
      watch:
        - action: sync
          path: ./apps/api
          target: /app/apps/api
          ignore: [node_modules/, dist/]
        - action: sync
          path: ./packages/shared
          target: /app/packages/shared
          ignore: [node_modules/, dist/]
        - action: rebuild
          path: ./package.json
        - action: rebuild
          path: ./package-lock.json

  mongo:
    image: mongo:8
    # 127.0.0.1 ONLY. Mongo runs unauthenticated here; on 0.0.0.0 it would be an
    # open database on the LAN.
    ports: ['127.0.0.1:27019:27017']
    volumes: ['mongo-data:/data/db']
    healthcheck:
      test: ['CMD', 'mongosh', '--quiet', '--eval', "db.adminCommand('ping')"]
      interval: 5s
      timeout: 5s
      retries: 10

  redis:
    image: redis:7-alpine
    ports: ['127.0.0.1:6379:6379']
    healthcheck:
      test: ['CMD', 'redis-cli', 'ping']
      interval: 5s
      timeout: 3s
      retries: 10

volumes:
  mongo-data:
```

- [ ] **Step 4: Write the E2E Compose file**

Create `compose.e2e.yaml`:

```yaml
# The stack CI stands up, built from the PROD image (target: runner) — the same
# artifact Render would run. A broken production build fails here, not on deploy.
# Everything is ephemeral: no volumes, torn down with `down -v`.
name: blogchat-e2e

services:
  api:
    build:
      context: .
      dockerfile: apps/api/Dockerfile
      target: runner
    ports: ['3000:3000']
    environment:
      NODE_ENV: production
      MONGODB_URI: mongodb://mongo:27017/blogchat
      REDIS_URL: redis://redis:6379
      SESSION_SECRET: e2e-only-session-secret-not-for-production
    depends_on:
      mongo: { condition: service_healthy }
      redis: { condition: service_healthy }
    healthcheck:
      # `up --wait` blocks on this, so CI never races the boot.
      test:
        ['CMD', 'node', '-e', "fetch('http://localhost:3000/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
      interval: 5s
      timeout: 5s
      retries: 20

  mongo:
    image: mongo:8
    healthcheck:
      test: ['CMD', 'mongosh', '--quiet', '--eval', "db.adminCommand('ping')"]
      interval: 5s
      timeout: 5s
      retries: 10

  redis:
    image: redis:7-alpine
    healthcheck:
      test: ['CMD', 'redis-cli', 'ping']
      interval: 5s
      timeout: 3s
      retries: 10
```

Note: mongo and redis publish **no ports** here — nothing outside the Compose network needs them.

- [ ] **Step 5: Confirm `compose.override.yaml` is gitignored**

Check `.gitignore` contains it; add it if not:

```
compose.override.yaml
```

That file is where this machine supplies its Avast root CA to the `extra-ca` secret. **A CA certificate must never be committed or baked into an image.**

- [ ] **Step 6: Verify the dev stack comes up**

Run: `docker compose up -d --build`
Then: `curl -s http://localhost:3000/api/v1/health`
Expected: `{"status":"ok"}`

> **If the build fails on `npm ci` with a TLS/certificate error**, that is Avast
> intercepting container TLS (a known property of this machine). Create a
> gitignored `compose.override.yaml` supplying the `extra-ca` secret — see
> CLAUDE.md and spec §11. Do **not** disable TLS verification and do **not**
> commit the certificate.

- [ ] **Step 7: Verify the prod stack comes up**

Run: `docker compose -f compose.e2e.yaml up -d --build --wait`
Then: `curl -s http://localhost:3000/api/v1/health`
Expected: `{"status":"ok"}` — this proves the runner image, and therefore the Render build, actually works.

Tear down both:

Run: `docker compose -f compose.e2e.yaml down -v && docker compose down`

- [ ] **Step 8: Commit**

```bash
git add .dockerignore compose.yaml compose.e2e.yaml apps/api/Dockerfile .gitignore
git commit -m "build: multi-stage Dockerfile and dev/e2e compose stacks

- runner target is non-root and ships only the tsup bundle + prod deps
- compose.yaml uses watch-sync, not bind mounts: a bind-mounted node_modules
  breaks across the Windows→Linux boundary and inotify is unreliable there
- mongo/redis bind to 127.0.0.1: they run unauthenticated locally
- compose.e2e.yaml builds the PROD image, so a broken prod build fails in CI
- optional extra-ca build secret for TLS-intercepting AV; never baked in"
```

---

## Task 13: Seed script

**Files:**
- Create: `apps/api/src/scripts/seed.ts`

**Interfaces:**
- Consumes: `connectDb`, models (`@blog/shared`); `userService` (Task 5)
- Produces: `npm run seed` — an idempotent demo dataset with a known demo account

- [ ] **Step 1: Write the seed script**

Create `apps/api/src/scripts/seed.ts`:

```ts
import { LikeModel, PostModel, UserModel, connectDb, slugify } from '@blog/shared'
import mongoose from 'mongoose'
import { loadEnv } from '../lib/env.js'
import { userService } from '../lib/services/user.js'

/**
 * Seeds a demo dataset. Destructive and idempotent: it wipes the collections it
 * owns and rewrites them, so running it twice yields the same database.
 *
 * The demo account password is a DEMO credential for a throwaway dataset, not a
 * secret: the whole point is that a visitor can sign in with it. It still must
 * not be the same string as anything real.
 */
const DEMO_PASSWORD = 'demo-password-1234'

const POSTS = [
  {
    title: 'Rebuilding a Five-Year-Old MERN App',
    premium: false,
    tags: ['engineering', 'react'],
    body: [
      'This blog is a rebuild of a MERN app I wrote five years ago.',
      'The original had five authorization holes, a Redux store that cached server state by hand, and a Dockerfile that never worked. Every one of those is a test in this codebase now.',
      'The rebuild is an Express REST API with a React SPA in front of it. Not because the old stack was slow — because the new one is explicit.',
    ].join('\n\n'),
  },
  {
    title: 'Why Identity Never Comes From The Request Body',
    premium: false,
    tags: ['security'],
    body: [
      'The legacy app had an endpoint that took a user id and a new password, both from the request body, and applied them.',
      'That is an account takeover, not a bug. Anyone could rewrite anyone. The fix is one sentence: identity always comes from the session, never from a body field.',
      'Every mutation in this API compares req.session.userId to the resource owner, and there is a test for each of the five holes the old app had.',
    ].join('\n\n'),
  },
  {
    title: 'Gating Content At The Serialization Boundary',
    premium: true,
    tags: ['engineering', 'security'],
    body: [
      'A paywall implemented in a component is a suggestion. The body is still in the JSON, one DevTools tab away.',
      'This post is premium, so if you are reading this paragraph you are signed in — the API never serialized it otherwise.',
      'The rule lives in postService.getBySlug, which does not copy the body into its return value when the reader is anonymous. There is nothing to find in the response because it was never put there.',
    ].join('\n\n'),
  },
]

async function seed(): Promise<void> {
  const env = loadEnv()
  await connectDb(env.MONGODB_URI)
  // The unique indexes are layer 3 of the authorization model — build them.
  await mongoose.syncIndexes()

  console.log('Wiping posts, likes and users…')
  await Promise.all([PostModel.deleteMany({}), LikeModel.deleteMany({}), UserModel.deleteMany({})])

  const demo = await userService.signup({
    username: 'demo',
    email: 'demo@example.com',
    password: DEMO_PASSWORD,
  })
  const reader = await userService.signup({
    username: 'reader',
    email: 'reader@example.com',
    password: DEMO_PASSWORD,
  })
  console.log(`Created users: ${demo.username}, ${reader.username}`)

  for (const post of POSTS) {
    const created = await PostModel.create({
      ...post,
      slug: slugify(post.title),
      author: new mongoose.Types.ObjectId(demo.id),
    })
    // One like from the reader, so likeCount is not uniformly zero in the demo.
    await LikeModel.create({ user: new mongoose.Types.ObjectId(reader.id), post: created._id })
    console.log(`  ${created.slug}${post.premium ? ' (premium)' : ''}`)
  }

  await mongoose.disconnect()
  console.log(`\nDone. Sign in as: demo / ${DEMO_PASSWORD}`)
}

seed().catch((err) => {
  console.error('Seed failed:', err)
  process.exit(1)
})
```

- [ ] **Step 2: Run it against the dev stack**

Run: `docker compose up -d`
Then: `MONGODB_URI=mongodb://localhost:27019/blogchat REDIS_URL=redis://localhost:6379 SESSION_SECRET=local-seed-secret-at-least-32-chars npm run seed`

Expected:
```
Wiping posts, likes and users…
Created users: demo, reader
  rebuilding-a-five-year-old-mern-app
  why-identity-never-comes-from-the-request-body
  gating-content-at-the-serialization-boundary (premium)

Done. Sign in as: demo / demo-password-1234
```

Note the port is **27019** — that is what `compose.yaml` publishes on the host.

- [ ] **Step 3: Verify the seeded gating rule with curl — the P1 demo**

This is the "demoable via curl alone" acceptance check from spec §13.

Anonymous read of the premium post:

```bash
curl -s http://localhost:3000/api/v1/posts/gating-content-at-the-serialization-boundary | grep -c "never put there" || echo "GATED - the bytes are absent"
```

Expected: `GATED - the bytes are absent`

Signed-in read of the same post:

```bash
curl -s -c /tmp/jar -X POST http://localhost:3000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"demo","password":"demo-password-1234"}'
curl -s -b /tmp/jar http://localhost:3000/api/v1/posts/gating-content-at-the-serialization-boundary | grep -c "never put there"
```

Expected: `1` — the full body is present for a signed-in reader.

Tear down: `docker compose down`

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/scripts/seed.ts
git commit -m "feat(api): seed script with a demo account

Idempotent and destructive: wipes and rewrites the collections it owns.
Seeds one premium post, so the gating rule is demoable with curl alone."
```

---

## Task 14: CI workflow

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: everything above
- Produces: a 4-stage PR pipeline with a manual production gate

> Carried forward from PR #8 (`dev/ci-cd-pipeline`), whose *shape* the spec keeps
> verbatim. Two things change: the build/test commands target `@blog/api`, and
> **the stage-4 smoke test hits `/api/v1/health`, not `/blog`.** PR #8's stage 4
> failed because `compose.e2e.yaml` did not exist; it does now (Task 12).

- [ ] **Step 1: Write the workflow**

Create `.github/workflows/ci.yml`:

```yaml
name: CI/CD

# PRs only. A raw commit to a feature branch must never run the pipeline.
on:
  pull_request:

permissions:
  contents: read

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  build:
    name: '1-2. Source & Build'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: npm
      - run: npm ci
      - run: npm run typecheck
      - run: npm run lint
      - run: npm run build

  test:
    name: '3. Test'
    needs: build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: npm
      - run: npm ci
      # Vitest unit + Supertest integration. mongodb-memory-server downloads a
      # binary on the first run, which is why vitest.config.ts allows 30s.
      - run: npm run test

  staging-deploy:
    name: '4. Staging Deploy (ephemeral)'
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Bring up the ephemeral prod-image stack
        # Builds the `runner` target — the same image Render would run — so a
        # broken production build fails here rather than after a real deploy.
        run: docker compose -f compose.e2e.yaml up --build --wait
      - name: Smoke test the API
        run: |
          status=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/v1/health)
          echo "GET /api/v1/health -> $status"
          test "$status" = "200"
      - name: Show logs on failure
        if: failure()
        run: docker compose -f compose.e2e.yaml logs
      - name: Tear down
        if: always()
        run: docker compose -f compose.e2e.yaml down -v

  prod-deploy:
    name: '5. Production Deploy'
    needs: staging-deploy
    runs-on: ubuntu-latest
    # Gated on a human approving in the GitHub Actions UI. Never runs unattended.
    environment: production
    steps:
      - run: |
          echo "Render auto-deploys on push to master via its own GitHub webhook."
          echo "This job exists to make the pipeline stage explicit and to gate"
          echo "it behind manual approval — it does not itself trigger a deploy."
```

- [ ] **Step 2: Verify the CI steps pass locally first**

CI runs exactly these. Confirm before pushing:

Run: `npm ci && npm run typecheck && npm run lint && npm run build && npm run test`
Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: 4-stage PR pipeline with a manual production gate

Carried from PR #8, retargeted at @blog/api. Stage 4 stands up
compose.e2e.yaml — the prod image — so a broken production build fails in
CI rather than on Render. PR #8's stage 4 failed only because that file
did not exist yet; it does now.

Smoke test hits /api/v1/health (P1 has no /blog route — that is P2)."
```

---

## Task 15: `render.yaml`, docs, and the deploy gate

**Files:**
- Create: `render.yaml`
- Modify: `README.md`
- Modify: `docs/architecture/deployment-architecture.md`

**Interfaces:**
- Consumes: everything above
- Produces: prod infrastructure-as-code; a P1 that is complete and ready for a **user-approved** deploy

- [ ] **Step 1: Write `render.yaml`**

Create `render.yaml`:

```yaml
# Production infrastructure as code (spec §7, §12).
# apps/realtime is NOT here — it lands in P4.
services:
  - type: web
    name: blogchat-api
    runtime: docker
    dockerfilePath: ./apps/api/Dockerfile
    dockerContext: .
    # All services and the Key Value instance MUST share a region: the internal
    # connection URL is only reachable from services inside it.
    region: frankfurt
    plan: free
    healthCheckPath: /api/v1/health
    envVars:
      - key: NODE_ENV
        value: production
      # Generated by Render and never seen by us or the repo.
      - key: SESSION_SECRET
        generateValue: true
      # Set in the dashboard. NEVER committed, NEVER a hardcoded fallback.
      - key: MONGODB_URI
        sync: false
      - key: REDIS_URL
        fromService:
          type: keyvalue
          name: blogchat-keyvalue
          property: connectionString

  # Managed addon, not a container we build.
  - type: keyvalue
    name: blogchat-keyvalue
    region: frankfurt
    plan: free
    # EMPTY = no public access. Internal connections ride the private network and
    # are unauthenticated by default, so exposing this publicly would be genuinely
    # dangerous. It is therefore unreachable from a laptop — local dev uses the
    # Compose redis container.
    ipAllowList: []
    # Guards against OOM in 25 MB. With sessions in here, eviction can log a user
    # out early; at demo scale it will not trigger.
    maxmemoryPolicy: allkeys-lru
```

> **Verify the region** against the existing Render service before deploying — it
> must match, and `region` is not something to guess.

- [ ] **Step 2: Update the README**

Replace the README's setup section (or add one if absent) with:

````markdown
## Quick start

```bash
cp .env.example .env       # then fill in SESSION_SECRET
npm install
npm run dev                # docker compose watch — api, mongo, redis
npm run seed               # demo data + a demo account
```

The API is on http://localhost:3000/api/v1. There is no UI yet — that is P2.

## Try the authorization model with curl

```bash
# Anonymous: the premium post's body is a teaser. The full text is not in the
# response at all — the API never serialized it.
curl -s localhost:3000/api/v1/posts/gating-content-at-the-serialization-boundary

# Signed in: the full body.
curl -s -c jar -X POST localhost:3000/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"demo","password":"demo-password-1234"}'
curl -s -b jar localhost:3000/api/v1/posts/gating-content-at-the-serialization-boundary
```

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Full stack via `docker compose watch`, hot reload |
| `npm run seed` | Wipe and reseed the demo dataset |
| `npm run typecheck` | Per-workspace `tsc --noEmit` |
| `npm run lint` | ESLint (flat config) |
| `npm run test` | Vitest unit + Supertest integration |
| `npm run build` | tsup bundle for production |
````

- [ ] **Step 3: Update the architecture doc's status markers**

In `docs/architecture/deployment-architecture.md`, update the status table so P1's rows read 🚧/✅ rather than 📋, and update **Last verified against reality** to the current date. Specifically:

- `apps/api` Render service: 📋 planned → 🚧 built, not yet deployed
- Render Key Value: 📋 planned → 🚧 declared in `render.yaml`, not yet provisioned
- The "CI ephemeral staging" heading note about `compose.e2e.yaml` not existing is now stale — it exists. Replace that paragraph with a note that stage 4 stands up the prod image and smoke-tests `/api/v1/health`.

- [ ] **Step 4: Verify the §14 regression checklist**

Walk spec §14 and confirm each P1-scoped item has a test. Tick them in the spec:

| Item | Test |
|---|---|
| Non-owner cannot delete a post | `posts.test.ts` "REGRESSION: a non-owner gets 403 (legacy post.js:42…)" |
| Non-owner cannot edit a post | `posts.test.ts` "REGRESSION: a non-owner gets 403 (legacy post.js:34…)" |
| User cannot modify another user's account | `users.test.ts` "REGRESSION: ACCOUNT TAKEOVER…" |
| User cannot delete another user's account | `users.test.ts` "REGRESSION: a user cannot delete another user…" |
| Logout requires auth and is POST-only | `auth.test.ts` "is POST-only — GET /logout is 404" + "requires authentication" |
| Like requires auth, uses session identity | `likes.test.ts` "REGRESSION: requires authentication" + "ignores a user field in the body" |
| Session token not readable by JavaScript | `session.test.ts` "is httpOnly…" |
| Login does not reveal whether a username exists | `auth.test.ts` "returns the IDENTICAL response for an unknown username" |
| Premium body absent for an anonymous reader | `posts.test.ts` "leaves the gated bytes ABSENT from the RAW premium response" |
| Password not silently reset on profile update | `users.test.ts` "REGRESSION: does not reset the password when the field is absent" |
| Double-click cannot double-like | `likes.test.ts` "is idempotent over HTTP" + `models.test.ts` unique index |
| Unique username/email by index, not a racy findOne | `user.test.ts` "turns a duplicate-key race into ConflictError" |
| Production build and static serving work | `compose.e2e.yaml` in CI stage 4 + `static.test.ts` |
| Middleware order is correct | `app.test.ts` "middleware order" |
| SPA catch-all does not shadow `/api/*` | `static.test.ts` "the catch-all MUST NOT shadow the API" |

**Out of P1 scope** (later phases, listed so the gap is deliberate rather than forgotten):
chat identity (P4); socket listener cleanup (P4); chat `disconnect` on render (P4); failed delete removing the post from the UI (P2); password confirmation validated before the request (P2); search crash on an empty body (P5); the loading state actually rendering (P2); logout firing before delete resolves (P2).

- [ ] **Step 5: Final full gate**

Run: `npm ci && npm run typecheck && npm run lint && npm run build && npm run test`
Expected: all pass, no skips.

- [ ] **Step 6: Commit**

```bash
git add render.yaml README.md docs/
git commit -m "docs: render.yaml, README quick start, architecture status

- render.yaml declares the api web service + Key Value addon (realtime is P4)
- SESSION_SECRET uses generateValue; MONGODB_URI uses sync: false — no secret
  is committed and none has a hardcoded fallback
- ipAllowList: [] — the Key Value instance has no public access
- README shows the gating rule as a two-command curl demo"
```

- [ ] **Step 7: STOP — do not push, merge, or deploy**

**This is a hard stop. Do not perform any of the following autonomously.**

Report to the user:

1. P1 is complete on `dev/express-api-foundation`: N commits, the API builds, the full suite passes, and the §14 items in scope each have a test.
2. The Compose e2e stack — the production image — comes up and answers `/api/v1/health`.
3. **Ask** whether to push the branch and open a PR into `staging`.
4. **Do not merge to `master` and do not deploy to Render.** The user validates that CI passed and that staging behaves, and then decides. A described workflow is not authorization.
5. Note the open question that needs the user before any deploy: **the Render region in `render.yaml` must match the existing service** — confirm it rather than guessing.
6. Mention that PR #8 (`dev/ci-cd-pipeline`) is still open and red, and that spec §13 says it should be closed unmerged.

---

## Self-Review Notes

**Spec coverage.** Every P1 element of §13 maps to a task: monorepo re-shape (1), `apps/api` (2), session auth on Redis (3), guards (4), posts CRUD with authorization (7–8), Supertest suite (throughout), Compose dev + e2e (12), seed (13), CI (14), Render deploy prep (15). Likes (9) and users (10) come from the §3 REST table. §14 is audited in Task 15 Step 4, with out-of-scope items named rather than dropped.

**Four places this plan knowingly diverges from the spec, each flagged at its task:**

1. **§3 hazard 2 shows `app.get('*')`, which throws at startup on Express 5.** Verified against express@5.2.1: `Missing parameter name at index 1`. The plan uses `/*splat`. The spec's hazard is real; only its example is Express 4.
2. **§5's `requireOwner` signature does not compile** as written (`load: (req: Request) => ...`). Under `noUncheckedIndexedAccess`, a bare `Request` makes `req.params.slug` `string | string[] | undefined`; typing the loader to its route then fails on contravariance. The plan makes `requireOwner` generic over the params. The *rule* the spec states — identity from the session, 403 on mismatch — is unchanged.
3. **`ConflictError` → 409 is added** to §10's four error types. Duplicate username is a conflict, not a validation failure, and §3 says to prefer correct HTTP semantics.
4. **`static.ts` ships in P1 with no client to serve.** It no-ops without a build. Front-loading it proves the Express 5 wildcard and the API-shadowing guard — the two failure modes that are cheapest to catch now and worst to hit later.

**One design decision the spec leaves open:** `buildApp` takes an injected session store, so the integration suite runs with no Redis container. Real Redis is covered by `compose.e2e.yaml` in CI stage 4.

**What was verified rather than assumed** (all against the live registry / a real compile on 2026-07-16): the Express 5 wildcard crash; Express 5 async-rejection forwarding; `connect-redis@9`'s named `RedisStore` export and its `redis`-not-`ioredis` peer dep; node-redis v6's client API; tsup inlining `@blog/shared` into a bundle that runs on plain `node`; the eslint arity failure on a 4-param error handler; `req.params` typing under `noUncheckedIndexedAccess`; and Task 7's and Task 9's service code typechecking against the real Mongoose models (including that `InferSchemaType` does expose `createdAt`/`updatedAt`).

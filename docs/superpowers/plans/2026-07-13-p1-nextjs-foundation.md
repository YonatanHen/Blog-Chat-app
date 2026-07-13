# Phase 1 — Next.js Foundation: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the legacy CRA + Express app with a deployed Next.js 15 monorepo that has secure credentials auth, posts CRUD with correct authorization, a white/blue design system, a containerized dev/E2E environment, and CI.

**Architecture:** npm-workspaces monorepo. `packages/shared` owns Zod schemas (the single source of truth for validation *and* TypeScript types) plus Mongoose models. `apps/web` is a Next.js 15 App Router app where Server Components read the database directly and Server Actions perform mutations. Every mutating action re-derives identity from the session — never from the request body. Redux, react-router, and the Express server are deleted.

**Tech Stack:** Next.js 15 (App Router, React 19), TypeScript, Mongoose 8, Zod, Auth.js v5 (`next-auth@beta`), Tailwind v4 + shadcn/ui, Vitest + `mongodb-memory-server`, Playwright, Docker Compose, GitHub Actions, Render.

**Reference spec:** `docs/superpowers/specs/2026-07-12-blog-chat-renewal-design.md`

---

## Global Constraints

Every task's requirements implicitly include this section.

- **Node 22 LTS.** Set in `.nvmrc`, `engines`, and all Dockerfiles.
- **TypeScript `strict: true`.** No `any`. No `as` casts to silence errors.
- **Zod is the single source of truth.** TypeScript types are always `z.infer<typeof Schema>` — never hand-written duplicates of a schema.
- **Identity comes from the session, never from client input.** No Server Action may read a user id, username, or ownership claim from `formData` or a request body. This is the rule that closes all five vulnerabilities in the legacy app.
- **`middleware.ts` is UX, not security.** Server Actions are public HTTP endpoints; each one re-authorizes independently.
- **Edge/Node split:** `auth.config.ts` must import **no** Mongoose and **no** bcrypt (it runs on Edge). Only `auth.ts` may.
- **Session strategy is `jwt`** (Auth.js requires this for the Credentials provider). The MongoDB adapter arrives in P5 with OAuth.
- **bcryptjs cost 12.**
- **Theme: light only.** White background, **blue** as the accent/secondary. Body text is near-black with a blue undertone (`--color-ink`), never blue itself — long-form blue text is hard to read. Blue (`--color-brand`) is reserved for actions, links, focus rings, and badges. No dark mode, no `dark:` variants.
- **No `alert()`.** Field errors render inline from Zod's `error.flatten().fieldErrors`; transient feedback uses `sonner`.
- **Free tier only.** Do not introduce any paid service.
- **Never run an `aws` CLI command** without asking the user first.
- **Commit after every task.** Conventional Commits. No `Co-Authored-By` trailer.
- **Branch:** all work lands on `dev/nextjs-foundation`.

---

## File Structure

```
blog-chat-app/
├── .github/workflows/ci.yml         # typecheck → lint → unit → e2e → build
├── .nvmrc                           # 22
├── package.json                     # npm workspaces root; scripts delegate to workspaces
├── tsconfig.base.json               # strict TS, shared by all workspaces
├── eslint.config.mjs                # flat config
├── vitest.config.ts                 # unit tests (node env)
├── playwright.config.ts             # E2E, targets compose.e2e.yaml
├── compose.yaml                     # dev stack + `develop.watch` hot reload
├── compose.e2e.yaml                 # prod-target images, seeded, for E2E/CI
├── render.yaml                      # prod IaC: web + realtime + keyvalue
├── .env.example                     # every var, no secrets
├── packages/shared/
│   ├── src/schemas/{user,post,comment}.ts   # Zod — validation + inferred types
│   ├── src/models/{user,post,like,comment}.ts  # Mongoose
│   ├── src/db.ts                    # globally cached Mongoose connection
│   ├── src/errors.ts                # UnauthorizedError, ForbiddenError, NotFoundError
│   └── src/index.ts                 # public surface
└── apps/web/
    ├── Dockerfile                   # multi-stage: deps → dev / builder → runner
    ├── next.config.ts
    ├── middleware.ts                # route guards (UX)
    ├── app/
    │   ├── layout.tsx  globals.css  error.tsx  not-found.tsx
    │   ├── (auth)/login/page.tsx  (auth)/signup/page.tsx
    │   ├── blog/page.tsx  blog/[slug]/page.tsx  blog/new/page.tsx  blog/[slug]/edit/page.tsx
    │   └── api/auth/[...nextauth]/route.ts
    ├── components/
    │   ├── ui/            # shadcn primitives (cva variants)
    │   ├── patterns/      # PageHeader, EmptyState, SearchBar, PostCard, LikeButton
    │   └── layouts/PageShell.tsx
    ├── lib/
    │   ├── auth.config.ts # EDGE-SAFE. no mongoose, no bcrypt.
    │   ├── auth.ts        # NextAuth() + Credentials.authorize (node runtime)
    │   ├── auth-guards.ts # requireAuth / requireOwner
    │   ├── actions/{auth,posts,likes}.ts
    │   └── services/{user,post,like}.ts
    └── scripts/seed.ts
```

**Responsibility split that matters:** `services/*` contains all business logic and *all* authorization checks, and is unit-tested against `mongodb-memory-server` with no HTTP involved. `actions/*` is a thin boundary: parse with Zod → call the service → `revalidatePath` → return `{ ok }`. Keeping authorization in the service (not the action) is what makes the regression tests in Task 9 possible without spinning up Next.js.

---

## Task 1: Monorepo skeleton and tooling

**Files:**
- Create: `package.json`, `tsconfig.base.json`, `eslint.config.mjs`, `vitest.config.ts`, `.nvmrc`, `.env.example`, `.gitignore`
- Delete: `src/`, `server/`, `public/`, `Dockerfile`, `.dockerignore` (the entire legacy app)

**Interfaces:**
- Consumes: nothing.
- Produces: `npm run typecheck`, `npm run lint`, `npm run test` at the repo root; workspaces `@blog/shared` and `@blog/web`.

- [ ] **Step 1: Create the branch**

```bash
git checkout master && git pull
git checkout -b dev/nextjs-foundation
```

- [ ] **Step 2: Delete the legacy app**

The old code is preserved in git history and on `master`. Keeping it around would mean two apps in one repo.

```bash
git rm -r --quiet src server public Dockerfile .dockerignore package-lock.json package.json
```

- [ ] **Step 3: Write the root workspace config**

`package.json`:
```json
{
  "name": "blog-chat-app",
  "private": true,
  "workspaces": ["packages/*", "apps/*"],
  "engines": { "node": ">=22" },
  "scripts": {
    "dev": "docker compose watch",
    "typecheck": "tsc --build --force",
    "lint": "eslint .",
    "test": "vitest run",
    "test:e2e": "playwright test",
    "seed": "npm run seed --workspace=@blog/web"
  },
  "devDependencies": {
    "@types/node": "^22.10.0",
    "eslint": "^9.17.0",
    "typescript": "^5.7.0",
    "typescript-eslint": "^8.18.0",
    "vitest": "^2.1.0"
  }
}
```

`.nvmrc`:
```
22
```

`tsconfig.base.json` — `strict: true` is the whole point of this file:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "composite": true,
    "declaration": true
  }
}
```

`eslint.config.mjs`:
```js
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['**/.next/**', '**/node_modules/**', '**/dist/**'] },
  ...tseslint.configs.recommended,
  { rules: { '@typescript-eslint/no-explicit-any': 'error' } },
)
```

`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['packages/**/*.test.ts', 'apps/**/*.test.ts'],
    testTimeout: 30_000, // mongodb-memory-server downloads a binary on first run
  },
})
```

`.env.example` — every variable the app reads, with no real values:
```
MONGODB_URI=mongodb://localhost:27017/blogchat
REDIS_URL=redis://localhost:6379
AUTH_SECRET=generate-with-npx-auth-secret
AUTH_URL=http://localhost:3000
```

`.gitignore`:
```
node_modules/
.next/
dist/
*.tsbuildinfo
.env
.env.local
coverage/
test-results/
playwright-report/
```

- [ ] **Step 4: Verify the toolchain runs**

```bash
npm install
npm run lint
```
Expected: ESLint completes with no errors (there is no source code yet, so it has nothing to complain about).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: replace legacy CRA/Express app with monorepo skeleton

Deletes the 5-year-old src/ and server/ trees (preserved on master).
Adds npm workspaces, strict TypeScript, ESLint flat config, Vitest."
```

---

## Task 2: Zod schemas in `packages/shared`

This is the task that establishes the project's core idea: **define a shape once, get validation and types from it.** Everything downstream depends on it.

**Files:**
- Create: `packages/shared/package.json`, `packages/shared/tsconfig.json`
- Create: `packages/shared/src/schemas/user.ts`, `packages/shared/src/schemas/post.ts`
- Test: `packages/shared/src/schemas/schemas.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `SignupSchema`, `LoginSchema`, `type Signup`, `type Login`
  - `CreatePostSchema`, `UpdatePostSchema`, `type CreatePost`, `type UpdatePost`
  - `slugify(title: string): string`
  - `deriveTeaser(body: string, paragraphs?: number): string`

- [ ] **Step 1: Scaffold the workspace**

`packages/shared/package.json`:
```json
{
  "name": "@blog/shared",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "dependencies": {
    "bcryptjs": "^2.4.3",
    "mongoose": "^8.9.0",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "@types/bcryptjs": "^2.4.6",
    "mongodb-memory-server": "^10.1.0"
  }
}
```

`packages/shared/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" },
  "include": ["src/**/*"]
}
```

- [ ] **Step 2: Write the failing test**

`packages/shared/src/schemas/schemas.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { SignupSchema, CreatePostSchema, slugify, deriveTeaser } from './index.js'

describe('SignupSchema', () => {
  it('accepts a valid signup', () => {
    const result = SignupSchema.safeParse({
      username: 'yonatan',
      email: 'y@example.com',
      password: 'correct-horse',
    })
    expect(result.success).toBe(true)
  })

  it('rejects a password shorter than 8 characters', () => {
    const result = SignupSchema.safeParse({
      username: 'yonatan',
      email: 'y@example.com',
      password: 'short',
    })
    expect(result.success).toBe(false)
    expect(result.error!.flatten().fieldErrors.password).toBeDefined()
  })

  it('rejects a malformed email', () => {
    const result = SignupSchema.safeParse({
      username: 'yonatan',
      email: 'not-an-email',
      password: 'correct-horse',
    })
    expect(result.success).toBe(false)
  })

  it('lowercases and trims the email', () => {
    const result = SignupSchema.parse({
      username: 'yonatan',
      email: '  Y@Example.COM ',
      password: 'correct-horse',
    })
    expect(result.email).toBe('y@example.com')
  })
})

describe('CreatePostSchema', () => {
  it('rejects a title shorter than 3 characters', () => {
    const result = CreatePostSchema.safeParse({ title: 'ab', body: 'hello', premium: false })
    expect(result.success).toBe(false)
  })

  it('defaults premium to false and tags to an empty array', () => {
    const result = CreatePostSchema.parse({ title: 'A good title', body: 'hello' })
    expect(result.premium).toBe(false)
    expect(result.tags).toEqual([])
  })

  it('rejects an author field from client input', () => {
    // The legacy app trusted req.body.author. The schema must strip it so it
    // can never reach the database — identity comes from the session only.
    const result = CreatePostSchema.parse({
      title: 'A good title',
      body: 'hello',
      author: 'attacker-controlled-id',
    } as never)
    expect('author' in result).toBe(false)
  })
})

describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    expect(slugify('Hello World')).toBe('hello-world')
  })

  it('strips punctuation and collapses separators', () => {
    expect(slugify('Redis: what is it, really?!')).toBe('redis-what-is-it-really')
  })

  it('trims leading and trailing hyphens', () => {
    expect(slugify('  --Hello--  ')).toBe('hello')
  })
})

describe('deriveTeaser', () => {
  it('returns the first two paragraphs', () => {
    const body = 'One.\n\nTwo.\n\nThree.'
    expect(deriveTeaser(body)).toBe('One.\n\nTwo.')
  })

  it('returns the whole body when it is shorter than the limit', () => {
    expect(deriveTeaser('Only one.')).toBe('Only one.')
  })
})
```

- [ ] **Step 3: Run the test and confirm it fails**

```bash
npm run test -- packages/shared
```
Expected: FAIL — `Failed to resolve import "./index.js"`.

- [ ] **Step 4: Write the schemas**

`packages/shared/src/schemas/user.ts`:
```ts
import { z } from 'zod'

export const SignupSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, 'Username must be at least 3 characters')
    .max(30)
    .regex(/^[a-zA-Z0-9_-]+$/, 'Letters, numbers, hyphens and underscores only'),
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(200),
})

export const LoginSchema = z.object({
  username: z.string().trim().min(1, 'Enter your username'),
  password: z.string().min(1, 'Enter your password'),
})

export type Signup = z.infer<typeof SignupSchema>
export type Login = z.infer<typeof LoginSchema>
```

`packages/shared/src/schemas/post.ts` — note there is **no `author` field**. Zod objects strip unknown keys by default, so an attacker-supplied `author` is silently dropped rather than trusted. That is the schema-level half of the fix for the legacy `req.body.author` bug.

```ts
import { z } from 'zod'

export const CreatePostSchema = z.object({
  title: z.string().trim().min(3, 'Title must be at least 3 characters').max(120),
  body: z.string().trim().min(1, 'Body cannot be empty'),
  premium: z.coerce.boolean().default(false),
  tags: z.array(z.string().trim().min(1)).max(5).default([]),
})

export const UpdatePostSchema = CreatePostSchema.extend({
  postId: z.string().min(1),
})

export type CreatePost = z.infer<typeof CreatePostSchema>
export type UpdatePost = z.infer<typeof UpdatePostSchema>

export function slugify(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function deriveTeaser(body: string, paragraphs = 2): string {
  return body.split(/\n{2,}/).slice(0, paragraphs).join('\n\n')
}
```

`packages/shared/src/index.ts`:
```ts
export * from './schemas/user.js'
export * from './schemas/post.js'
```

- [ ] **Step 5: Run the test and confirm it passes**

```bash
npm run test -- packages/shared
```
Expected: PASS — 12 tests.

- [ ] **Step 6: Commit**

```bash
git add packages/shared
git commit -m "feat(shared): add Zod schemas as the single source of truth

Types are inferred via z.infer, so validation and types cannot drift.
CreatePostSchema deliberately omits 'author' — Zod strips unknown keys, so
client-supplied author ids are dropped rather than trusted (legacy bug)."
```

---

## Task 3: Mongoose models and the cached connection

**Files:**
- Create: `packages/shared/src/db.ts`, `packages/shared/src/errors.ts`
- Create: `packages/shared/src/models/{user,post,like,comment}.ts`
- Test: `packages/shared/src/models/models.test.ts`

**Interfaces:**
- Consumes: nothing from Task 2 (schemas and models are independent).
- Produces: `connectDb(uri: string): Promise<void>`, `UserModel`, `PostModel`, `LikeModel`, `CommentModel`, and `UnauthorizedError`, `ForbiddenError`, `NotFoundError`.

- [ ] **Step 1: Write the failing test**

The two index tests are the ones that matter — they prove the database itself now prevents bugs the legacy code could produce.

`packages/shared/src/models/models.test.ts`:
```ts
import { MongoMemoryServer } from 'mongodb-memory-server'
import mongoose from 'mongoose'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { LikeModel, PostModel, UserModel } from '../index.js'

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
  await Promise.all([UserModel.deleteMany({}), PostModel.deleteMany({}), LikeModel.deleteMany({})])
})

describe('UserModel', () => {
  it('enforces a unique username at the database level', async () => {
    await UserModel.create({ username: 'yonatan', email: 'a@example.com', password: 'x' })
    await expect(
      UserModel.create({ username: 'yonatan', email: 'b@example.com', password: 'x' }),
    ).rejects.toThrow(/duplicate key/i)
  })

  it('enforces a unique email at the database level', async () => {
    await UserModel.create({ username: 'a', email: 'same@example.com', password: 'x' })
    await expect(
      UserModel.create({ username: 'b', email: 'same@example.com', password: 'x' }),
    ).rejects.toThrow(/duplicate key/i)
  })

  it('allows a user with no password (OAuth users have none)', async () => {
    const user = await UserModel.create({ username: 'oauth', email: 'o@example.com' })
    expect(user.password).toBeUndefined()
  })
})

describe('LikeModel', () => {
  it('makes double-liking impossible via a compound unique index', async () => {
    const user = await UserModel.create({ username: 'u', email: 'u@example.com', password: 'x' })
    const post = await PostModel.create({
      title: 'T', slug: 't', body: 'b', author: user._id,
    })

    await LikeModel.create({ user: user._id, post: post._id })
    // The legacy toggle did read-then-write, so two fast clicks could both push.
    await expect(LikeModel.create({ user: user._id, post: post._id })).rejects.toThrow(
      /duplicate key/i,
    )
    expect(await LikeModel.countDocuments({ post: post._id })).toBe(1)
  })
})

describe('PostModel', () => {
  it('enforces a unique slug', async () => {
    const user = await UserModel.create({ username: 'u', email: 'u@example.com', password: 'x' })
    await PostModel.create({ title: 'T', slug: 'dup', body: 'b', author: user._id })
    await expect(
      PostModel.create({ title: 'T2', slug: 'dup', body: 'b', author: user._id }),
    ).rejects.toThrow(/duplicate key/i)
  })
})
```

- [ ] **Step 2: Run the test and confirm it fails**

```bash
npm run test -- packages/shared/src/models
```
Expected: FAIL — `LikeModel` is not exported.

- [ ] **Step 3: Write the models**

`packages/shared/src/models/user.ts`:
```ts
import mongoose, { Schema, type InferSchemaType } from 'mongoose'

const userSchema = new Schema(
  {
    username: { type: String, required: true, unique: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String }, // absent for OAuth users
    image: { type: String },    // S3 object key
    bio: { type: String },
  },
  { timestamps: true },
)

export type User = InferSchemaType<typeof userSchema>
export const UserModel = mongoose.models.User ?? mongoose.model('User', userSchema)
```

> `mongoose.models.User ?? mongoose.model(...)` is not optional. Next.js re-executes modules on hot reload, and calling `mongoose.model()` twice with the same name throws `OverwriteModelError`. Every model file needs this guard.

`packages/shared/src/models/post.ts`:
```ts
import mongoose, { Schema, type InferSchemaType } from 'mongoose'

const postSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true },
    body: { type: String, required: true },
    premium: { type: Boolean, required: true, default: false },
    coverImage: { type: String },
    author: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tags: { type: [String], default: [], index: true },
  },
  { timestamps: true },
)

// Full-text search (used in P4). Replaces the legacy client-side .includes() filter.
postSchema.index({ title: 'text', body: 'text' })

export type Post = InferSchemaType<typeof postSchema>
export const PostModel = mongoose.models.Post ?? mongoose.model('Post', postSchema)
```

`packages/shared/src/models/like.ts`:
```ts
import mongoose, { Schema, type InferSchemaType } from 'mongoose'

const likeSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    post: { type: Schema.Types.ObjectId, ref: 'Post', required: true, index: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
)

// The whole point of this collection: the database refuses a double-like.
likeSchema.index({ user: 1, post: 1 }, { unique: true })

export type Like = InferSchemaType<typeof likeSchema>
export const LikeModel = mongoose.models.Like ?? mongoose.model('Like', likeSchema)
```

`packages/shared/src/models/comment.ts`:
```ts
import mongoose, { Schema, type InferSchemaType } from 'mongoose'

const commentSchema = new Schema(
  {
    body: { type: String, required: true, trim: true },
    author: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    post: { type: Schema.Types.ObjectId, ref: 'Post', required: true, index: true },
    parent: { type: Schema.Types.ObjectId, ref: 'Comment' }, // self-ref → threading (P2)
  },
  { timestamps: true },
)

export type Comment = InferSchemaType<typeof commentSchema>
export const CommentModel = mongoose.models.Comment ?? mongoose.model('Comment', commentSchema)
```

- [ ] **Step 4: Write the cached connection and error types**

`packages/shared/src/db.ts` — the `globalThis` cache is what stops Next.js's dev hot-reload from opening a new connection on every file save until Atlas refuses them:

```ts
import mongoose from 'mongoose'

type Cache = { conn: typeof mongoose | null; promise: Promise<typeof mongoose> | null }

const globalCache = globalThis as typeof globalThis & { _mongoose?: Cache }
const cache: Cache = (globalCache._mongoose ??= { conn: null, promise: null })

export async function connectDb(uri: string): Promise<void> {
  if (cache.conn) return
  cache.promise ??= mongoose.connect(uri, { bufferCommands: false })
  cache.conn = await cache.promise
}
```

`packages/shared/src/errors.ts`:
```ts
export class UnauthorizedError extends Error {
  constructor(message = 'You must be signed in.') {
    super(message)
    this.name = 'UnauthorizedError'
  }
}

export class ForbiddenError extends Error {
  constructor(message = 'You do not have permission to do that.') {
    super(message)
    this.name = 'ForbiddenError'
  }
}

export class NotFoundError extends Error {
  constructor(message = 'Not found.') {
    super(message)
    this.name = 'NotFoundError'
  }
}
```

Extend `packages/shared/src/index.ts`:
```ts
export * from './schemas/user.js'
export * from './schemas/post.js'
export * from './models/user.js'
export * from './models/post.js'
export * from './models/like.js'
export * from './models/comment.js'
export * from './db.js'
export * from './errors.js'
```

- [ ] **Step 5: Run the test and confirm it passes**

```bash
npm run test -- packages/shared
```
Expected: PASS — all schema and model tests.

- [ ] **Step 6: Commit**

```bash
git add packages/shared
git commit -m "feat(shared): add Mongoose models with database-level constraints

- Unique indexes on username, email, slug (legacy had none — racy findOne)
- Compound unique (user, post) on Like makes double-liking impossible
- Cached connection prevents Next.js hot-reload connection exhaustion
- Drops the dead 'tasks' virtual and denormalized authorName/likes fields"
```

---

## Task 4: Next.js app scaffold with the white/blue design system

**Files:**
- Create: `apps/web/package.json`, `apps/web/tsconfig.json`, `apps/web/next.config.ts`
- Create: `apps/web/app/{layout.tsx,globals.css,page.tsx}`
- Create: `apps/web/components/ui/button.tsx`, `apps/web/components/layouts/PageShell.tsx`
- Create: `apps/web/components/patterns/{PageHeader,EmptyState}.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: `<PageShell title description actions>`, `<PageHeader>`, `<EmptyState>`, `<Button variant size>`, and a running Next.js app on port 3000.

- [ ] **Step 1: Scaffold the workspace**

`apps/web/package.json`:
```json
{
  "name": "@blog/web",
  "version": "0.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "seed": "tsx scripts/seed.ts"
  },
  "dependencies": {
    "@blog/shared": "*",
    "bcryptjs": "^2.4.3",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "mongoose": "^8.9.0",
    "next": "^15.1.0",
    "next-auth": "^5.0.0-beta.25",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "sonner": "^1.7.0",
    "tailwind-merge": "^2.6.0",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "tailwindcss": "^4.0.0",
    "tsx": "^4.19.0"
  }
}
```

`apps/web/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "preserve",
    "noEmit": true,
    "composite": false,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

`apps/web/next.config.ts`:
```ts
import type { NextConfig } from 'next'

const config: NextConfig = {
  output: 'standalone', // required for a small Docker/Render image
  transpilePackages: ['@blog/shared'],
}

export default config
```

`apps/web/postcss.config.mjs`:
```js
export default { plugins: { '@tailwindcss/postcss': {} } }
```

- [ ] **Step 2: Define the theme**

Tailwind v4 is CSS-first — design tokens live in `@theme`, not a JS config. **Light only. No `dark:` variants anywhere in this codebase.**

`apps/web/app/globals.css`:
```css
@import 'tailwindcss';

@theme {
  --color-paper: #ffffff;        /* page background */
  --color-ink: #0f172a;          /* body text — near-black with a blue undertone */
  --color-ink-muted: #64748b;    /* secondary text */
  --color-line: #e2e8f0;         /* hairline borders — the main structural device */

  --color-brand: #2563eb;        /* THE accent: actions, links, focus rings, badges */
  --color-brand-hover: #1d4ed8;
  --color-brand-tint: #eff6ff;   /* washes — e.g. the members-only card */

  --color-danger: #b00020;

  --font-sans: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif;
  --font-serif: ui-serif, Georgia, Cambria, serif; /* post bodies — editorial feel */
}

html {
  color-scheme: light;
}

body {
  background: var(--color-paper);
  color: var(--color-ink);
  font-family: var(--font-sans);
  -webkit-font-smoothing: antialiased;
}
```

`apps/web/lib/utils.ts`:
```ts
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

- [ ] **Step 3: Build the Button primitive with cva**

`cva` is the "factory" from the spec: variants are declared once, so no button can be styled ad hoc.

`apps/web/components/ui/button.tsx`:
```tsx
import { cva, type VariantProps } from 'class-variance-authority'
import type { ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors ' +
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 ' +
    'disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'bg-brand text-paper hover:bg-brand-hover',
        outline: 'border border-line bg-paper text-ink hover:border-brand hover:text-brand',
        ghost: 'text-brand hover:bg-brand-tint',
        danger: 'bg-danger text-paper hover:bg-danger/90',
      },
      size: {
        sm: 'h-8 px-3',
        md: 'h-10 px-4',
        lg: 'h-12 px-6 text-base',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
)

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />
}
```

- [ ] **Step 4: Build the layout primitives**

`apps/web/components/patterns/PageHeader.tsx`:
```tsx
import type { ReactNode } from 'react'

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string
  description?: string
  actions?: ReactNode
}) {
  return (
    <header className="mb-10 flex items-end justify-between gap-6 border-b border-line pb-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-ink">{title}</h1>
        {description ? <p className="mt-2 text-ink-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 gap-2">{actions}</div> : null}
    </header>
  )
}
```

`apps/web/components/patterns/EmptyState.tsx`:
```tsx
import type { ReactNode } from 'react'

export function EmptyState({ title, description, action }: {
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="rounded-lg border border-dashed border-line px-6 py-16 text-center">
      <p className="font-medium text-ink">{title}</p>
      {description ? <p className="mt-1 text-sm text-ink-muted">{description}</p> : null}
      {action ? <div className="mt-6 flex justify-center">{action}</div> : null}
    </div>
  )
}
```

`apps/web/components/layouts/PageShell.tsx` — every page composes this, so spacing and width cannot drift between routes:
```tsx
import type { ReactNode } from 'react'
import { PageHeader } from '@/components/patterns/PageHeader'

export function PageShell({ title, description, actions, children }: {
  title: string
  description?: string
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-16">
      <PageHeader title={title} description={description} actions={actions} />
      {children}
    </main>
  )
}
```

- [ ] **Step 5: Root layout and a placeholder home page**

`apps/web/app/layout.tsx`:
```tsx
import type { Metadata } from 'next'
import { Toaster } from 'sonner'
import './globals.css'

export const metadata: Metadata = {
  title: { default: 'Blog', template: '%s — Blog' },
  description: 'A blog with real-time chat.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Toaster position="top-center" />
      </body>
    </html>
  )
}
```

`apps/web/app/page.tsx`:
```tsx
import { redirect } from 'next/navigation'

export default function Home() {
  redirect('/blog')
}
```

- [ ] **Step 6: Verify it renders**

```bash
npm install
npm run dev --workspace=@blog/web
```
Expected: server starts on `http://localhost:3000`, which redirects to `/blog` and 404s (the route does not exist yet). That 404 is the pass condition — it proves routing and the build work.

Then stop the server and confirm types are clean:
```bash
npm run typecheck
```
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add apps/web package-lock.json
git commit -m "feat(web): scaffold Next.js 15 app with white/blue design system

Tailwind v4 CSS-first theme (light only, no dark variants). Blue is the accent
(actions, links, focus, badges); body text stays near-black for readability.
Button uses cva so variants are declared once. PageShell gives every route
identical chrome."
```

---

## Task 5: Docker Compose dev stack with hot reload

**Files:**
- Create: `apps/web/Dockerfile`, `apps/web/.dockerignore`, `compose.yaml`

**Interfaces:**
- Consumes: `apps/web` from Task 4.
- Produces: `docker compose watch` brings up web + mongo + redis with hot reload; `MONGODB_URI` and `REDIS_URL` are injected into the web container.

- [ ] **Step 1: Write the multi-stage Dockerfile**

This replaces the legacy `Dockerfile`, which had `WORKDIR C:\Users\yonat\...` (a Windows path inside a Linux image), never ran a build, and ran as root.

`apps/web/Dockerfile`:
```dockerfile
# syntax=docker/dockerfile:1
FROM node:22-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/web/package.json ./apps/web/
RUN npm ci

FROM deps AS dev
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev", "--workspace=@blog/web"]

FROM deps AS builder
COPY . .
RUN npm run build --workspace=@blog/web

FROM base AS runner
ENV NODE_ENV=production
RUN addgroup -g 1001 nodejs && adduser -S -u 1001 -G nodejs nextjs
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
USER nextjs
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
```

`apps/web/.dockerignore`:
```
node_modules
.next
.env*
```

- [ ] **Step 2: Write the Compose stack**

`compose.yaml`:
```yaml
name: blogchat

services:
  web:
    build:
      context: .
      dockerfile: apps/web/Dockerfile
      target: dev
    ports: ['3000:3000']
    environment:
      MONGODB_URI: mongodb://mongo:27017/blogchat
      REDIS_URL: redis://redis:6379
      AUTH_SECRET: dev-secret-not-for-production
      AUTH_URL: http://localhost:3000
      AUTH_TRUST_HOST: 'true'
    depends_on:
      mongo: { condition: service_healthy }
      redis: { condition: service_healthy }
    develop:
      watch:
        - action: sync
          path: ./apps/web
          target: /app/apps/web
          ignore: [node_modules/, .next/]
        - action: sync
          path: ./packages/shared
          target: /app/packages/shared
          ignore: [node_modules/]
        - action: rebuild
          path: ./package.json
        - action: rebuild
          path: ./package-lock.json

  mongo:
    image: mongo:8
    ports: ['27017:27017']
    volumes: ['mongo-data:/data/db']
    healthcheck:
      test: ['CMD', 'mongosh', '--quiet', '--eval', "db.adminCommand('ping')"]
      interval: 5s
      timeout: 5s
      retries: 10

  redis:
    image: redis:7-alpine
    ports: ['6379:6379']
    healthcheck:
      test: ['CMD', 'redis-cli', 'ping']
      interval: 5s
      timeout: 3s
      retries: 10

volumes:
  mongo-data:
```

> **Why `action: sync` and not a bind mount.** A bind-mounted `node_modules` breaks across the Windows→Linux boundary (native binaries compiled for the wrong platform), and inotify file-watching over a bind mount is unreliable on Windows. Compose Watch *copies* changed files into the container, so `node_modules` stays inside the image, installed for Linux. This is why `node_modules/` is in every `ignore` list.

- [ ] **Step 3: Verify the stack comes up with hot reload**

```bash
docker compose watch
```
Expected: mongo and redis report healthy, then web logs `Ready in ...`. Visit `http://localhost:3000` → redirects to `/blog` → 404 (expected; the route arrives in Task 8).

Now edit `apps/web/app/page.tsx` (change any string) and save. Expected: Compose logs `Syncing service "web"` and Next.js recompiles without a container restart.

- [ ] **Step 4: Commit**

```bash
git add apps/web/Dockerfile apps/web/.dockerignore compose.yaml
git commit -m "feat(docker): containerized dev stack with compose watch hot reload

Replaces the broken legacy Dockerfile (Windows WORKDIR in a Linux image, no
build step, ran as root). Multi-stage build; runner stage is non-root."
```

---

## Task 6: Auth.js v5 — the Edge/Node split

The single most error-prone task in this plan. Read the whole thing before writing code.

**Files:**
- Create: `apps/web/lib/auth.config.ts`, `apps/web/lib/auth.ts`, `apps/web/lib/db.ts`
- Create: `apps/web/app/api/auth/[...nextauth]/route.ts`, `apps/web/middleware.ts`
- Create: `apps/web/lib/services/user.ts`
- Test: `apps/web/lib/services/user.test.ts`

**Interfaces:**
- Consumes: `UserModel`, `SignupSchema`, `connectDb` from `@blog/shared`.
- Produces: `auth()`, `signIn()`, `signOut()`, `handlers`; `userService.signup(input: Signup): Promise<{ id: string }>`; `userService.verifyCredentials(username: string, password: string): Promise<{ id: string; username: string } | null>`.

> **Why the file split.** `middleware.ts` runs on the **Edge runtime**, which has no Node APIs — it cannot run Mongoose or bcrypt. But middleware needs the Auth.js config to know if a session exists. The solution is to split: `auth.config.ts` holds only edge-safe config (callbacks, pages) and is imported by middleware; `auth.ts` spreads that config and adds the Credentials provider whose `authorize` touches bcrypt and Mongoose. Only `auth.ts` runs on Node.

> **Why `strategy: 'jwt'`.** Auth.js does not support database sessions with the Credentials provider. This is a library constraint, not a choice. The session is a signed JWT in an httpOnly cookie — still unreadable by JavaScript, still CSRF-protected.

- [ ] **Step 1: Write the failing test**

`apps/web/lib/services/user.test.ts`:
```ts
import { MongoMemoryServer } from 'mongodb-memory-server'
import mongoose from 'mongoose'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { UserModel } from '@blog/shared'
import { userService } from './user'

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
  await UserModel.deleteMany({})
})

describe('userService.signup', () => {
  it('hashes the password — never stores plaintext', async () => {
    await userService.signup({ username: 'yonatan', email: 'y@example.com', password: 'correct-horse' })
    const user = await UserModel.findOne({ username: 'yonatan' })
    expect(user!.password).not.toBe('correct-horse')
    expect(user!.password).toMatch(/^\$2[aby]\$/) // bcrypt hash
  })

  it('rejects a duplicate username', async () => {
    await userService.signup({ username: 'yonatan', email: 'a@example.com', password: 'correct-horse' })
    await expect(
      userService.signup({ username: 'yonatan', email: 'b@example.com', password: 'correct-horse' }),
    ).rejects.toThrow(/username.*taken/i)
  })
})

describe('userService.verifyCredentials', () => {
  it('returns the user for a correct password', async () => {
    await userService.signup({ username: 'yonatan', email: 'y@example.com', password: 'correct-horse' })
    const result = await userService.verifyCredentials('yonatan', 'correct-horse')
    expect(result?.username).toBe('yonatan')
  })

  it('returns null for a wrong password', async () => {
    await userService.signup({ username: 'yonatan', email: 'y@example.com', password: 'correct-horse' })
    expect(await userService.verifyCredentials('yonatan', 'wrong')).toBeNull()
  })

  it('returns null — not a distinguishable error — for an unknown username', async () => {
    // The legacy app threw "Unable to find user: <name>", leaking which
    // usernames exist. Both failure modes must be indistinguishable.
    expect(await userService.verifyCredentials('nobody', 'correct-horse')).toBeNull()
  })

  it('returns null for an OAuth user who has no password', async () => {
    await UserModel.create({ username: 'oauth', email: 'o@example.com' })
    expect(await userService.verifyCredentials('oauth', 'anything')).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test and confirm it fails**

```bash
npm run test -- apps/web/lib/services/user.test.ts
```
Expected: FAIL — cannot resolve `./user`.

- [ ] **Step 3: Write the user service**

`apps/web/lib/db.ts`:
```ts
import { connectDb } from '@blog/shared'

const uri = process.env.MONGODB_URI
if (!uri) throw new Error('MONGODB_URI is not set')

export const dbReady = () => connectDb(uri)
```

`apps/web/lib/services/user.ts`:
```ts
import bcrypt from 'bcryptjs'
import { UserModel, type Signup } from '@blog/shared'

const BCRYPT_COST = 12 // legacy used 8

export const userService = {
  async signup(input: Signup): Promise<{ id: string }> {
    const existing = await UserModel.findOne({
      $or: [{ username: input.username }, { email: input.email }],
    })
    if (existing) {
      throw new Error(
        existing.username === input.username
          ? 'That username is taken.'
          : 'That email is already registered.',
      )
    }

    const password = await bcrypt.hash(input.password, BCRYPT_COST)
    const user = await UserModel.create({ ...input, password })
    return { id: user._id.toString() }
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
}
```

- [ ] **Step 4: Run the test and confirm it passes**

```bash
npm run test -- apps/web/lib/services/user.test.ts
```
Expected: PASS — 6 tests.

- [ ] **Step 5: Write the split Auth.js config**

`apps/web/lib/auth.config.ts` — **edge-safe. Importing Mongoose or bcrypt here will break middleware at runtime.**
```ts
import type { NextAuthConfig } from 'next-auth'

export const authConfig = {
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  providers: [], // added in auth.ts — providers touch the database
  callbacks: {
    // Persist the user id on the token, then expose it on the session.
    // Every authorization check downstream reads session.user.id.
    jwt({ token, user }) {
      if (user) token.id = user.id
      return token
    },
    session({ session, token }) {
      if (token.id) session.user.id = token.id as string
      return session
    },
  },
} satisfies NextAuthConfig
```

`apps/web/types/next-auth.d.ts` — teaches TypeScript that `session.user.id` exists:
```ts
import type { DefaultSession } from 'next-auth'

declare module 'next-auth' {
  interface Session {
    user: { id: string } & DefaultSession['user']
  }
}
```

`apps/web/lib/auth.ts` — Node runtime only:
```ts
import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { LoginSchema } from '@blog/shared'
import { authConfig } from './auth.config'
import { dbReady } from './db'
import { userService } from './services/user'

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { username: {}, password: {} },
      async authorize(raw) {
        const parsed = LoginSchema.safeParse(raw)
        if (!parsed.success) return null

        await dbReady()
        const user = await userService.verifyCredentials(
          parsed.data.username,
          parsed.data.password,
        )
        if (!user) return null // Auth.js turns this into a generic CredentialsSignin error
        return { id: user.id, name: user.username }
      },
    }),
  ],
})
```

`apps/web/app/api/auth/[...nextauth]/route.ts`:
```ts
import { handlers } from '@/lib/auth'

export const { GET, POST } = handlers
```

`apps/web/middleware.ts` — imports **only** `auth.config`, never `auth.ts`:
```ts
import NextAuth from 'next-auth'
import { NextResponse } from 'next/server'
import { authConfig } from '@/lib/auth.config'

const { auth } = NextAuth(authConfig)

const PROTECTED = ['/blog/new', '/chat', '/settings']

export default auth((req) => {
  const isProtected = PROTECTED.some((p) => req.nextUrl.pathname.startsWith(p)) ||
    /^\/blog\/[^/]+\/edit$/.test(req.nextUrl.pathname)

  if (isProtected && !req.auth) {
    const url = new URL('/login', req.nextUrl.origin)
    url.searchParams.set('next', req.nextUrl.pathname)
    return NextResponse.redirect(url)
  }
  return NextResponse.next()
})

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}
```

> Remember: this redirect is **convenience**. It does not protect Server Actions, which are public POST endpoints. Task 7 builds the guards that actually enforce authorization.

- [ ] **Step 6: Verify typecheck passes**

```bash
npm run typecheck
```
Expected: exit 0. If `session.user.id` errors, `types/next-auth.d.ts` is not being picked up — confirm it is inside `apps/web` and matched by the tsconfig `include`.

- [ ] **Step 7: Commit**

```bash
git add apps/web/lib apps/web/middleware.ts apps/web/app/api apps/web/types
git commit -m "feat(auth): Auth.js v5 with Edge/Node split and hardened credentials

- auth.config.ts is edge-safe (no mongoose/bcrypt) so middleware can import it
- JWT session strategy (required by Auth.js for the Credentials provider)
- bcrypt cost 12 (legacy: 8)
- verifyCredentials returns null for both unknown-user and wrong-password, so
  usernames cannot be enumerated (legacy leaked 'Unable to find user: <name>')"
```

---

## Task 7: Authorization guards

**Files:**
- Create: `apps/web/lib/auth-guards.ts`
- Test: `apps/web/lib/auth-guards.test.ts`

**Interfaces:**
- Consumes: `auth()` from `lib/auth`; error classes from `@blog/shared`.
- Produces:
  - `requireAuth(): Promise<{ id: string; username: string }>` — throws `UnauthorizedError`
  - `requireOwner(resource: { author: Types.ObjectId }): Promise<{ id: string; username: string }>` — throws `ForbiddenError`

- [ ] **Step 1: Write the failing test**

`apps/web/lib/auth-guards.test.ts`:
```ts
import { Types } from 'mongoose'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ForbiddenError, UnauthorizedError } from '@blog/shared'

const authMock = vi.hoisted(() => vi.fn())
vi.mock('./auth', () => ({ auth: authMock }))

const { requireAuth, requireOwner } = await import('./auth-guards')

beforeEach(() => authMock.mockReset())

describe('requireAuth', () => {
  it('returns the session user when signed in', async () => {
    authMock.mockResolvedValue({ user: { id: 'u1', name: 'yonatan' } })
    await expect(requireAuth()).resolves.toEqual({ id: 'u1', username: 'yonatan' })
  })

  it('throws UnauthorizedError when there is no session', async () => {
    authMock.mockResolvedValue(null)
    await expect(requireAuth()).rejects.toThrow(UnauthorizedError)
  })
})

describe('requireOwner', () => {
  it('allows the owner', async () => {
    const id = new Types.ObjectId()
    authMock.mockResolvedValue({ user: { id: id.toString(), name: 'owner' } })
    await expect(requireOwner({ author: id })).resolves.toMatchObject({ id: id.toString() })
  })

  it('throws ForbiddenError for a non-owner', async () => {
    // THE legacy vulnerability: post.js:42 deleted any post for any logged-in user.
    authMock.mockResolvedValue({ user: { id: new Types.ObjectId().toString(), name: 'attacker' } })
    await expect(requireOwner({ author: new Types.ObjectId() })).rejects.toThrow(ForbiddenError)
  })

  it('throws UnauthorizedError for an anonymous user', async () => {
    authMock.mockResolvedValue(null)
    await expect(requireOwner({ author: new Types.ObjectId() })).rejects.toThrow(UnauthorizedError)
  })
})
```

- [ ] **Step 2: Run the test and confirm it fails**

```bash
npm run test -- apps/web/lib/auth-guards.test.ts
```
Expected: FAIL — cannot resolve `./auth-guards`.

- [ ] **Step 3: Write the guards**

`apps/web/lib/auth-guards.ts`:
```ts
import type { Types } from 'mongoose'
import { ForbiddenError, UnauthorizedError } from '@blog/shared'
import { auth } from './auth'

export type SessionUser = { id: string; username: string }

export async function requireAuth(): Promise<SessionUser> {
  const session = await auth()
  if (!session?.user?.id) throw new UnauthorizedError()
  return { id: session.user.id, username: session.user.name ?? '' }
}

export async function requireOwner(resource: { author: Types.ObjectId }): Promise<SessionUser> {
  const user = await requireAuth()
  if (!resource.author.equals(user.id)) throw new ForbiddenError()
  return user
}
```

- [ ] **Step 4: Run the test and confirm it passes**

```bash
npm run test -- apps/web/lib/auth-guards.test.ts
```
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/auth-guards.ts apps/web/lib/auth-guards.test.ts
git commit -m "feat(auth): add requireAuth/requireOwner guards

Every mutating Server Action starts with one of these. Identity always comes
from the session, never from client input — the fix for all five legacy
authorization holes."
```

---

## Task 8: Post service — the regression tests live here

**Files:**
- Create: `apps/web/lib/services/post.ts`
- Test: `apps/web/lib/services/post.test.ts`

**Interfaces:**
- Consumes: `PostModel`, `LikeModel`, `UserModel`, `slugify`, `deriveTeaser`, errors from `@blog/shared`; `requireAuth`, `requireOwner` from `lib/auth-guards`.
- Produces:
  - `postService.create(input: CreatePost, authorId: string): Promise<{ slug: string }>`
  - `postService.list(): Promise<PostSummary[]>`
  - `postService.getBySlug(slug: string, viewer: SessionUser | null): Promise<PostView>`
  - `postService.update(input: UpdatePost): Promise<{ slug: string }>`
  - `postService.remove(postId: string): Promise<void>`
  - `type PostView = { id, title, slug, body, isTeaser, premium, authorName, authorId, likeCount, createdAt }`

- [ ] **Step 1: Write the failing test**

Every `it()` below maps to a line in the spec's regression checklist.

`apps/web/lib/services/post.test.ts`:
```ts
import { MongoMemoryServer } from 'mongodb-memory-server'
import mongoose from 'mongoose'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ForbiddenError, LikeModel, NotFoundError, PostModel, UserModel } from '@blog/shared'

const authMock = vi.hoisted(() => vi.fn())
vi.mock('../auth', () => ({ auth: authMock }))

const { postService } = await import('./post')

let mongod: MongoMemoryServer
let owner: { _id: mongoose.Types.ObjectId }
let attacker: { _id: mongoose.Types.ObjectId }

const signedInAs = (u: { _id: mongoose.Types.ObjectId }, name = 'x') =>
  authMock.mockResolvedValue({ user: { id: u._id.toString(), name } })

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
  authMock.mockReset()
  await Promise.all([UserModel.deleteMany({}), PostModel.deleteMany({}), LikeModel.deleteMany({})])
  owner = await UserModel.create({ username: 'owner', email: 'o@e.com', password: 'x' })
  attacker = await UserModel.create({ username: 'attacker', email: 'a@e.com', password: 'x' })
})

const seedPost = (premium = false) =>
  postService.create(
    { title: 'A Real Title', body: 'Para one.\n\nPara two.\n\nPara three.', premium, tags: [] },
    owner._id.toString(),
  )

describe('create', () => {
  it('derives a slug from the title', async () => {
    const { slug } = await seedPost()
    expect(slug).toBe('a-real-title')
  })

  it('disambiguates a duplicate slug instead of failing', async () => {
    await seedPost()
    const second = await postService.create(
      { title: 'A Real Title', body: 'b', premium: false, tags: [] },
      owner._id.toString(),
    )
    expect(second.slug).not.toBe('a-real-title')
    expect(second.slug).toMatch(/^a-real-title-/)
  })

  it('sets the author from the argument, ignoring any client-supplied value', async () => {
    const { slug } = await seedPost()
    const post = await PostModel.findOne({ slug })
    expect(post!.author.toString()).toBe(owner._id.toString())
  })
})

describe('update — REGRESSION: post.js:34 let anyone edit any post', () => {
  it('allows the owner', async () => {
    const { slug } = await seedPost()
    const post = await PostModel.findOne({ slug })
    signedInAs(owner)
    await postService.update({
      postId: post!._id.toString(), title: 'Edited Title', body: 'new', premium: false, tags: [],
    })
    expect((await PostModel.findById(post!._id))!.title).toBe('Edited Title')
  })

  it('FORBIDS a non-owner', async () => {
    const { slug } = await seedPost()
    const post = await PostModel.findOne({ slug })
    signedInAs(attacker)
    await expect(
      postService.update({
        postId: post!._id.toString(), title: 'Hacked', body: 'x', premium: false, tags: [],
      }),
    ).rejects.toThrow(ForbiddenError)
    expect((await PostModel.findById(post!._id))!.title).toBe('A Real Title')
  })
})

describe('remove — REGRESSION: post.js:42 let anyone delete any post', () => {
  it('allows the owner', async () => {
    const { slug } = await seedPost()
    const post = await PostModel.findOne({ slug })
    signedInAs(owner)
    await postService.remove(post!._id.toString())
    expect(await PostModel.findById(post!._id)).toBeNull()
  })

  it('FORBIDS a non-owner', async () => {
    const { slug } = await seedPost()
    const post = await PostModel.findOne({ slug })
    signedInAs(attacker)
    await expect(postService.remove(post!._id.toString())).rejects.toThrow(ForbiddenError)
    expect(await PostModel.findById(post!._id)).not.toBeNull()
  })

  it('throws NotFoundError for a missing post', async () => {
    signedInAs(owner)
    await expect(postService.remove(new mongoose.Types.ObjectId().toString())).rejects.toThrow(
      NotFoundError,
    )
  })
})

describe('getBySlug — content gating', () => {
  it('gives an anonymous viewer the FULL body of a free post', async () => {
    const { slug } = await seedPost(false)
    const view = await postService.getBySlug(slug, null)
    expect(view.isTeaser).toBe(false)
    expect(view.body).toContain('Para three.')
  })

  it('gives an anonymous viewer ONLY a teaser of a premium post', async () => {
    const { slug } = await seedPost(true)
    const view = await postService.getBySlug(slug, null)
    expect(view.isTeaser).toBe(true)
    expect(view.body).toBe('Para one.\n\nPara two.')
    // The gated bytes must never leave the server.
    expect(view.body).not.toContain('Para three.')
  })

  it('gives a signed-in viewer the full body of a premium post', async () => {
    const { slug } = await seedPost(true)
    const view = await postService.getBySlug(slug, { id: attacker._id.toString(), username: 'a' })
    expect(view.isTeaser).toBe(false)
    expect(view.body).toContain('Para three.')
  })

  it('resolves the author name by populate, not a stale denormalized copy', async () => {
    const { slug } = await seedPost()
    await UserModel.findByIdAndUpdate(owner._id, { username: 'renamed' })
    const view = await postService.getBySlug(slug, null)
    expect(view.authorName).toBe('renamed') // legacy stored authorName and went stale
  })
})

describe('list', () => {
  it('never includes a body — the feed shows titles and teasers only', async () => {
    await seedPost(true)
    const [summary] = await postService.list()
    expect(summary).toBeDefined()
    expect('body' in summary!).toBe(false)
  })

  it('reports a like count derived from the Like collection', async () => {
    const { slug } = await seedPost()
    const post = await PostModel.findOne({ slug })
    await LikeModel.create({ user: attacker._id, post: post!._id })
    const [summary] = await postService.list()
    expect(summary!.likeCount).toBe(1)
  })
})
```

- [ ] **Step 2: Run the test and confirm it fails**

```bash
npm run test -- apps/web/lib/services/post.test.ts
```
Expected: FAIL — cannot resolve `./post`.

- [ ] **Step 3: Write the post service**

`apps/web/lib/services/post.ts`:
```ts
import {
  deriveTeaser,
  ForbiddenError,
  LikeModel,
  NotFoundError,
  PostModel,
  slugify,
  type CreatePost,
  type UpdatePost,
} from '@blog/shared'
import { requireOwner, type SessionUser } from '../auth-guards'

export type PostSummary = {
  id: string
  title: string
  slug: string
  teaser: string
  premium: boolean
  authorName: string
  likeCount: number
  createdAt: Date
}

export type PostView = {
  id: string
  title: string
  slug: string
  body: string
  isTeaser: boolean
  premium: boolean
  authorName: string
  authorId: string
  likeCount: number
  createdAt: Date
}

async function uniqueSlug(title: string): Promise<string> {
  const base = slugify(title)
  if (!(await PostModel.exists({ slug: base }))) return base
  return `${base}-${Date.now().toString(36)}`
}

export const postService = {
  async create(input: CreatePost, authorId: string): Promise<{ slug: string }> {
    // authorId is passed in from the session by the caller. It is never read
    // from client input — CreatePostSchema does not even have an author field.
    const post = await PostModel.create({
      ...input,
      slug: await uniqueSlug(input.title),
      author: authorId,
    })
    return { slug: post.slug }
  },

  async list(): Promise<PostSummary[]> {
    const posts = await PostModel.find().sort({ createdAt: -1 }).populate('author', 'username').lean()
    const counts = await LikeModel.aggregate<{ _id: unknown; n: number }>([
      { $group: { _id: '$post', n: { $sum: 1 } } },
    ])
    const countBy = new Map(counts.map((c) => [String(c._id), c.n]))

    return posts.map((p) => ({
      id: String(p._id),
      title: p.title,
      slug: p.slug,
      teaser: deriveTeaser(p.body, 1),
      premium: p.premium,
      authorName: (p.author as unknown as { username: string }).username,
      likeCount: countBy.get(String(p._id)) ?? 0,
      createdAt: p.createdAt,
    }))
  },

  async getBySlug(slug: string, viewer: SessionUser | null): Promise<PostView> {
    const post = await PostModel.findOne({ slug }).populate('author', 'username').lean()
    if (!post) throw new NotFoundError('That post does not exist.')

    // THE GATE. When it withholds the body, the bytes never enter the response
    // at all — there is no JSON payload for a client to inspect.
    const gated = post.premium && !viewer

    return {
      id: String(post._id),
      title: post.title,
      slug: post.slug,
      body: gated ? deriveTeaser(post.body) : post.body,
      isTeaser: gated,
      premium: post.premium,
      authorName: (post.author as unknown as { username: string }).username,
      authorId: String((post.author as unknown as { _id: unknown })._id),
      likeCount: await LikeModel.countDocuments({ post: post._id }),
      createdAt: post.createdAt,
    }
  },

  async update(input: UpdatePost): Promise<{ slug: string }> {
    const post = await PostModel.findById(input.postId)
    if (!post) throw new NotFoundError('That post does not exist.')
    await requireOwner(post) // throws ForbiddenError for a non-owner

    post.title = input.title
    post.body = input.body
    post.premium = input.premium
    post.tags = input.tags
    await post.save()
    return { slug: post.slug }
  },

  async remove(postId: string): Promise<void> {
    const post = await PostModel.findById(postId)
    if (!post) throw new NotFoundError('That post does not exist.')
    await requireOwner(post)

    await Promise.all([post.deleteOne(), LikeModel.deleteMany({ post: post._id })])
  },
}
```

- [ ] **Step 4: Run the test and confirm it passes**

```bash
npm run test -- apps/web/lib/services/post.test.ts
```
Expected: PASS — 13 tests, including the four `FORBIDS` / gating cases that are the whole point of the rebuild.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/services/post.ts apps/web/lib/services/post.test.ts
git commit -m "feat(posts): post service with authorization and content gating

Regression tests for the legacy holes:
- non-owner cannot edit a post (was post.js:34)
- non-owner cannot delete a post (was post.js:42)
- premium post body is withheld from anonymous viewers server-side
- authorName resolved by populate, so renames cannot go stale"
```

---

## Task 9: Server Actions and the blog pages

**Files:**
- Create: `apps/web/lib/actions/posts.ts`, `apps/web/lib/actions/auth.ts`
- Create: `apps/web/app/blog/page.tsx`, `apps/web/app/blog/[slug]/page.tsx`, `apps/web/app/blog/new/page.tsx`
- Create: `apps/web/app/(auth)/login/page.tsx`, `apps/web/app/(auth)/signup/page.tsx`
- Create: `apps/web/components/patterns/{PostCard,PostForm,AuthForm}.tsx`
- Create: `apps/web/app/error.tsx`, `apps/web/app/not-found.tsx`

**Interfaces:**
- Consumes: `postService`, `userService`, `requireAuth`, `signIn`.
- Produces: `type ActionState = { ok: boolean; fieldErrors?: Record<string, string[]>; message?: string }`; actions `createPostAction`, `updatePostAction`, `deletePostAction`, `signupAction`, `loginAction`.

- [ ] **Step 1: Write the action-result contract and the actions**

`apps/web/lib/actions/types.ts`:
```ts
export type ActionState = {
  ok: boolean
  fieldErrors?: Record<string, string[] | undefined>
  message?: string
}

export const idle: ActionState = { ok: false }
```

`apps/web/lib/actions/posts.ts` — note every action re-derives identity via `requireAuth()`. Middleware does not protect these; they are public POST endpoints.

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { CreatePostSchema, ForbiddenError, UnauthorizedError, UpdatePostSchema } from '@blog/shared'
import { requireAuth } from '../auth-guards'
import { dbReady } from '../db'
import { postService } from '../services/post'
import type { ActionState } from './types'

function toState(error: unknown): ActionState {
  if (error instanceof UnauthorizedError) return { ok: false, message: 'Please sign in.' }
  if (error instanceof ForbiddenError) return { ok: false, message: 'That is not your post.' }
  return { ok: false, message: 'Something went wrong. Please try again.' }
}

export async function createPostAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await dbReady()
  let slug: string
  try {
    const user = await requireAuth() // ← identity from the session, not the form
    const parsed = CreatePostSchema.safeParse({
      title: formData.get('title'),
      body: formData.get('body'),
      premium: formData.get('premium') === 'on',
      tags: [],
    })
    if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors }

    ;({ slug } = await postService.create(parsed.data, user.id))
  } catch (error) {
    return toState(error)
  }

  revalidatePath('/blog')
  redirect(`/blog/${slug}`) // redirect() throws, so it must be outside the try
}

export async function updatePostAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await dbReady()
  let slug: string
  try {
    const parsed = UpdatePostSchema.safeParse({
      postId: formData.get('postId'),
      title: formData.get('title'),
      body: formData.get('body'),
      premium: formData.get('premium') === 'on',
      tags: [],
    })
    if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors }

    ;({ slug } = await postService.update(parsed.data)) // service calls requireOwner
  } catch (error) {
    return toState(error)
  }

  revalidatePath('/blog')
  redirect(`/blog/${slug}`)
}

export async function deletePostAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await dbReady()
  try {
    const postId = String(formData.get('postId') ?? '')
    await postService.remove(postId) // service calls requireOwner
  } catch (error) {
    return toState(error)
  }

  revalidatePath('/blog')
  redirect('/blog')
}
```

`apps/web/lib/actions/auth.ts`:
```ts
'use server'

import { AuthError } from 'next-auth'
import { redirect } from 'next/navigation'
import { SignupSchema } from '@blog/shared'
import { signIn } from '../auth'
import { dbReady } from '../db'
import { userService } from '../services/user'
import type { ActionState } from './types'

export async function signupAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await dbReady()
  const parsed = SignupSchema.safeParse({
    username: formData.get('username'),
    email: formData.get('email'),
    password: formData.get('password'),
  })
  if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors }

  try {
    await userService.signup(parsed.data)
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Signup failed.' }
  }

  await signIn('credentials', {
    username: parsed.data.username,
    password: parsed.data.password,
    redirect: false,
  })
  redirect('/blog')
}

export async function loginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await dbReady()
  try {
    await signIn('credentials', {
      username: formData.get('username'),
      password: formData.get('password'),
      redirect: false,
    })
  } catch (error) {
    // One generic message. Never reveal whether the username exists.
    if (error instanceof AuthError) {
      return { ok: false, message: 'Invalid username or password.' }
    }
    throw error
  }
  redirect('/blog')
}
```

- [ ] **Step 2: Build the forms (Client Components)**

`apps/web/components/patterns/AuthForm.tsx` — `useActionState` is React 19's replacement for `useFormState`:
```tsx
'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { Button } from '@/components/ui/button'
import { idle, type ActionState } from '@/lib/actions/types'

function Submit({ children }: { children: string }) {
  const { pending } = useFormStatus()
  return <Button type="submit" disabled={pending} className="w-full">{pending ? 'Working…' : children}</Button>
}

function Field({ label, name, type = 'text', errors }: {
  label: string; name: string; type?: string; errors?: string[]
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-ink">{label}</span>
      <input
        name={name}
        type={type}
        required
        aria-invalid={errors ? true : undefined}
        className="w-full rounded-md border border-line bg-paper px-3 py-2 text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/30"
      />
      {errors?.map((e) => (
        <span key={e} className="mt-1 block text-sm text-danger">{e}</span>
      ))}
    </label>
  )
}

export function AuthForm({ mode, action }: {
  mode: 'login' | 'signup'
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>
}) {
  const [state, formAction] = useActionState(action, idle)

  return (
    <form action={formAction} className="space-y-5">
      <Field label="Username" name="username" errors={state.fieldErrors?.username} />
      {mode === 'signup' && (
        <Field label="Email" name="email" type="email" errors={state.fieldErrors?.email} />
      )}
      <Field label="Password" name="password" type="password" errors={state.fieldErrors?.password} />
      {state.message ? <p className="text-sm text-danger">{state.message}</p> : null}
      <Submit>{mode === 'login' ? 'Sign in' : 'Create account'}</Submit>
    </form>
  )
}
```

`apps/web/components/patterns/PostForm.tsx`:
```tsx
'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { Button } from '@/components/ui/button'
import { idle, type ActionState } from '@/lib/actions/types'

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus()
  return <Button type="submit" disabled={pending}>{pending ? 'Saving…' : label}</Button>
}

export function PostForm({ action, initial, submitLabel }: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>
  initial?: { postId: string; title: string; body: string; premium: boolean }
  submitLabel: string
}) {
  const [state, formAction] = useActionState(action, idle)

  return (
    <form action={formAction} className="space-y-6">
      {initial ? <input type="hidden" name="postId" value={initial.postId} /> : null}

      <label className="block">
        <span className="mb-1 block text-sm font-medium">Title</span>
        <input
          name="title"
          defaultValue={initial?.title}
          required
          className="w-full rounded-md border border-line px-3 py-2 outline-none focus:border-brand focus:ring-2 focus:ring-brand/30"
        />
        {state.fieldErrors?.title?.map((e) => (
          <span key={e} className="mt-1 block text-sm text-danger">{e}</span>
        ))}
      </label>

      <label className="block">
        <span className="mb-1 block text-sm font-medium">Body</span>
        <textarea
          name="body"
          rows={14}
          defaultValue={initial?.body}
          required
          className="w-full rounded-md border border-line px-3 py-2 font-serif outline-none focus:border-brand focus:ring-2 focus:ring-brand/30"
        />
        {state.fieldErrors?.body?.map((e) => (
          <span key={e} className="mt-1 block text-sm text-danger">{e}</span>
        ))}
      </label>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="premium" defaultChecked={initial?.premium} />
        Members only — anonymous readers see a teaser
      </label>

      {state.message ? <p className="text-sm text-danger">{state.message}</p> : null}
      <Submit label={submitLabel} />
    </form>
  )
}
```

- [ ] **Step 3: Build the pages (Server Components)**

`apps/web/components/patterns/PostCard.tsx`:
```tsx
import Link from 'next/link'
import type { PostSummary } from '@/lib/services/post'

export function PostCard({ post }: { post: PostSummary }) {
  return (
    <article className="border-b border-line py-8 first:pt-0">
      <Link href={`/blog/${post.slug}`} className="group block">
        <h2 className="text-xl font-semibold tracking-tight group-hover:text-brand">{post.title}</h2>
        <p className="mt-2 line-clamp-2 text-ink-muted">{post.teaser}</p>
      </Link>
      <div className="mt-3 flex items-center gap-3 text-sm text-ink-muted">
        <span>{post.authorName}</span>
        <span aria-hidden>·</span>
        <time dateTime={post.createdAt.toISOString()}>
          {post.createdAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
        </time>
        <span aria-hidden>·</span>
        <span>{post.likeCount} {post.likeCount === 1 ? 'like' : 'likes'}</span>
        {post.premium ? (
          <span className="rounded border border-brand bg-brand-tint px-1.5 py-0.5 text-xs font-medium text-brand">
            Members
          </span>
        ) : null}
      </div>
    </article>
  )
}
```

`apps/web/app/blog/page.tsx` — this is the Server Component that replaces the entire Redux pipeline:
```tsx
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/patterns/EmptyState'
import { PostCard } from '@/components/patterns/PostCard'
import { PageShell } from '@/components/layouts/PageShell'
import { auth } from '@/lib/auth'
import { dbReady } from '@/lib/db'
import { postService } from '@/lib/services/post'

export default async function BlogPage() {
  await dbReady()
  const [session, posts] = await Promise.all([auth(), postService.list()])

  return (
    <PageShell
      title="Blog"
      description="Notes on building things."
      actions={
        session ? (
          <Link href="/blog/new"><Button>Write a post</Button></Link>
        ) : (
          <Link href="/login"><Button variant="outline">Sign in</Button></Link>
        )
      }
    >
      {posts.length === 0 ? (
        <EmptyState
          title="No posts yet"
          description="Be the first to write something."
          action={<Link href="/blog/new"><Button>Write a post</Button></Link>}
        />
      ) : (
        <div>{posts.map((post) => <PostCard key={post.id} post={post} />)}</div>
      )}
    </PageShell>
  )
}
```

`apps/web/app/blog/[slug]/page.tsx` — **`params` is a Promise in Next.js 15.** This is a breaking change from 14 and the most common upgrade error.
```tsx
import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { Button } from '@/components/ui/button'
import { PageShell } from '@/components/layouts/PageShell'
import { auth } from '@/lib/auth'
import { dbReady } from '@/lib/db'
import { postService } from '@/lib/services/post'

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  await dbReady()
  try {
    const post = await postService.getBySlug(slug, null)
    return { title: post.title, description: post.body.slice(0, 155) }
  } catch {
    return { title: 'Not found' }
  }
}

export default async function PostPage({ params }: Props) {
  const { slug } = await params
  await dbReady()

  const session = await auth()
  const viewer = session?.user?.id
    ? { id: session.user.id, username: session.user.name ?? '' }
    : null

  let post
  try {
    post = await postService.getBySlug(slug, viewer)
  } catch {
    notFound()
  }

  const isOwner = viewer?.id === post.authorId

  return (
    <PageShell
      title={post.title}
      description={`${post.authorName} · ${post.createdAt.toLocaleDateString('en-GB')}`}
      actions={
        isOwner ? (
          <>
            <Link href={`/blog/${post.slug}/edit`}><Button variant="outline" size="sm">Edit</Button></Link>
          </>
        ) : null
      }
    >
      <article className="whitespace-pre-wrap font-serif text-lg leading-relaxed">{post.body}</article>

      {post.isTeaser ? (
        <div className="mt-10 rounded-lg border border-brand/30 bg-brand-tint px-6 py-10 text-center">
          <p className="font-medium">This is a members-only post.</p>
          <p className="mt-1 text-sm text-ink-muted">Sign in to read the rest.</p>
          <Link href={`/login?next=/blog/${post.slug}`} className="mt-6 inline-block">
            <Button>Sign in to read</Button>
          </Link>
        </div>
      ) : null}
    </PageShell>
  )
}
```

`apps/web/app/blog/new/page.tsx`:
```tsx
import { PageShell } from '@/components/layouts/PageShell'
import { PostForm } from '@/components/patterns/PostForm'
import { createPostAction } from '@/lib/actions/posts'

export default function NewPostPage() {
  return (
    <PageShell title="Write a post">
      <PostForm action={createPostAction} submitLabel="Publish" />
    </PageShell>
  )
}
```

`apps/web/app/(auth)/login/page.tsx`:
```tsx
import Link from 'next/link'
import { AuthForm } from '@/components/patterns/AuthForm'
import { PageShell } from '@/components/layouts/PageShell'
import { loginAction } from '@/lib/actions/auth'

export default function LoginPage() {
  return (
    <PageShell title="Sign in">
      <AuthForm mode="login" action={loginAction} />
      <p className="mt-6 text-sm text-ink-muted">
        No account? <Link href="/signup" className="font-medium text-brand hover:underline">Create one</Link>
      </p>
    </PageShell>
  )
}
```

`apps/web/app/(auth)/signup/page.tsx`:
```tsx
import Link from 'next/link'
import { AuthForm } from '@/components/patterns/AuthForm'
import { PageShell } from '@/components/layouts/PageShell'
import { signupAction } from '@/lib/actions/auth'

export default function SignupPage() {
  return (
    <PageShell title="Create account">
      <AuthForm mode="signup" action={signupAction} />
      <p className="mt-6 text-sm text-ink-muted">
        Already have an account? <Link href="/login" className="font-medium text-brand hover:underline">Sign in</Link>
      </p>
    </PageShell>
  )
}
```

`apps/web/app/not-found.tsx`:
```tsx
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { PageShell } from '@/components/layouts/PageShell'

export default function NotFound() {
  return (
    <PageShell title="Not found" description="That page does not exist.">
      <Link href="/blog"><Button variant="outline">Back to the blog</Button></Link>
    </PageShell>
  )
}
```

`apps/web/app/error.tsx`:
```tsx
'use client'

import { Button } from '@/components/ui/button'
import { PageShell } from '@/components/layouts/PageShell'

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <PageShell title="Something went wrong" description="An unexpected error occurred.">
      <Button onClick={reset}>Try again</Button>
    </PageShell>
  )
}
```

- [ ] **Step 4: Verify by hand in the running app**

```bash
docker compose watch
```
Then, in a browser:
1. Visit `/blog` → the empty state renders.
2. Visit `/blog/new` while signed out → **middleware redirects to `/login`**.
3. Sign up at `/signup` → redirected to `/blog`, now signed in.
4. Write a post with "Members only" ticked → redirected to the post, full body visible.
5. Open the same post URL in a **private window** → only two paragraphs plus the "Sign in to read" card.
6. **View source in the private window** (Ctrl+U) and search for a word from the third paragraph. Expected: **not present.** The gated bytes never left the server. This is the moment the whole rebuild justifies itself.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app apps/web/components apps/web/lib/actions
git commit -m "feat(blog): Server Actions, blog pages, and auth forms

Replaces the Redux + fetch + Express pipeline with Server Components that query
Mongo directly. Every action re-derives identity via requireAuth — middleware
does not protect Server Actions, which are public POST endpoints.
All alert() calls are gone; errors render inline from Zod fieldErrors."
```

---

## Task 10: Like button with optimistic UI

**Files:**
- Create: `apps/web/lib/services/like.ts`, `apps/web/lib/actions/likes.ts`
- Create: `apps/web/components/patterns/LikeButton.tsx`
- Modify: `apps/web/app/blog/[slug]/page.tsx` (mount the button)
- Test: `apps/web/lib/services/like.test.ts`

**Interfaces:**
- Consumes: `LikeModel`, `requireAuth`.
- Produces: `likeService.toggle(postId: string, userId: string): Promise<{ liked: boolean; count: number }>`; `toggleLikeAction(postId: string): Promise<{ liked: boolean; count: number }>`.

- [ ] **Step 1: Write the failing test**

`apps/web/lib/services/like.test.ts`:
```ts
import { MongoMemoryServer } from 'mongodb-memory-server'
import mongoose from 'mongoose'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { LikeModel, PostModel, UserModel } from '@blog/shared'
import { likeService } from './like'

let mongod: MongoMemoryServer
let user: { _id: mongoose.Types.ObjectId }
let post: { _id: mongoose.Types.ObjectId }

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
  await Promise.all([UserModel.deleteMany({}), PostModel.deleteMany({}), LikeModel.deleteMany({})])
  user = await UserModel.create({ username: 'u', email: 'u@e.com', password: 'x' })
  post = await PostModel.create({ title: 'T', slug: 't', body: 'b', author: user._id })
})

describe('likeService.toggle', () => {
  it('likes on the first call', async () => {
    const result = await likeService.toggle(post._id.toString(), user._id.toString())
    expect(result).toEqual({ liked: true, count: 1 })
  })

  it('unlikes on the second call — a toggle, not a dislike', async () => {
    await likeService.toggle(post._id.toString(), user._id.toString())
    const result = await likeService.toggle(post._id.toString(), user._id.toString())
    expect(result).toEqual({ liked: false, count: 0 })
  })

  it('never double-counts under a concurrent double-click', async () => {
    // REGRESSION: the legacy toggle did read-then-write, so two fast clicks
    // could both read "not liked" and both push. The unique index prevents it.
    await Promise.allSettled([
      likeService.toggle(post._id.toString(), user._id.toString()),
      likeService.toggle(post._id.toString(), user._id.toString()),
    ])
    expect(await LikeModel.countDocuments({ post: post._id })).toBeLessThanOrEqual(1)
  })

  it('counts likes from different users independently', async () => {
    const other = await UserModel.create({ username: 'o', email: 'o@e.com', password: 'x' })
    await likeService.toggle(post._id.toString(), user._id.toString())
    const result = await likeService.toggle(post._id.toString(), other._id.toString())
    expect(result).toEqual({ liked: true, count: 2 })
  })
})
```

- [ ] **Step 2: Run the test and confirm it fails**

```bash
npm run test -- apps/web/lib/services/like.test.ts
```
Expected: FAIL — cannot resolve `./like`.

- [ ] **Step 3: Write the service and the action**

`apps/web/lib/services/like.ts`:
```ts
import { LikeModel } from '@blog/shared'

export const likeService = {
  async toggle(postId: string, userId: string): Promise<{ liked: boolean; count: number }> {
    const existing = await LikeModel.findOneAndDelete({ post: postId, user: userId })

    let liked: boolean
    if (existing) {
      liked = false
    } else {
      try {
        await LikeModel.create({ post: postId, user: userId })
        liked = true
      } catch (error) {
        // Duplicate key: a concurrent request already created it. Treat as liked
        // rather than failing — the unique index is doing its job.
        if ((error as { code?: number }).code !== 11000) throw error
        liked = true
      }
    }

    return { liked, count: await LikeModel.countDocuments({ post: postId }) }
  },
}
```

`apps/web/lib/actions/likes.ts`:
```ts
'use server'

import { revalidatePath } from 'next/cache'
import { requireAuth } from '../auth-guards'
import { dbReady } from '../db'
import { likeService } from '../services/like'

export async function toggleLikeAction(postId: string): Promise<{ liked: boolean; count: number }> {
  await dbReady()
  const user = await requireAuth() // ← the legacy route took userID from the body
  const result = await likeService.toggle(postId, user.id)
  revalidatePath('/blog')
  return result
}
```

- [ ] **Step 4: Build the optimistic client component**

`apps/web/components/patterns/LikeButton.tsx`:
```tsx
'use client'

import { useOptimistic, useTransition } from 'react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { toggleLikeAction } from '@/lib/actions/likes'

type LikeState = { liked: boolean; count: number }

export function LikeButton({ postId, initial, disabled }: {
  postId: string
  initial: LikeState
  disabled?: boolean
}) {
  const [, startTransition] = useTransition()
  const [optimistic, setOptimistic] = useOptimistic<LikeState, void>(initial, (state) => ({
    liked: !state.liked,
    count: state.count + (state.liked ? -1 : 1),
  }))

  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={optimistic.liked}
      onClick={() =>
        startTransition(async () => {
          setOptimistic() // instant feedback; React rolls it back if the action throws
          try {
            await toggleLikeAction(postId)
          } catch {
            toast.error('Could not save your like.')
          }
        })
      }
      className={cn(
        'inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition-colors',
        optimistic.liked
          ? 'border-brand bg-brand text-paper'
          : 'border-line text-ink hover:border-brand hover:text-brand',
        disabled && 'cursor-not-allowed opacity-50',
      )}
    >
      <span aria-hidden>♥</span>
      <span>{optimistic.count}</span>
    </button>
  )
}
```

> `useOptimistic` is the fix for the legacy `setLike({clicked, totalLikes})` logic, which guessed at the new count locally and could desync from the server permanently. Here, React reverts the optimistic value automatically if the action fails.

- [ ] **Step 5: Mount it on the post page**

In `apps/web/app/blog/[slug]/page.tsx`, add the import and render it under the article. The service needs to tell the page whether *this viewer* already liked the post, so extend `postService.getBySlug` to include it:

In `apps/web/lib/services/post.ts`, add `likedByViewer` to `PostView` and compute it inside `getBySlug`:
```ts
// add to the PostView type:
//   likedByViewer: boolean

// inside getBySlug, alongside the likeCount query:
likedByViewer: viewer
  ? (await LikeModel.exists({ post: post._id, user: viewer.id })) !== null
  : false,
```

Then in the page, below `<article>`:
```tsx
<div className="mt-8 border-t border-line pt-6">
  <LikeButton
    postId={post.id}
    initial={{ liked: post.likedByViewer, count: post.likeCount }}
    disabled={!viewer}
  />
</div>
```

- [ ] **Step 6: Run all tests**

```bash
npm run test
```
Expected: PASS — every suite. (Add a `likedByViewer` assertion to the existing `getBySlug` tests if typecheck complains about the changed type.)

- [ ] **Step 7: Commit**

```bash
git add apps/web/lib apps/web/components/patterns/LikeButton.tsx apps/web/app/blog
git commit -m "feat(likes): toggle with optimistic UI and a race-proof unique index

Like is a toggle (create/delete a Like doc), never a dislike. userId comes from
the session, not the request body (legacy took it from req.body.userID).
useOptimistic replaces the hand-managed count that could desync permanently."
```

---

## Task 11: Seed script

**Files:**
- Create: `apps/web/scripts/seed.ts`

**Interfaces:**
- Consumes: `UserModel`, `PostModel`, `LikeModel`, `userService`.
- Produces: `npm run seed` — wipes and populates the database, including the demo account.

- [ ] **Step 1: Write the seed script**

The demo account matters: a portfolio visitor who has to invent a password will just leave.

`apps/web/scripts/seed.ts`:
```ts
import mongoose from 'mongoose'
import { LikeModel, PostModel, UserModel, slugify } from '@blog/shared'
import { userService } from '../lib/services/user'

const DEMO = { username: 'demo', email: 'demo@example.com', password: 'demo-password' }

const POSTS = [
  {
    title: 'Rebuilding a five-year-old MERN app',
    premium: false,
    body: `I wrote this blog in 2021 and left it alone.\n\nComing back to it, the first thing I found was not a missing feature but a missing check: any logged-in user could delete any other user's posts. The UI hid the button. The server never asked.\n\nThat is the difference between a UI that looks correct and a server that is correct.`,
  },
  {
    title: 'Why the paywall could not work in the old app',
    premium: true,
    body: `Showing a teaser to signed-out readers sounds like a UI problem. It is not.\n\nIn a client-rendered app, the server sends every post body to the browser and React decides what to show. Anyone can open the network tab and read what was "hidden".\n\nWith Server Components, the body is never included in the response at all. The gate is real because the bytes never leave the machine. That is the entire reason this rebuild exists.`,
  },
  {
    title: 'Notes on Redis as an ephemeral tier',
    premium: false,
    body: `Not everything deserves a database row.\n\nChat messages in a live room, presence, rate-limit counters — these are all things you would happily lose on restart. Putting them in MongoDB is a category error: you pay for durability you do not want.\n\nA capped Redis list with a TTL says what it means.`,
  },
]

async function main() {
  const uri = process.env.MONGODB_URI
  if (!uri) throw new Error('MONGODB_URI is not set')

  await mongoose.connect(uri)
  console.log('connected')

  await Promise.all([UserModel.deleteMany({}), PostModel.deleteMany({}), LikeModel.deleteMany({})])
  console.log('cleared')

  const { id } = await userService.signup(DEMO)
  await PostModel.insertMany(
    POSTS.map((p) => ({ ...p, slug: slugify(p.title), author: id, tags: [] })),
  )
  await mongoose.syncIndexes()

  console.log(`seeded ${POSTS.length} posts`)
  console.log(`demo account: ${DEMO.username} / ${DEMO.password}`)
  await mongoose.disconnect()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
```

- [ ] **Step 2: Run it against the Compose database**

```bash
docker compose up -d mongo
MONGODB_URI=mongodb://localhost:27017/blogchat npm run seed
```
Expected output ends with:
```
seeded 3 posts
demo account: demo / demo-password
```

- [ ] **Step 3: Verify in the browser**

With `docker compose watch` running, visit `http://localhost:3000/blog`. Expected: three posts, one badged **Members**. Open the Members post in a private window — teaser only.

- [ ] **Step 4: Commit**

```bash
git add apps/web/scripts/seed.ts
git commit -m "feat(seed): seed script with demo account and premium example post"
```

---

## Task 12: Playwright E2E against the production build

**Files:**
- Create: `playwright.config.ts`, `compose.e2e.yaml`, `e2e/blog.spec.ts`
- Modify: root `package.json` (add `@playwright/test`)

**Interfaces:**
- Consumes: the whole app.
- Produces: `npm run test:e2e`.

- [ ] **Step 1: Write the E2E Compose stack**

This builds the **`runner`** target — the real production image. If the build is broken, this catches it before Render does.

`compose.e2e.yaml`:
```yaml
name: blogchat-e2e

services:
  web:
    build:
      context: .
      dockerfile: apps/web/Dockerfile
      target: runner
    ports: ['3000:3000']
    environment:
      MONGODB_URI: mongodb://mongo:27017/blogchat_e2e
      REDIS_URL: redis://redis:6379
      AUTH_SECRET: e2e-secret
      AUTH_URL: http://localhost:3000
      AUTH_TRUST_HOST: 'true'
    depends_on:
      mongo: { condition: service_healthy }
      redis: { condition: service_healthy }
    healthcheck:
      test: ['CMD', 'wget', '-qO-', 'http://localhost:3000/blog']
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

`playwright.config.ts`:
```ts
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  use: { baseURL: 'http://localhost:3000', trace: 'on-first-retry' },
  reporter: process.env.CI ? 'github' : 'list',
})
```

- [ ] **Step 2: Write the E2E spec**

`e2e/blog.spec.ts`:
```ts
import { expect, test } from '@playwright/test'

const unique = () => `u${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`

test('signup, publish a post, like it, then sign out', async ({ page }) => {
  const username = unique()

  await page.goto('/signup')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Email').fill(`${username}@example.com`)
  await page.getByLabel('Password').fill('correct-horse')
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page).toHaveURL('/blog')

  await page.getByRole('link', { name: 'Write a post' }).click()
  await page.getByLabel('Title').fill('My E2E Post')
  await page.getByLabel('Body').fill('First para.\n\nSecond para.\n\nThird para.')
  await page.getByRole('button', { name: 'Publish' }).click()

  await expect(page.getByRole('heading', { name: 'My E2E Post' })).toBeVisible()
  await expect(page.getByText('Third para.')).toBeVisible()

  const like = page.getByRole('button', { name: /♥/ })
  await expect(like).toHaveAttribute('aria-pressed', 'false')
  await like.click()
  await expect(like).toHaveAttribute('aria-pressed', 'true')
  await expect(like).toContainText('1')
})

test('a premium post shows only a teaser to an anonymous reader', async ({ page, browser }) => {
  const username = unique()

  await page.goto('/signup')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Email').fill(`${username}@example.com`)
  await page.getByLabel('Password').fill('correct-horse')
  await page.getByRole('button', { name: 'Create account' }).click()

  await page.goto('/blog/new')
  await page.getByLabel('Title').fill(`Gated ${username}`)
  await page.getByLabel('Body').fill('Visible one.\n\nVisible two.\n\nSECRET-THIRD-PARAGRAPH.')
  await page.getByLabel(/Members only/).check()
  await page.getByRole('button', { name: 'Publish' }).click()
  const url = page.url()

  // A brand-new browser context: no cookies, fully anonymous.
  const anon = await browser.newContext()
  const anonPage = await anon.newPage()
  const response = await anonPage.goto(url)

  await expect(anonPage.getByText('Visible two.')).toBeVisible()
  await expect(anonPage.getByRole('button', { name: 'Sign in to read' })).toBeVisible()
  await expect(anonPage.getByText('SECRET-THIRD-PARAGRAPH.')).toBeHidden()

  // The real assertion: the gated bytes are not in the HTML at all.
  // In the legacy SPA they would have been sitting in the JSON response.
  expect(await response!.text()).not.toContain('SECRET-THIRD-PARAGRAPH')

  await anon.close()
})

test('a signed-out visitor is redirected away from the editor', async ({ page }) => {
  await page.goto('/blog/new')
  await expect(page).toHaveURL(/\/login/)
})
```

- [ ] **Step 3: Run it**

```bash
npm install -D @playwright/test
npx playwright install --with-deps chromium
docker compose -f compose.e2e.yaml up --build --wait
docker compose -f compose.e2e.yaml exec -T web node -e "1" # sanity: container is up
npm run test:e2e
docker compose -f compose.e2e.yaml down -v
```
Expected: 3 passed.

- [ ] **Step 4: Commit**

```bash
git add playwright.config.ts compose.e2e.yaml e2e package.json package-lock.json
git commit -m "test(e2e): Playwright against the production image

compose.e2e.yaml builds the runner target, so a broken production build fails
in CI rather than on Render. The gating test asserts the premium body is absent
from the raw HTML — not merely hidden in the DOM."
```

---

## Task 13: GitHub Actions CI

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Write the workflow**

`.github/workflows/ci.yml`:
```yaml
name: CI

on:
  push:
    branches: [master]
  pull_request:

jobs:
  verify:
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
      - run: npm run test

      - name: Build and start the production stack
        run: docker compose -f compose.e2e.yaml up --build --wait --quiet-pull

      - name: Install Playwright
        run: npx playwright install --with-deps chromium

      - run: npm run test:e2e

      - name: Dump container logs on failure
        if: failure()
        run: docker compose -f compose.e2e.yaml logs

      - name: Tear down
        if: always()
        run: docker compose -f compose.e2e.yaml down -v
```

- [ ] **Step 2: Push and confirm it passes**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: typecheck, lint, unit, and E2E against the production image"
git push -u origin dev/nextjs-foundation
```
Then open the Actions tab. Expected: the `verify` job is green. If E2E fails on a timeout, raise the `retries` on the web healthcheck in `compose.e2e.yaml` — CI runners are slower than a laptop.

---

## Task 14: Deploy to Render

> **Ask the user before running anything that touches a cloud account.** This task creates real infrastructure. No `aws` commands are involved (S3/CloudFront arrive in P4), but the Render and Atlas steps below are done **by the user in a browser**, not by an agent.

**Files:**
- Create: `render.yaml`
- Modify: `README.md`

- [ ] **Step 1: Write the Render blueprint**

`render.yaml` — the `realtime` service is declared now but is a placeholder until P3; a Key Value instance is included because the free tier allows only one per workspace and we want it reserved.

```yaml
services:
  - type: web
    name: blogchat-web
    runtime: node
    region: frankfurt
    plan: free
    buildCommand: npm ci && npm run build --workspace=@blog/web
    startCommand: node apps/web/.next/standalone/apps/web/server.js
    healthCheckPath: /blog
    envVars:
      - key: NODE_VERSION
        value: '22'
      - key: MONGODB_URI
        sync: false        # set in the dashboard — never committed
      - key: AUTH_SECRET
        generateValue: true
      - key: AUTH_TRUST_HOST
        value: 'true'
      - key: REDIS_URL
        fromService:
          type: keyvalue
          name: blogchat-kv
          property: connectionString

  - type: keyvalue
    name: blogchat-kv
    region: frankfurt      # MUST match the web service's region
    plan: free
    ipAllowList: []        # empty = private network only, no public access
    maxmemoryPolicy: allkeys-lru
```

- [ ] **Step 2: Provision MongoDB Atlas (user does this in a browser)**

1. Wipe the existing cluster's data (the spec says start from scratch).
2. Create a database user with a strong password.
3. Network Access → allow `0.0.0.0/0` (Render's free tier has no static outbound IPs, so an allowlist is not possible).
4. Copy the connection string.

- [ ] **Step 3: Deploy (user does this in a browser)**

1. Render Dashboard → **New → Blueprint** → point at the repo → it reads `render.yaml`.
2. Set `MONGODB_URI` in the dashboard when prompted (it is `sync: false`).
3. Wait for the build.

- [ ] **Step 4: Seed production**

```bash
MONGODB_URI='<atlas-connection-string>' npm run seed
```
Expected: `seeded 3 posts` / `demo account: demo / demo-password`.

- [ ] **Step 5: Verify the deployment by hand**

Visit the Render URL. Confirm, in order:
1. `/blog` lists three posts (this proves Atlas is connected).
2. Sign in as `demo` / `demo-password`.
3. Open the Members post signed out, in a private window → teaser only, and **view-source does not contain the third paragraph.**
4. `/blog/new` while signed out → redirected to `/login`.

> **Expect a ~60 second cold start** on the first request after 15 minutes of inactivity. This is the accepted free-tier trade-off recorded in the spec, not a bug.

- [ ] **Step 6: Rewrite the README**

Replace the CRA boilerplate. It must contain: the live demo URL, the demo credentials, a one-paragraph "why I rebuilt it" (the authorization holes, the impossible-to-secure paywall, the SEO), the architecture, `docker compose watch` setup instructions, and the CI badge.

- [ ] **Step 7: Commit and open the PR**

```bash
git add render.yaml README.md
git commit -m "feat(deploy): Render blueprint and rewritten README"
git push
gh pr create --title "Phase 1: Next.js foundation" --body "Implements docs/superpowers/specs/2026-07-12-blog-chat-renewal-design.md Phase 1."
```

---

## Self-Review

**Spec coverage.** Every P1 item in spec §13 maps to a task: monorepo (1), Zod + Mongoose in `packages/shared` (2, 3), Tailwind + shadcn white/blue (4), design-system skeleton `ui`/`patterns`/`layouts` (4), Auth.js credentials (6), posts CRUD with authorization (7, 8, 9), Compose dev + e2e (5, 12), seed (11), CI (13), Render deploy (14).

**Deliberately deferred to later phases, per the spec:** `AutoForm` (P2 — it needs the Markdown editor to be worth generalizing; `PostForm` is hand-built for now), comments (P2), the `premium` *gating* is built in P1 because the data model needs it, but the **paywall JSON-LD** is P2. Redis is *provisioned* in Task 5 and 14 but not *used* until P3 — this is intentional, because the free tier allows only one Key Value instance per workspace and reserving it early avoids a scramble later.

**Two deviations from the spec, both forced by library constraints, both flagged to the user:**
1. **The MongoDB adapter is not used in P1.** Auth.js does not support database sessions with the Credentials provider; `strategy: 'jwt'` is mandatory. The adapter arrives in P5 with OAuth. The session is still an httpOnly cookie.
2. **`auth.config.ts` / `auth.ts` are split** because `middleware.ts` runs on the Edge runtime and cannot load Mongoose or bcrypt.

**Type consistency check.** `SessionUser` (`{ id, username }`) is produced by Task 7 and consumed by Tasks 8 and 9. `ActionState` is defined in Task 9 (`lib/actions/types.ts`) and consumed by the forms in the same task and by Task 10. `PostView` gains `likedByViewer` in Task 10 Step 5 — the plan calls out that Task 8's tests may need an added assertion when that field lands, which is the one place a later task edits an earlier task's type.

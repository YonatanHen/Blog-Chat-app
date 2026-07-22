# P2 — React Client Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `apps/client` — a Vite + React SPA that consumes P1's API, giving the blog a UI. Served by
`apps/api` in prod (one origin, no CORS — spec §11); proxied by Vite in dev for the same reason.

**Architecture:** Server state lives in TanStack Query, never a client store — no Redux (spec §9). Every
network call goes through a typed wrapper in `src/api/*` with `credentials: 'include'`; no component calls
`fetch` directly. Three-tier components (`ui/` primitives, `patterns/` composed, `layouts/` page chrome —
spec §4). Content gating is server-enforced already (P1); the client just renders whatever the API sends —
there is no client-side gating logic to get wrong.

**Tech Stack** (current stable, verified against the npm registry on 2026-07-22): React 19.2, Vite 8,
`@vitejs/plugin-react` 6, React Router 8 (data router), TanStack Query 5, Tailwind CSS 4 (CSS-first config,
`@tailwindcss/vite` plugin — no `tailwind.config.js`/PostCSS needed), `class-variance-authority` (cva),
`sonner` (toasts), `lucide-react` (icons). Testing: Vitest + `@testing-library/react` + `jsdom` for
components/hooks (unit layer), Playwright for E2E (spec §10).

**Spec:** `docs/superpowers/specs/2026-07-16-express-react-rebuild-design.md` §3 (`apps/client` layout), §4
(component tiers), §6 (gating — already server-enforced, read only), §9 (data flow, routes table), §10
(testing), §11 (environments/proxy). This plan implements the P2 row of §13.

**Branch:** `dev/react-client`, off `staging` (P1 merged).

---

## Global Constraints

- **No component calls `fetch` directly.** Every request goes through `src/api/*`, which sets
  `credentials: 'include'` so the httpOnly session cookie rides along.
- **Server state is TanStack Query's job. No Redux, no client store for anything the API owns.**
- **The client never re-implements gating.** `PostDto.gated` (from P1's `postService`) tells the UI whether
  it received a teaser; the client shows a "Sign in to read" prompt when `gated` is true and nothing more.
  Any route guard in this plan (e.g. the editor) is **UX only** — the API is what actually enforces
  authorization (spec §9 routes table).
- **One component per `.tsx` file**, split `ui/` (styling primitives) / `patterns/` (composed) / `layouts/`
  (page chrome), per CLAUDE.md.
- **The API's error JSON shape is fixed and must not be re-invented client-side:**
  `{ error: { message: string, fields?: Record<string, string[]> } }` — `fields` present only on a 400
  (`apps/api/src/middleware/error-handler.ts`).
- **No `any`** — `@typescript-eslint/no-explicit-any` is already an error at the root; `apps/client` inherits
  the root `eslint.config.mjs`, extended with React-specific rules in Task 1.
- **Light theme only, no dark-mode toggle** (spec §2) — cream background, burnt-orange/espresso brand palette.
- Node >= 22 (already pinned repo-wide).

---

## File Structure

**Modified at the root:**

| File | Change |
|---|---|
| `package.json` | add `@blog/client` workspace is automatic (already `apps/*`); no root script changes needed — `typecheck`/`build`/`test` already fan out |
| `eslint.config.mjs` | add a React-scoped config block (JSX, hooks rules) for `apps/client/**` |
| `.env.example` | uncomment `CLIENT_DIST`, document `VITE_API_PROXY_TARGET` |
| `compose.yaml` | add a `client` dev service (Vite dev server, proxying `/api` to `api`) |
| `compose.e2e.yaml` | `api` service gets `CLIENT_DIST=apps/client/dist` — the runner image now has a build to serve |
| `render.yaml` | no new service — the client ships baked into `blogchat-api`'s image, per spec §11 |
| `playwright.config.ts` | create — points at `compose.e2e.yaml`'s stack |
| `e2e/*.spec.ts` | create — Playwright specs |

**Modified in `apps/api`:** `Dockerfile` (`builder` stage also builds the client; `runner` stage copies its
`dist` alongside the API's).

**Created in `apps/client`:**

```
apps/client/
├── package.json / tsconfig.json / tsconfig.node.json / vite.config.ts / vitest.config.ts / index.html
└── src/
    ├── main.tsx                     # QueryClientProvider + RouterProvider + <Toaster />
    ├── routes.tsx                   # createBrowserRouter route table
    ├── index.css                    # @import "tailwindcss"; + shadcn CSS variables (light only)
    ├── test/setup.ts                # jest-dom matchers, MSW-free fetch mocking helpers
    ├── lib/
    │   ├── cn.ts                    # clsx + tailwind-merge, the cva convention
    │   └── query-client.ts          # QueryClient instance + query-key constants
    ├── api/
    │   ├── client.ts                # request(), ApiError — the ONE place fetch() is called
    │   ├── auth.ts / posts.ts / users.ts   # typed per-resource wrappers
    ├── hooks/
    │   ├── use-auth.ts               # useMe, useLogin, useSignup, useLogout
    │   ├── use-posts.ts               # usePosts, usePost, useCreatePost, useUpdatePost, useDeletePost
    │   └── use-likes.ts               # useLike / useUnlike, optimistic
    ├── components/
    │   ├── ui/                       # Button, Input, Label, Textarea, Card, Skeleton
    │   ├── patterns/                 # PostCard, EmptyState, PageHeader, AutoForm, RequireAuth
    │   └── layouts/PageShell.tsx      # nav + container, wraps every page
    └── pages/
        ├── BlogFeedPage.tsx / PostPage.tsx / NewPostPage.tsx / EditPostPage.tsx
        └── LoginPage.tsx / SignupPage.tsx
```

---

## Task 1: Vite scaffold, workspace wiring, Tailwind

**Files:**
- Create: `apps/client/package.json`, `tsconfig.json`, `tsconfig.node.json`, `vite.config.ts`, `index.html`
- Create: `apps/client/src/main.tsx` (placeholder `<h1>`), `src/index.css`
- Modify: `eslint.config.mjs`, `.env.example`

**Interfaces:**
- Consumes: nothing (first task)
- Produces: `npm run dev --workspace=@blog/client` on `:5173`, proxying `/api` to the value of
  `VITE_API_PROXY_TARGET` (default `http://localhost:3000`); `npm run build --workspace=@blog/client` →
  `apps/client/dist`

- [ ] **Step 1: Write `apps/client/package.json`**

```json
{
  "name": "@blog/client",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run",
    "preview": "vite preview"
  },
  "dependencies": {
    "@blog/shared": "*",
    "@tanstack/react-query": "^5.101.4",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "lucide-react": "^1.25.0",
    "react": "^19.2.8",
    "react-dom": "^19.2.8",
    "react-router": "^8.3.0",
    "sonner": "^2.0.7",
    "tailwind-merge": "^3.6.0"
  },
  "devDependencies": {
    "@tailwindcss/vite": "^4.3.3",
    "@testing-library/jest-dom": "^7.0.0",
    "@testing-library/react": "^16.3.2",
    "@types/react": "^19.2.0",
    "@types/react-dom": "^19.2.0",
    "@vitejs/plugin-react": "^6.0.4",
    "jsdom": "^29.1.1",
    "tailwindcss": "^4.3.3",
    "vite": "^8.1.5"
  }
}
```

- [ ] **Step 2: Write `apps/client/tsconfig.json` and `tsconfig.node.json`**

```json
// apps/client/tsconfig.json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "composite": false,
    "jsx": "react-jsx",
    "types": ["vite/client"]
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

```json
// apps/client/tsconfig.node.json — separate project so vite.config.ts (a Node file)
// doesn't pull DOM/JSX assumptions into the app's own compile, and vice versa.
{
  "compilerOptions": {
    "composite": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "types": ["node"]
  },
  "include": ["vite.config.ts", "vitest.config.ts"]
}
```

- [ ] **Step 3: Write `vite.config.ts` — the dev proxy is the load-bearing part**

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Same-origin in every environment (spec §11): the browser only ever talks to
// :5173, and Vite forwards /api server-side. In Compose, VITE_API_PROXY_TARGET
// is set to http://api:3000 (the container's service name); outside Compose it
// defaults to localhost.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:3000',
        changeOrigin: false,
      },
    },
  },
})
```

- [ ] **Step 4: Write `index.html`, `src/main.tsx` (placeholder), `src/index.css`**

```html
<!-- apps/client/index.html -->
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Blog-Chat</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

```ts
// apps/client/src/main.tsx — replaced with the real app in Task 4
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <h1>Blog-Chat</h1>
  </StrictMode>,
)
```

```css
/* apps/client/src/index.css — Tailwind v4 is CSS-first: no tailwind.config.js,
   no postcss.config.js. Light theme only (spec §2) — no .dark block. */
@import 'tailwindcss';

:root {
  --background: oklch(0.98 0.051 105);       /* #FDFBD4 cream */
  --foreground: oklch(0.28 0.047 67.5);      /* #38240D espresso */
  --primary: oklch(0.581 0.155 49.5);        /* #C05800 burnt orange */
  --primary-foreground: oklch(0.98 0.051 105); /* cream, for text on the orange primary */
  --border: oklch(0.87 0.035 55);            /* light tan, same hue family as rust/orange */
  --muted: oklch(0.94 0.025 60);             /* pale tan panel background */
  --muted-foreground: oklch(0.403 0.101 53.8); /* #713600 rust */
  --destructive: oklch(0.58 0.24 27);        /* red-orange, kept — already warm, harmonizes */
}

body {
  background: var(--background);
  color: var(--foreground);
}
```

- [ ] **Step 5: Add the React-scoped eslint block**

Append to `eslint.config.mjs`'s `tseslint.config(...)` call, as an additional config object (existing
`ignores` and rules blocks stay untouched):

```js
{
  files: ['apps/client/**/*.{ts,tsx}'],
  rules: {
    // React 19 doesn't need `import React` for JSX; unused-import churn is noise.
    '@typescript-eslint/no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
    ],
  },
},
```

- [ ] **Step 6: Uncomment/extend `.env.example`**

```bash
# Directory holding the built SPA. Unset in dev (Vite serves it separately).
# Set by compose.e2e.yaml / render.yaml for the production/e2e image.
# CLIENT_DIST=apps/client/dist

# Where the client dev server proxies /api to. Defaults to localhost; Compose
# overrides it to the api container's service name.
# VITE_API_PROXY_TARGET=http://localhost:3000
```

- [ ] **Step 7: Gate and commit**

Run: `npm install && npm run typecheck && npm run lint && npm run build`
Expected: all pass; `apps/client/dist/index.html` exists.

```bash
git add apps/client package.json package-lock.json eslint.config.mjs .env.example
git commit -m "feat(client): Vite + React + Tailwind v4 scaffold with dev proxy"
```

---

## Task 2: UI primitives (`components/ui/`)

**Files:**
- Create: `apps/client/src/lib/cn.ts`
- Create: `apps/client/src/components/ui/button.tsx`, `input.tsx`, `label.tsx`, `textarea.tsx`, `card.tsx`,
  `skeleton.tsx`
- Test: `apps/client/src/components/ui/button.test.tsx`
- Create: `apps/client/vitest.config.ts`, `apps/client/src/test/setup.ts`

**Interfaces:**
- Produces: `cn(...classes)`; `<Button variant="default"|"outline"|"ghost"|"destructive" size="sm"|"default"|"lg">`,
  `<Input>`, `<Label>`, `<Textarea>`, `<Card>`, `<Skeleton>` — all forward `ref` and spread native props.

- [ ] **Step 1: Wire up Vitest for component tests**

```ts
// apps/client/vitest.config.ts
import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config'

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: { environment: 'jsdom', setupFiles: ['./src/test/setup.ts'], globals: true },
  }),
)
```

```ts
// apps/client/src/test/setup.ts
import '@testing-library/jest-dom/vitest'
```

- [ ] **Step 2: Write the failing test for `Button`'s variant/disabled behavior**

```tsx
// apps/client/src/components/ui/button.test.tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Button } from './button.js'

describe('Button', () => {
  it('renders its children and forwards onClick', async () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Save</Button>)
    screen.getByText('Save').click()
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('is disabled and non-interactive when disabled is set', () => {
    render(<Button disabled>Save</Button>)
    expect(screen.getByText('Save')).toBeDisabled()
  })

  it('applies the destructive variant class', () => {
    render(<Button variant="destructive">Delete</Button>)
    expect(screen.getByText('Delete').className).toContain('bg-[var(--destructive)]')
  })
})
```

- [ ] **Step 3: Run it and confirm it fails**

Run: `npm run test -- apps/client/src/components/ui/button.test.tsx`
Expected: FAIL — `./button.js` does not exist yet.

- [ ] **Step 4: Implement `cn` and `Button`**

```ts
// apps/client/src/lib/cn.ts
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
```

```tsx
// apps/client/src/components/ui/button.tsx
import { cva, type VariantProps } from 'class-variance-authority'
import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cn } from '../../lib/cn.js'

const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-[var(--primary)] text-[var(--primary-foreground)] hover:opacity-90',
        outline: 'border border-[var(--border)] bg-transparent hover:bg-[var(--muted)]',
        ghost: 'bg-transparent hover:bg-[var(--muted)]',
        destructive: 'bg-[var(--destructive)] text-[var(--primary-foreground)] hover:opacity-90',
      },
      size: {
        sm: 'h-8 px-3',
        default: 'h-10 px-4',
        lg: 'h-12 px-6 text-base',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  ),
)
Button.displayName = 'Button'
```

- [ ] **Step 5: Run it and confirm it passes**

Run: `npm run test -- apps/client/src/components/ui/button.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 6: Implement the remaining primitives (no new test — thin wrappers, exercised transitively by
  Task 4+'s component tests)**

```tsx
// apps/client/src/components/ui/input.tsx
import { forwardRef, type InputHTMLAttributes } from 'react'
import { cn } from '../../lib/cn.js'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'h-10 w-full rounded-md border border-[var(--border)] bg-transparent px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]',
        className,
      )}
      {...props}
    />
  ),
)
Input.displayName = 'Input'
```

```tsx
// apps/client/src/components/ui/label.tsx
import { forwardRef, type LabelHTMLAttributes } from 'react'
import { cn } from '../../lib/cn.js'

export const Label = forwardRef<HTMLLabelElement, LabelHTMLAttributes<HTMLLabelElement>>(
  ({ className, ...props }, ref) => (
    <label ref={ref} className={cn('text-sm font-medium', className)} {...props} />
  ),
)
Label.displayName = 'Label'
```

```tsx
// apps/client/src/components/ui/textarea.tsx
import { forwardRef, type TextareaHTMLAttributes } from 'react'
import { cn } from '../../lib/cn.js'

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        'min-h-32 w-full rounded-md border border-[var(--border)] bg-transparent p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]',
        className,
      )}
      {...props}
    />
  ),
)
Textarea.displayName = 'Textarea'
```

```tsx
// apps/client/src/components/ui/card.tsx
import type { HTMLAttributes } from 'react'
import { cn } from '../../lib/cn.js'

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-lg border border-[var(--border)] p-4', className)} {...props} />
}
```

```tsx
// apps/client/src/components/ui/skeleton.tsx
import type { HTMLAttributes } from 'react'
import { cn } from '../../lib/cn.js'

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('animate-pulse rounded-md bg-[var(--muted)]', className)} {...props} />
}
```

- [ ] **Step 7: Gate and commit**

Run: `npm run typecheck && npm run lint && npm run test`

```bash
git add apps/client/src/lib apps/client/src/components/ui apps/client/vitest.config.ts apps/client/src/test
git commit -m "feat(client): ui primitives (Button, Input, Label, Textarea, Card, Skeleton)"
```

---

## Task 3: API client layer

**Files:**
- Create: `apps/client/src/api/client.ts`, `auth.ts`, `posts.ts`, `users.ts`
- Test: `apps/client/src/api/client.test.ts`

**Interfaces:**
- Consumes: `PostDto`-shaped JSON from `GET/POST/PATCH /api/v1/posts*` (P1); the fixed error shape from
  `apps/api/src/middleware/error-handler.ts`
- Produces:
  - `class ApiError extends Error { status: number; fields: Record<string, string[]> }`
  - `request<T>(path: string, init?: RequestInit): Promise<T>` — throws `ApiError` on a non-2xx response
  - `type Post = { id: string; title: string; slug: string; body: string; premium: boolean; gated: boolean; author: { id: string; username: string }; tags: string[]; likeCount: number; coverImage?: string; createdAt: string; updatedAt: string }`
    (mirrors `apps/api/src/lib/services/post.ts`'s `PostDto`, with dates as ISO strings over JSON)
  - `authApi.signup/login/logout/me`, `postsApi.list/get/create/update/remove/like/unlike`,
    `usersApi.get/update/remove`

- [ ] **Step 1: Write the failing test for `request`'s error handling**

```ts
// apps/client/src/api/client.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, request } from './client.js'

describe('request', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('returns the parsed JSON body on a 2xx response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 })),
    )
    await expect(request('/api/v1/health')).resolves.toEqual({ ok: true })
  })

  it('returns undefined for a 204 with no body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })))
    await expect(request('/api/v1/posts/x')).resolves.toBeUndefined()
  })

  it('throws ApiError carrying the status and field errors on a 400', async () => {
    const body = { error: { message: 'Invalid input.', fields: { title: ['Too short'] } } }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 400 })))
    await expect(request('/api/v1/posts')).rejects.toMatchObject({
      status: 400,
      message: 'Invalid input.',
      fields: { title: ['Too short'] },
    })
  })

  it('always sends credentials so the session cookie rides along', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await request('/api/v1/posts')
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/posts', expect.objectContaining({ credentials: 'include' }))
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm run test -- apps/client/src/api/client.test.ts`
Expected: FAIL — `./client.js` does not exist.

- [ ] **Step 3: Implement `request` and `ApiError`**

```ts
// apps/client/src/api/client.ts
export class ApiError extends Error {
  readonly status: number
  readonly fields: Record<string, string[]>

  constructor(status: number, message: string, fields: Record<string, string[]> = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.fields = fields
  }
}

export async function request<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...init.headers },
  })

  if (res.status === 204) return undefined as T

  const body = (await res.json().catch(() => null)) as
    | { error?: { message: string; fields?: Record<string, string[]> } }
    | null

  if (!res.ok) {
    throw new ApiError(res.status, body?.error?.message ?? 'Request failed.', body?.error?.fields ?? {})
  }

  return body as T
}
```

- [ ] **Step 4: Run it and confirm it passes**

Run: `npm run test -- apps/client/src/api/client.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Implement the typed per-resource wrappers (no new test — thin, exercised by the hook tests
  in Tasks 5/7/9/10)**

```ts
// apps/client/src/api/posts.ts
import { request } from './client.js'

export type PostAuthor = { id: string; username: string }

export type Post = {
  id: string
  title: string
  slug: string
  body: string
  premium: boolean
  gated: boolean
  author: PostAuthor
  tags: string[]
  likeCount: number
  coverImage?: string
  createdAt: string
  updatedAt: string
}

export type CreatePostInput = { title: string; body: string; premium?: boolean; tags?: string[] }
export type UpdatePostInput = Partial<CreatePostInput>

export const postsApi = {
  list: () => request<Post[]>('/api/v1/posts'),
  get: (slug: string) => request<Post>(`/api/v1/posts/${slug}`),
  create: (input: CreatePostInput) =>
    request<Post>('/api/v1/posts', { method: 'POST', body: JSON.stringify(input) }),
  update: (slug: string, input: UpdatePostInput) =>
    request<Post>(`/api/v1/posts/${slug}`, { method: 'PATCH', body: JSON.stringify(input) }),
  remove: (slug: string) => request<void>(`/api/v1/posts/${slug}`, { method: 'DELETE' }),
  like: (slug: string) => request<{ likeCount: number }>(`/api/v1/posts/${slug}/likes`, { method: 'PUT' }),
  unlike: (slug: string) =>
    request<{ likeCount: number }>(`/api/v1/posts/${slug}/likes`, { method: 'DELETE' }),
}
```

```ts
// apps/client/src/api/auth.ts
import { request } from './client.js'

export type AuthUser = { id: string; username: string }
export type SignupInput = { username: string; email: string; password: string }
export type LoginInput = { username: string; password: string }

export const authApi = {
  signup: (input: SignupInput) =>
    request<AuthUser>('/api/v1/auth/signup', { method: 'POST', body: JSON.stringify(input) }),
  login: (input: LoginInput) =>
    request<AuthUser>('/api/v1/auth/login', { method: 'POST', body: JSON.stringify(input) }),
  logout: () => request<void>('/api/v1/auth/logout', { method: 'POST' }),
  me: () => request<AuthUser>('/api/v1/auth/me'),
}
```

```ts
// apps/client/src/api/users.ts
import { request } from './client.js'

export type PublicUser = { id: string; username: string; bio?: string; image?: string; createdAt: string }
export type UpdateUserInput = { bio?: string; image?: string; password?: string }

export const usersApi = {
  get: (id: string) => request<PublicUser>(`/api/v1/users/${id}`),
  update: (id: string, input: UpdateUserInput) =>
    request<PublicUser>(`/api/v1/users/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
  remove: (id: string) => request<void>(`/api/v1/users/${id}`, { method: 'DELETE' }),
}
```

- [ ] **Step 6: Gate and commit**

Run: `npm run typecheck && npm run lint && npm run test`

```bash
git add apps/client/src/api
git commit -m "feat(client): typed API wrappers (client.ts + auth/posts/users)"
```

---

## Task 4: Query client, router, page shell

**Files:**
- Create: `apps/client/src/lib/query-client.ts`, `src/routes.tsx`
- Create: `apps/client/src/components/layouts/PageShell.tsx`
- Modify: `apps/client/src/main.tsx`

**Interfaces:**
- Consumes: `postsApi`, `authApi` (Task 3)
- Produces: `queryClient: QueryClient`; `queryKeys.posts.list/detail(slug)`, `queryKeys.me`; the route table
  (paths from spec §9); `<PageShell>` wrapping every page with nav + container

- [ ] **Step 1: Write the query client and key constants**

```ts
// apps/client/src/lib/query-client.ts
import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
})

export const queryKeys = {
  posts: {
    list: ['posts'] as const,
    detail: (slug: string) => ['posts', slug] as const,
  },
  me: ['me'] as const,
}
```

- [ ] **Step 2: Write `PageShell`**

```tsx
// apps/client/src/components/layouts/PageShell.tsx
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { useMe, useLogout } from '../../hooks/use-auth.js'
import { Button } from '../ui/button.js'

export function PageShell({ children }: { children: ReactNode }) {
  const { data: me } = useMe()
  const logout = useLogout()

  return (
    <div className="min-h-screen">
      <header className="border-b border-[var(--border)]">
        <nav className="mx-auto flex max-w-3xl items-center justify-between p-4">
          <Link to="/" className="text-lg font-semibold">
            Blog-Chat
          </Link>
          <div className="flex items-center gap-3">
            {me ? (
              <>
                <Link to="/blog/new" className="text-sm">
                  New post
                </Link>
                <Button variant="ghost" size="sm" onClick={() => logout.mutate()}>
                  Log out
                </Button>
              </>
            ) : (
              <>
                <Link to="/login" className="text-sm">
                  Log in
                </Link>
                <Link to="/signup" className="text-sm">
                  Sign up
                </Link>
              </>
            )}
          </div>
        </nav>
      </header>
      <main className="mx-auto max-w-3xl p-4">{children}</main>
    </div>
  )
}
```

(`useMe`/`useLogout` are implemented in Task 5 — this file is written now and typechecks once Task 5 lands;
the two tasks are typically done in the same PR, so this is a documented forward reference, not a broken
build in isolation.)

- [ ] **Step 3: Write the route table**

```tsx
// apps/client/src/routes.tsx
import { createBrowserRouter } from 'react-router'
import { PageShell } from './components/layouts/PageShell.js'
import { BlogFeedPage } from './pages/BlogFeedPage.js'
import { PostPage } from './pages/PostPage.js'
import { NewPostPage } from './pages/NewPostPage.js'
import { EditPostPage } from './pages/EditPostPage.js'
import { LoginPage } from './pages/LoginPage.js'
import { SignupPage } from './pages/SignupPage.js'

export const router = createBrowserRouter([
  {
    element: (
      <PageShell>
        {/* Outlet renders the matched child route */}
        <Outlet />
      </PageShell>
    ),
    children: [
      { path: '/', element: <BlogFeedPage /> },
      { path: '/blog/new', element: <NewPostPage /> },
      { path: '/blog/:slug', element: <PostPage /> },
      { path: '/blog/:slug/edit', element: <EditPostPage /> },
      { path: '/login', element: <LoginPage /> },
      { path: '/signup', element: <SignupPage /> },
    ],
  },
])
```

Add the missing `Outlet` import: `import { Outlet, createBrowserRouter } from 'react-router'`.

- [ ] **Step 4: Wire `main.tsx`**

```tsx
// apps/client/src/main.tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router/dom'
import { Toaster } from 'sonner'
import { queryClient } from './lib/query-client.js'
import { router } from './routes.js'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <Toaster position="top-center" />
    </QueryClientProvider>
  </StrictMode>,
)
```

- [ ] **Step 5: Gate and commit** (once Tasks 5–9's page stubs exist — see note below)

> **Sequencing note:** this task's `routes.tsx` imports six page components and `PageShell` imports
> `use-auth.ts`, none of which exist until Tasks 5–9. Do Task 5 (auth pages + hooks) immediately after this
> one, then stub `BlogFeedPage`/`PostPage`/`NewPostPage`/`EditPostPage` with a one-line placeholder so the
> build is green, and let Tasks 7–9 replace the stubs with real implementations. Do not skip the gate.

```bash
git add apps/client/src/lib/query-client.ts apps/client/src/routes.tsx apps/client/src/components/layouts apps/client/src/main.tsx
git commit -m "feat(client): query client, router, page shell"
```

---

## Task 5: Auth pages, hooks, route guard

**Files:**
- Create: `apps/client/src/hooks/use-auth.ts`
- Create: `apps/client/src/components/patterns/RequireAuth.tsx`
- Create: `apps/client/src/pages/LoginPage.tsx`, `SignupPage.tsx`
- Test: `apps/client/src/hooks/use-auth.test.tsx`

**Interfaces:**
- Consumes: `authApi` (Task 3), `queryKeys.me` (Task 4)
- Produces:
  - `useMe(): UseQueryResult<AuthUser | null>` — resolves `null` (not throwing) on a 401, so callers don't
    need a try/catch just to check "am I logged in"
  - `useLogin/useSignup(): UseMutationResult` — invalidate `queryKeys.me` on success
  - `useLogout(): UseMutationResult` — clears the `me` cache to `null` directly (no need to refetch a
    logged-out state)
  - `<RequireAuth>{children}</RequireAuth>` — redirects to `/login` if `useMe()` resolves to `null`

- [ ] **Step 1: Write the failing test for `useMe`'s 401-as-null behavior**

```tsx
// apps/client/src/hooks/use-auth.test.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useMe } from './use-auth.js'

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

describe('useMe', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('resolves to null on a 401 rather than throwing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { message: 'Unauthorized.' } }), { status: 401 }),
      ),
    )
    const { result } = renderHook(() => useMe(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toBeNull()
  })

  it('resolves to the user on 200', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: '1', username: 'demo' }), { status: 200 })),
    )
    const { result } = renderHook(() => useMe(), { wrapper })
    await waitFor(() => expect(result.current.data).toEqual({ id: '1', username: 'demo' }))
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm run test -- apps/client/src/hooks/use-auth.test.tsx`
Expected: FAIL — `./use-auth.js` does not exist.

- [ ] **Step 3: Implement `use-auth.ts`**

```ts
// apps/client/src/hooks/use-auth.ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { authApi, type AuthUser, type LoginInput, type SignupInput } from '../api/auth.js'
import { ApiError } from '../api/client.js'
import { queryKeys } from '../lib/query-client.js'

export function useMe() {
  return useQuery({
    queryKey: queryKeys.me,
    queryFn: async (): Promise<AuthUser | null> => {
      try {
        return await authApi.me()
      } catch (err) {
        // Anonymous is an expected state, not an error to surface — everywhere
        // that reads useMe() just checks `data == null`.
        if (err instanceof ApiError && err.status === 401) return null
        throw err
      }
    },
  })
}

export function useLogin() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: LoginInput) => authApi.login(input),
    onSuccess: (user) => queryClient.setQueryData(queryKeys.me, user),
  })
}

export function useSignup() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: SignupInput) => authApi.signup(input),
    onSuccess: (user) => queryClient.setQueryData(queryKeys.me, user),
  })
}

export function useLogout() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => authApi.logout(),
    onSuccess: () => queryClient.setQueryData(queryKeys.me, null),
  })
}
```

- [ ] **Step 4: Run it and confirm it passes**

Run: `npm run test -- apps/client/src/hooks/use-auth.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Implement `RequireAuth`, `LoginPage`, `SignupPage`** (no new test — `RequireAuth`'s redirect
  and the forms' field-error rendering are covered by the Playwright flow in Task 9)

```tsx
// apps/client/src/components/patterns/RequireAuth.tsx
import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { useMe } from '../../hooks/use-auth.js'

// UX guard only. The API is what actually enforces authorization (spec §9) —
// this just avoids showing an editor to a user who will get a 401 anyway.
export function RequireAuth({ children }: { children: ReactNode }) {
  const { data: me, isPending } = useMe()
  const location = useLocation()

  if (isPending) return null
  if (!me) return <Navigate to="/login" state={{ from: location.pathname }} replace />
  return <>{children}</>
}
```

```tsx
// apps/client/src/pages/LoginPage.tsx
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { useLogin } from '../hooks/use-auth.js'
import { Button } from '../components/ui/button.js'
import { Input } from '../components/ui/input.js'
import { Label } from '../components/ui/label.js'

export function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const login = useLogin()
  const navigate = useNavigate()

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    login.mutate(
      { username, password },
      {
        onSuccess: () => navigate('/'),
        onError: () => toast.error('Invalid username or password.'),
      },
    )
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto flex max-w-sm flex-col gap-4">
      <h1 className="text-xl font-semibold">Log in</h1>
      <div className="flex flex-col gap-1">
        <Label htmlFor="username">Username</Label>
        <Input id="username" value={username} onChange={(e) => setUsername(e.target.value)} required />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </div>
      <Button type="submit" disabled={login.isPending}>
        Log in
      </Button>
    </form>
  )
}
```

```tsx
// apps/client/src/pages/SignupPage.tsx
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { useSignup } from '../hooks/use-auth.js'
import { ApiError } from '../api/client.js'
import { Button } from '../components/ui/button.js'
import { Input } from '../components/ui/input.js'
import { Label } from '../components/ui/label.js'

export function SignupPage() {
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const signup = useSignup()
  const navigate = useNavigate()

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    signup.mutate(
      { username, email, password },
      {
        onSuccess: () => navigate('/'),
        onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Signup failed.'),
      },
    )
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto flex max-w-sm flex-col gap-4">
      <h1 className="text-xl font-semibold">Sign up</h1>
      <div className="flex flex-col gap-1">
        <Label htmlFor="username">Username</Label>
        <Input id="username" value={username} onChange={(e) => setUsername(e.target.value)} required />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
        />
      </div>
      <Button type="submit" disabled={signup.isPending}>
        Sign up
      </Button>
    </form>
  )
}
```

- [ ] **Step 6: Stub the remaining four pages so the app builds**

```tsx
// apps/client/src/pages/BlogFeedPage.tsx (replaced in Task 7)
export function BlogFeedPage() {
  return <p>Coming in Task 7.</p>
}
```

Repeat the same one-line-return pattern for `PostPage.tsx` (Task 8), `NewPostPage.tsx`/`EditPostPage.tsx`
(Task 9) — each just exports a named function returning a placeholder `<p>`.

- [ ] **Step 7: Gate and commit**

Run: `npm run typecheck && npm run lint && npm run build && npm run test`

```bash
git add apps/client/src/hooks/use-auth.ts apps/client/src/hooks/use-auth.test.tsx apps/client/src/components/patterns/RequireAuth.tsx apps/client/src/pages
git commit -m "feat(client): auth pages, hooks, and a UX-only route guard"
```

---

## Task 6: Blog feed + `PostCard`

**Files:**
- Create: `apps/client/src/hooks/use-posts.ts`
- Create: `apps/client/src/components/patterns/PostCard.tsx`, `EmptyState.tsx`
- Modify: `apps/client/src/pages/BlogFeedPage.tsx` (replace the Task 5 stub)
- Test: `apps/client/src/components/patterns/PostCard.test.tsx`

**Interfaces:**
- Consumes: `postsApi.list` (Task 3), `queryKeys.posts.list` (Task 4)
- Produces: `usePosts(): UseQueryResult<Post[]>`; `<PostCard post={Post} />`; `<EmptyState message />`

- [ ] **Step 1: Write the failing test for `PostCard`'s teaser/gated rendering**

```tsx
// apps/client/src/components/patterns/PostCard.test.tsx
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { PostCard } from './PostCard.js'
import type { Post } from '../../api/posts.js'

const basePost: Post = {
  id: '1',
  title: 'Gating at the boundary',
  slug: 'gating-at-the-boundary',
  body: 'Full text here.',
  premium: true,
  gated: true,
  author: { id: 'u1', username: 'demo' },
  tags: ['express'],
  likeCount: 3,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

describe('PostCard', () => {
  it('shows a premium badge and a sign-in prompt when gated', () => {
    render(<PostCard post={basePost} />, { wrapper: MemoryRouter })
    expect(screen.getByText(/premium/i)).toBeInTheDocument()
    expect(screen.getByText(/sign in to read/i)).toBeInTheDocument()
  })

  it('does not show the sign-in prompt for a free or unlocked post', () => {
    render(<PostCard post={{ ...basePost, gated: false }} />, { wrapper: MemoryRouter })
    expect(screen.queryByText(/sign in to read/i)).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm run test -- apps/client/src/components/patterns/PostCard.test.tsx`
Expected: FAIL — `./PostCard.js` does not exist.

- [ ] **Step 3: Implement `PostCard`**

```tsx
// apps/client/src/components/patterns/PostCard.tsx
import { Link } from 'react-router'
import type { Post } from '../../api/posts.js'
import { Card } from '../ui/card.js'

export function PostCard({ post }: { post: Post }) {
  return (
    <Card>
      <Link to={`/blog/${post.slug}`} className="text-lg font-semibold hover:underline">
        {post.title}
      </Link>
      {post.premium && (
        <span className="ml-2 rounded bg-[var(--muted)] px-2 py-0.5 text-xs">Premium</span>
      )}
      <p className="mt-2 text-sm text-[var(--muted-foreground)]">{post.body}</p>
      {post.gated && <p className="mt-2 text-sm text-[var(--primary)]">Sign in to read the full post</p>}
      <p className="mt-3 text-xs text-[var(--muted-foreground)]">
        by {post.author.username} · {post.likeCount} likes
      </p>
    </Card>
  )
}
```

- [ ] **Step 4: Run it and confirm it passes**

Run: `npm run test -- apps/client/src/components/patterns/PostCard.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Implement `usePosts`, `EmptyState`, and the real `BlogFeedPage`**

```ts
// apps/client/src/hooks/use-posts.ts (add to; extended by Tasks 8/9/10)
import { useQuery } from '@tanstack/react-query'
import { postsApi } from '../api/posts.js'
import { queryKeys } from '../lib/query-client.js'

export function usePosts() {
  return useQuery({ queryKey: queryKeys.posts.list, queryFn: postsApi.list })
}
```

```tsx
// apps/client/src/components/patterns/EmptyState.tsx
export function EmptyState({ message }: { message: string }) {
  return <p className="py-12 text-center text-[var(--muted-foreground)]">{message}</p>
}
```

```tsx
// apps/client/src/pages/BlogFeedPage.tsx
import { usePosts } from '../hooks/use-posts.js'
import { PostCard } from '../components/patterns/PostCard.js'
import { EmptyState } from '../components/patterns/EmptyState.js'
import { Skeleton } from '../components/ui/skeleton.js'

export function BlogFeedPage() {
  const { data: posts, isPending } = usePosts()

  if (isPending) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
    )
  }
  if (!posts || posts.length === 0) return <EmptyState message="No posts yet." />

  return (
    <div className="flex flex-col gap-4">
      {posts.map((post) => (
        <PostCard key={post.id} post={post} />
      ))}
    </div>
  )
}
```

- [ ] **Step 6: Gate and commit**

Run: `npm run typecheck && npm run lint && npm run build && npm run test`

```bash
git add apps/client/src/hooks/use-posts.ts apps/client/src/components/patterns/PostCard.tsx apps/client/src/components/patterns/PostCard.test.tsx apps/client/src/components/patterns/EmptyState.tsx apps/client/src/pages/BlogFeedPage.tsx
git commit -m "feat(client): blog feed page and PostCard"
```

---

## Task 7: Post detail page (gating UI)

**Files:**
- Modify: `apps/client/src/hooks/use-posts.ts` (add `usePost`)
- Modify: `apps/client/src/pages/PostPage.tsx` (replace the Task 5 stub)

**Interfaces:**
- Consumes: `postsApi.get`, `useMe` (Task 5)
- Produces: `usePost(slug): UseQueryResult<Post>`

- [ ] **Step 1: Add `usePost`**

```ts
// apps/client/src/hooks/use-posts.ts — append
export function usePost(slug: string) {
  return useQuery({ queryKey: queryKeys.posts.detail(slug), queryFn: () => postsApi.get(slug) })
}
```

- [ ] **Step 2: Implement `PostPage`**

The API already decided what this page is allowed to show — `post.gated` is the only branch needed. There
is nothing else to check client-side (spec §6).

```tsx
// apps/client/src/pages/PostPage.tsx
import { Link, useParams } from 'react-router'
import { usePost } from '../hooks/use-posts.js'
import { useMe } from '../hooks/use-auth.js'
import { Skeleton } from '../components/ui/skeleton.js'
import { LikeButton } from '../components/patterns/LikeButton.js'

export function PostPage() {
  const { slug } = useParams<{ slug: string }>()
  const { data: post, isPending } = usePost(slug!)
  const { data: me } = useMe()

  if (isPending) return <Skeleton className="h-64" />
  if (!post) return <p>Post not found.</p>

  const isOwner = me?.id === post.author.id

  return (
    <article>
      <h1 className="text-2xl font-semibold">{post.title}</h1>
      <p className="mt-1 text-sm text-[var(--muted-foreground)]">by {post.author.username}</p>
      <div className="mt-4 whitespace-pre-wrap">{post.body}</div>
      {post.gated && (
        <p className="mt-4 rounded bg-[var(--muted)] p-4 text-sm">
          <Link to="/login" className="text-[var(--primary)] underline">
            Sign in
          </Link>{' '}
          to read the rest of this post.
        </p>
      )}
      <div className="mt-6 flex items-center gap-4">
        <LikeButton slug={post.slug} liked={false} likeCount={post.likeCount} />
        {isOwner && (
          <Link to={`/blog/${post.slug}/edit`} className="text-sm underline">
            Edit
          </Link>
        )}
      </div>
    </article>
  )
}
```

(`LikeButton` is built in Task 10 — stub it with a one-line placeholder now if Task 10 hasn't landed yet in
your execution order; this plan's tasks are designed be done in order, so by the time `PostPage` is gated
in review, `LikeButton` already exists.)

- [ ] **Step 3: Gate and commit**

Run: `npm run typecheck && npm run lint && npm run build`

```bash
git add apps/client/src/hooks/use-posts.ts apps/client/src/pages/PostPage.tsx
git commit -m "feat(client): post detail page with server-driven gating UI"
```

---

## Task 8: `AutoForm` and the post editor (create/edit)

**Files:**
- Create: `apps/client/src/components/patterns/AutoForm.tsx`
- Modify: `apps/client/src/hooks/use-posts.ts` (add `useCreatePost`, `useUpdatePost`)
- Modify: `apps/client/src/pages/NewPostPage.tsx`, `EditPostPage.tsx` (replace the Task 5 stubs)
- Test: `apps/client/src/components/patterns/AutoForm.test.tsx`

**Interfaces:**
- Consumes: `CreatePostSchema`/`UpdatePostSchema` from `@blog/shared` (P1)
- Produces: `<AutoForm schema={ZodObject} initialValues? onSubmit={(values) => void} submitLabel? />` —
  renders one field per schema key (string → text/textarea by field name heuristic, boolean → checkbox,
  `string[]` → comma-separated text input), shows `ZodError` field messages inline, calls `onSubmit` with
  the **parsed** (not raw) values only after `schema.safeParse` succeeds.

- [ ] **Step 1: Write the failing test for field derivation and validation**

```tsx
// apps/client/src/components/patterns/AutoForm.test.tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { AutoForm } from './AutoForm.js'

const schema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters'),
  premium: z.coerce.boolean().default(false),
  tags: z.array(z.string()).default([]),
})

describe('AutoForm', () => {
  it('renders one labeled field per schema key', () => {
    render(<AutoForm schema={schema} onSubmit={vi.fn()} />)
    expect(screen.getByLabelText('title')).toBeInTheDocument()
    expect(screen.getByLabelText('premium')).toBeInTheDocument()
    expect(screen.getByLabelText('tags')).toBeInTheDocument()
  })

  it('shows the schema error message and does not call onSubmit for invalid input', () => {
    const onSubmit = vi.fn()
    render(<AutoForm schema={schema} onSubmit={onSubmit} />)
    fireEvent.change(screen.getByLabelText('title'), { target: { value: 'ab' } })
    fireEvent.click(screen.getByText('Save'))
    expect(screen.getByText('Title must be at least 3 characters')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('parses a comma-separated tags input into a string array on submit', () => {
    const onSubmit = vi.fn()
    render(<AutoForm schema={schema} onSubmit={onSubmit} />)
    fireEvent.change(screen.getByLabelText('title'), { target: { value: 'A valid title' } })
    fireEvent.change(screen.getByLabelText('tags'), { target: { value: 'express, testing' } })
    fireEvent.click(screen.getByText('Save'))
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'A valid title', tags: ['express', 'testing'] }),
    )
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm run test -- apps/client/src/components/patterns/AutoForm.test.tsx`
Expected: FAIL — `./AutoForm.js` does not exist.

- [ ] **Step 3: Implement `AutoForm`**

```tsx
// apps/client/src/components/patterns/AutoForm.tsx
import { useState, type FormEvent } from 'react'
import type { z, ZodObject, ZodRawShape } from 'zod'
import { Button } from '../ui/button.js'
import { Input } from '../ui/input.js'
import { Label } from '../ui/label.js'
import { Textarea } from '../ui/textarea.js'

type FieldKind = 'checkbox' | 'textarea' | 'tags' | 'text'

function fieldKind(key: string, def: z.ZodTypeAny): FieldKind {
  const inner = 'unwrap' in def && typeof def.unwrap === 'function' ? def.unwrap() : def
  if (inner._def.typeName === 'ZodBoolean') return 'checkbox'
  if (inner._def.typeName === 'ZodArray') return 'tags'
  if (key === 'body') return 'textarea'
  return 'text'
}

export function AutoForm<S extends ZodObject<ZodRawShape>>({
  schema,
  initialValues,
  onSubmit,
  submitLabel = 'Save',
}: {
  schema: S
  initialValues?: Partial<z.infer<S>>
  onSubmit: (values: z.infer<S>) => void
  submitLabel?: string
}) {
  const shape = schema.shape
  const keys = Object.keys(shape) as (keyof typeof shape & string)[]

  const [values, setValues] = useState<Record<string, string | boolean>>(() =>
    Object.fromEntries(
      keys.map((key) => {
        const initial = initialValues?.[key as keyof typeof initialValues]
        if (fieldKind(key, shape[key]) === 'checkbox') return [key, Boolean(initial ?? false)]
        if (fieldKind(key, shape[key]) === 'tags') return [key, Array.isArray(initial) ? initial.join(', ') : '']
        return [key, typeof initial === 'string' ? initial : '']
      }),
    ),
  )
  const [errors, setErrors] = useState<Record<string, string>>({})

  function parsedValue(key: string): unknown {
    const kind = fieldKind(key, shape[key])
    if (kind === 'checkbox') return values[key]
    if (kind === 'tags') {
      const raw = values[key]
      return typeof raw === 'string'
        ? raw
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean)
        : []
    }
    return values[key]
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const candidate = Object.fromEntries(keys.map((key) => [key, parsedValue(key)]))
    const result = schema.safeParse(candidate)
    if (!result.success) {
      setErrors(Object.fromEntries(result.error.issues.map((issue) => [String(issue.path[0]), issue.message])))
      return
    }
    setErrors({})
    onSubmit(result.data)
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {keys.map((key) => {
        const kind = fieldKind(key, shape[key])
        return (
          <div key={key} className="flex flex-col gap-1">
            <Label htmlFor={key}>{key}</Label>
            {kind === 'checkbox' ? (
              <input
                id={key}
                type="checkbox"
                checked={Boolean(values[key])}
                onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.checked }))}
              />
            ) : kind === 'textarea' ? (
              <Textarea
                id={key}
                value={String(values[key] ?? '')}
                onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
              />
            ) : (
              <Input
                id={key}
                value={String(values[key] ?? '')}
                onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
              />
            )}
            {errors[key] && <p className="text-sm text-[var(--destructive)]">{errors[key]}</p>}
          </div>
        )
      })}
      <Button type="submit">{submitLabel}</Button>
    </form>
  )
}
```

- [ ] **Step 4: Run it and confirm it passes**

Run: `npm run test -- apps/client/src/components/patterns/AutoForm.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Add mutation hooks and wire the two pages**

```ts
// apps/client/src/hooks/use-posts.ts — append
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { CreatePostInput, UpdatePostInput } from '../api/posts.js'

export function useCreatePost() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreatePostInput) => postsApi.create(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.posts.list }),
  })
}

export function useUpdatePost(slug: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: UpdatePostInput) => postsApi.update(slug, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.posts.list })
      queryClient.invalidateQueries({ queryKey: queryKeys.posts.detail(slug) })
    },
  })
}
```

```tsx
// apps/client/src/pages/NewPostPage.tsx
import { CreatePostSchema } from '@blog/shared'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { AutoForm } from '../components/patterns/AutoForm.js'
import { RequireAuth } from '../components/patterns/RequireAuth.js'
import { useCreatePost } from '../hooks/use-posts.js'
import { ApiError } from '../api/client.js'

export function NewPostPage() {
  const createPost = useCreatePost()
  const navigate = useNavigate()

  return (
    <RequireAuth>
      <h1 className="mb-4 text-xl font-semibold">New post</h1>
      <AutoForm
        schema={CreatePostSchema}
        onSubmit={(values) =>
          createPost.mutate(values, {
            onSuccess: (post) => navigate(`/blog/${post.slug}`),
            onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not create post.'),
          })
        }
      />
    </RequireAuth>
  )
}
```

```tsx
// apps/client/src/pages/EditPostPage.tsx
import { UpdatePostSchema } from '@blog/shared'
import { useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import { AutoForm } from '../components/patterns/AutoForm.js'
import { RequireAuth } from '../components/patterns/RequireAuth.js'
import { usePost, useUpdatePost } from '../hooks/use-posts.js'
import { ApiError } from '../api/client.js'

export function EditPostPage() {
  const { slug } = useParams<{ slug: string }>()
  const { data: post } = usePost(slug!)
  const updatePost = useUpdatePost(slug!)
  const navigate = useNavigate()

  if (!post) return null

  return (
    <RequireAuth>
      <h1 className="mb-4 text-xl font-semibold">Edit post</h1>
      <AutoForm
        schema={UpdatePostSchema}
        initialValues={post}
        onSubmit={(values) =>
          updatePost.mutate(values, {
            onSuccess: () => navigate(`/blog/${post.slug}`),
            onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Could not save changes.'),
          })
        }
      />
    </RequireAuth>
  )
}
```

- [ ] **Step 6: Gate and commit**

Run: `npm run typecheck && npm run lint && npm run build && npm run test`

```bash
git add apps/client/src/components/patterns/AutoForm.tsx apps/client/src/components/patterns/AutoForm.test.tsx apps/client/src/hooks/use-posts.ts apps/client/src/pages/NewPostPage.tsx apps/client/src/pages/EditPostPage.tsx
git commit -m "feat(client): schema-driven AutoForm and the post editor"
```

---

## Task 9: Delete post (owner-only UI action)

**Files:**
- Modify: `apps/client/src/hooks/use-posts.ts` (add `useDeletePost`)
- Modify: `apps/client/src/pages/PostPage.tsx` (add a delete button for the owner)

**Interfaces:**
- Consumes: `postsApi.remove` (Task 3)
- Produces: `useDeletePost(slug): UseMutationResult`

- [ ] **Step 1: Add `useDeletePost`**

Legacy bug being fixed here (spec §14 correctness item): a failed delete must not remove the post from the
UI. Using `invalidateQueries` rather than an optimistic removal means a failed request leaves the post
visibly present, because nothing was removed from the cache until the server confirmed it.

```ts
// apps/client/src/hooks/use-posts.ts — append
export function useDeletePost() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (slug: string) => postsApi.remove(slug),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.posts.list }),
  })
}
```

- [ ] **Step 2: Wire the delete button into `PostPage`**

```tsx
// apps/client/src/pages/PostPage.tsx — inside the isOwner block, alongside the Edit link
import { useDeletePost } from '../hooks/use-posts.js' // add to existing imports
import { useNavigate } from 'react-router' // add to existing import
import { Button } from '../components/ui/button.js'

// inside the component, alongside `me`/`isOwner`:
const deletePost = useDeletePost()
const navigate = useNavigate()

// inside the isOwner block:
{
  isOwner && (
    <>
      <Link to={`/blog/${post.slug}/edit`} className="text-sm underline">
        Edit
      </Link>
      <Button
        variant="destructive"
        size="sm"
        onClick={() =>
          deletePost.mutate(post.slug, {
            onSuccess: () => navigate('/'),
            onError: () => toast.error('Could not delete the post.'),
          })
        }
      >
        Delete
      </Button>
    </>
  )
}
```

- [ ] **Step 3: Gate and commit**

Run: `npm run typecheck && npm run lint && npm run build`

```bash
git add apps/client/src/hooks/use-posts.ts apps/client/src/pages/PostPage.tsx
git commit -m "feat(client): delete post — invalidate rather than optimistically remove"
```

---

## Task 10: Likes with optimistic UI

**Files:**
- Create: `apps/client/src/hooks/use-likes.ts`
- Create: `apps/client/src/components/patterns/LikeButton.tsx`
- Modify: `apps/client/src/pages/PostPage.tsx` (use the real `LikeButton`)
- Test: `apps/client/src/hooks/use-likes.test.tsx`

**Interfaces:**
- Consumes: `postsApi.like/unlike` (Task 3)
- Produces: `useLikePost(slug): UseMutationResult` — optimistically increments `likeCount` in the
  `queryKeys.posts.detail(slug)` cache via `onMutate`, rolls back via `onError`'s returned context, and
  reconciles with the server via `onSettled`'s invalidation (spec §9: "the optimistic UI... demonstrates the
  failure path, not just the happy path")

- [ ] **Step 1: Write the failing test for the optimistic update and its rollback**

```tsx
// apps/client/src/hooks/use-likes.test.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useLikePost } from './use-likes.js'
import { queryKeys } from '../lib/query-client.js'
import type { Post } from '../api/posts.js'

const post: Post = {
  id: '1',
  title: 't',
  slug: 's',
  body: 'b',
  premium: false,
  gated: false,
  author: { id: 'u1', username: 'demo' },
  tags: [],
  likeCount: 2,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

function makeWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(queryKeys.posts.detail('s'), post)
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return { client, wrapper }
}

describe('useLikePost', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('increments likeCount immediately, before the request resolves', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {}))) // never resolves
    const { client, wrapper } = makeWrapper()
    const { result } = renderHook(() => useLikePost('s'), { wrapper })
    result.current.mutate()
    await waitFor(() => expect(client.getQueryData<Post>(queryKeys.posts.detail('s'))?.likeCount).toBe(3))
  })

  it('rolls back likeCount if the request fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"error":{"message":"nope"}}', { status: 500 })))
    const { client, wrapper } = makeWrapper()
    const { result } = renderHook(() => useLikePost('s'), { wrapper })
    result.current.mutate()
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(client.getQueryData<Post>(queryKeys.posts.detail('s'))?.likeCount).toBe(2)
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm run test -- apps/client/src/hooks/use-likes.test.tsx`
Expected: FAIL — `./use-likes.js` does not exist.

- [ ] **Step 3: Implement `useLikePost`**

```ts
// apps/client/src/hooks/use-likes.ts
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { postsApi } from '../api/posts.js'
import { queryKeys } from '../lib/query-client.js'
import type { Post } from '../api/posts.js'

export function useLikePost(slug: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => postsApi.like(slug),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: queryKeys.posts.detail(slug) })
      const previous = queryClient.getQueryData<Post>(queryKeys.posts.detail(slug))
      if (previous) {
        queryClient.setQueryData<Post>(queryKeys.posts.detail(slug), {
          ...previous,
          likeCount: previous.likeCount + 1,
        })
      }
      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(queryKeys.posts.detail(slug), context.previous)
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.posts.detail(slug) }),
  })
}
```

- [ ] **Step 4: Run it and confirm it passes**

Run: `npm run test -- apps/client/src/hooks/use-likes.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Implement `LikeButton` and wire it into `PostPage`**

```tsx
// apps/client/src/components/patterns/LikeButton.tsx
import { Heart } from 'lucide-react'
import { useLikePost } from '../../hooks/use-likes.js'
import { Button } from '../ui/button.js'

export function LikeButton({ slug, likeCount }: { slug: string; likeCount: number }) {
  const like = useLikePost(slug)
  return (
    <Button variant="outline" size="sm" onClick={() => like.mutate()} disabled={like.isPending}>
      <Heart className="mr-1 size-4" /> {likeCount}
    </Button>
  )
}
```

In `PostPage.tsx`, drop the `liked={false}` prop from Task 7's `LikeButton` usage (it was a placeholder for
a prop this component never ends up needing — `PostDto` has no per-viewer "did I like this" field yet, so
the button always shows the current count and lets the mutation run; a future phase can add a `likedByMe`
flag to `PostDto` if that UX is wanted).

- [ ] **Step 6: Gate and commit**

Run: `npm run typecheck && npm run lint && npm run build && npm run test`

```bash
git add apps/client/src/hooks/use-likes.ts apps/client/src/hooks/use-likes.test.tsx apps/client/src/components/patterns/LikeButton.tsx apps/client/src/pages/PostPage.tsx
git commit -m "feat(client): likes with optimistic UI and rollback on failure"
```

---

## Task 11: Docker/Compose — client dev container + prod build baked into the API image

**Files:**
- Modify: `apps/api/Dockerfile` (`builder`/`runner` stages)
- Modify: `compose.yaml` (new `client` service)
- Modify: `compose.e2e.yaml`, `render.yaml` (`CLIENT_DIST`)

**Interfaces:**
- Consumes: `apps/client`'s build output (Task 1)
- Produces: `docker compose watch` now serves the client on `:5173` proxying to `api`; the `runner` image
  serves the built SPA from `apps/api` alone, no separate client container in prod (spec §11)

- [ ] **Step 1: Update `apps/api/Dockerfile`'s `deps`/`builder`/`runner` stages**

The `deps` stage's `COPY package.json` lines need the client's manifest too, so `npm ci` installs it; the
`builder` stage needs to build the client as well as the API; `runner` needs the client's `dist` alongside
the API's, at the path `CLIENT_DIST` will point to.

```dockerfile
# apps/api/Dockerfile — diff against the existing file

# In the `deps` stage, add the client manifest next to the existing COPY lines:
COPY apps/client/package.json ./apps/client/

# In the `builder` stage, build both workspaces (was: only @blog/api):
RUN npm run build --workspace=@blog/api --workspace=@blog/client

# In the `prod-deps` stage, also add:
COPY apps/client/package.json ./apps/client/

# In the `runner` stage, after the existing api dist COPY, add:
COPY --from=builder --chown=api:nodejs /app/apps/client/dist ./apps/client/dist
# CLIENT_DIST is relative to the WORKDIR (/app), matching this path.
ENV CLIENT_DIST=apps/client/dist
```

- [ ] **Step 2: Add the `client` dev service to `compose.yaml`**

```yaml
# compose.yaml — add alongside the existing `api` service
  client:
    build:
      context: .
      dockerfile: apps/client/Dockerfile.dev
    ports: ['5173:5173']
    environment:
      VITE_API_PROXY_TARGET: http://api:3000
    depends_on: [api]
    develop:
      watch:
        - action: sync
          path: ./apps/client
          target: /app/apps/client
          ignore: [node_modules/, dist/]
```

```dockerfile
# apps/client/Dockerfile.dev — a minimal dev-only image (no multi-stage prod
# target here; the prod bundle is built as part of apps/api's Dockerfile instead)
# syntax=docker/dockerfile:1
FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/client/package.json ./apps/client/
RUN --mount=type=secret,id=extra-ca,target=/tmp/extra-ca.pem \
    --mount=type=cache,target=/root/.npm \
    if [ -s /tmp/extra-ca.pem ]; then export NODE_EXTRA_CA_CERTS=/tmp/extra-ca.pem; fi \
    && npm ci
COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev", "--workspace=@blog/client", "--", "--host"]
```

`--host` is required so Vite listens on `0.0.0.0` inside the container — without it, `localhost:5173` from
the host machine can't reach the dev server bound only to the container's loopback interface.

- [ ] **Step 3: Point `compose.e2e.yaml`'s `api` service at the built client**

```yaml
# compose.e2e.yaml — add to the api service's `environment:` block
      CLIENT_DIST: apps/client/dist
```

(This is already the `ENV` default baked into the `runner` image from Step 1 — setting it explicitly here
too is redundant but harmless; keep it for clarity/consistency with how every other env var in this file is
explicit rather than relying on an image default.)

- [ ] **Step 4: Add `CLIENT_DIST` to `render.yaml`**

```yaml
# render.yaml — api service's envVars, alongside the existing entries
      - key: CLIENT_DIST
        value: apps/client/dist
```

- [ ] **Step 5: Verify the dev stack**

Run: `docker compose up -d --build`
Then: open `http://localhost:5173` — confirm the blog feed loads (proxied through to the `api` container).

Run: `docker compose -f compose.e2e.yaml up --build -d --wait`
Then: `curl -s localhost:3000/` — expect the built `index.html`, not a 404 (proves the SPA catch-all now has
a real build to serve, not just the P1 fixture).
Tear down: `docker compose down -v` / `docker compose -f compose.e2e.yaml down -v`

- [ ] **Step 6: Commit**

```bash
git add apps/api/Dockerfile apps/client/Dockerfile.dev compose.yaml compose.e2e.yaml render.yaml
git commit -m "build: bake the client build into the api image; add a client dev container"
```

---

## Task 12: Playwright E2E

**Files:**
- Create: `playwright.config.ts`, `e2e/auth-and-posts.spec.ts`, `e2e/gating.spec.ts`
- Modify: root `package.json` (`@playwright/test` devDependency)
- Modify: CI workflow(s) — the e2e-smoke job already runs `compose.e2e.yaml`; add a Playwright step after
  the health check

**Interfaces:**
- Consumes: `compose.e2e.yaml`'s stack (Task 11), the seeded demo account (`apps/api/src/scripts/seed.ts`,
  P1 Task 13)

- [ ] **Step 1: Add the dependency and config**

```bash
npm install -D @playwright/test --workspace=false
```

(installed at the root, since `test:e2e` is already a root script)

```ts
// playwright.config.ts
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  use: { baseURL: 'http://localhost:3000' },
  webServer: {
    command: 'docker compose -f compose.e2e.yaml up --build --wait',
    url: 'http://localhost:3000/api/v1/health',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
```

- [ ] **Step 2: Write the signup → post → like → logout flow**

```ts
// e2e/auth-and-posts.spec.ts
import { expect, test } from '@playwright/test'

test('signup, create a post, like it, then log out', async ({ page }) => {
  const username = `e2e-${Date.now()}`

  await page.goto('/signup')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Email').fill(`${username}@example.com`)
  await page.getByLabel('Password').fill('a-valid-password')
  await page.getByRole('button', { name: 'Sign up' }).click()
  await expect(page).toHaveURL('/')

  await page.getByText('New post').click()
  await page.getByLabel('title').fill('An E2E post')
  await page.getByLabel('body').fill('Written by Playwright.')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page).toHaveURL(/\/blog\/an-e2e-post/)

  await page.getByRole('button', { name: /^0/ }).click() // the like button, starts at 0
  await expect(page.getByRole('button', { name: /^1/ })).toBeVisible()

  await page.getByRole('button', { name: 'Log out' }).click()
  await expect(page.getByText('Log in')).toBeVisible()
})
```

- [ ] **Step 3: Write the gating test — assert on raw response bytes, not the DOM**

This is the same assertion P1's `posts.test.ts` makes over Supertest, repeated here at the browser/network
level per spec §10 ("asserting on raw response bytes, not the DOM").

```ts
// e2e/gating.spec.ts
import { expect, test } from '@playwright/test'

test('an anonymous reader never receives a premium post\'s full body over the wire', async ({ page, request }) => {
  // Seeded by apps/api/src/scripts/seed.ts — a known premium post slug.
  const res = await request.get('/api/v1/posts/gating-content-at-the-serialization-boundary')
  const body = await res.json()
  expect(body.gated).toBe(true)
  expect(body.body).not.toContain('the full paragraph that only a signed-in reader should see')

  await page.goto('/blog/gating-content-at-the-serialization-boundary')
  await expect(page.getByText('Sign in to read the rest of this post.')).toBeVisible()
})
```

> **Depends on seed data:** this test assumes the seeded premium post's non-teaser paragraph contains the
> literal string asserted against. Check `apps/api/src/scripts/seed.ts`'s actual post body when implementing
> this step and adjust the string to match — do not invent a slug or sentence that doesn't exist in the seed.

- [ ] **Step 4: Run locally and confirm both pass**

Run: `npm run test:e2e`
Expected: 2 passed. Playwright's `webServer` config brings the e2e Compose stack up automatically.

- [ ] **Step 5: Add the Playwright step to CI**

In `.github/workflows/pr-to-staging.yml` (P1 Task 14), after the existing e2e-smoke health-check step, add:

```yaml
      - name: Playwright E2E
        run: npx playwright install --with-deps chromium && npm run test:e2e
```

- [ ] **Step 6: Commit**

```bash
git add playwright.config.ts e2e package.json package-lock.json .github/workflows/pr-to-staging.yml
git commit -m "test(e2e): Playwright coverage for auth+posts+likes and the gating boundary"
```

---

## Task 13: Final gate and docs

**Files:**
- Modify: `README.md` (client quick start, replacing the "no UI yet" note from P1)
- Modify: `docs/architecture/deployment-architecture.md` (client row: 📋 → 🚧/✅ as appropriate)
- Modify: spec §14 (tick the P2-scoped items that now have coverage)

**Interfaces:**
- Consumes: everything above
- Produces: a P2 that is complete, tested, and ready for review

- [ ] **Step 1: Update the README**

Replace the P1-era "There is no UI yet — that is P2" line with a quick-start note that `npm run dev` now
also serves the client on `:5173`, and drop the curl-only demo section down to "the API, if you want to
bypass the UI" framing rather than the primary path.

- [ ] **Step 2: Update `docs/architecture/deployment-architecture.md`**

`apps/client` row: `📋 planned` → `🚧 built, baked into the apps/api image` (not a separate Render service —
this was always the design, spec §11). Update "Last verified against reality" to the date this lands.

- [ ] **Step 3: Tick the P2-scoped spec §14 items**

From the list P1 left as **P2 (client)**:
- A failed delete does not remove the post from the UI → `use-posts.ts`'s `useDeletePost` (Task 9,
  invalidate-not-optimistic)
- The loading state actually renders → `BlogFeedPage`'s `isPending` branch (Task 6) / `PostPage`'s (Task 7)
- Logout is not fired before a dependent request resolves → N/A in this design (logout has no dependent
  request racing it); note this explicitly rather than force-fitting a test to a bug shape that doesn't
  exist in the new architecture
- Password confirmation validated before the request → **not built** in this plan (no signup confirm-password
  field was in scope — note as a gap, not silently dropped)

- [ ] **Step 4: Final full gate**

Run: `npm ci && npm run typecheck && npm run lint && npm run build && npm run test && npm run test:e2e`
Expected: all pass, no skips.

- [ ] **Step 5: Commit**

```bash
git add README.md docs/
git commit -m "docs: P2 client quick start, architecture status, spec checklist"
```

- [ ] **Step 6: STOP — do not push, merge, or deploy**

Report to the user: P2 is complete on `dev/react-client`, N commits, full gate green including Playwright.
**Ask** whether to push and open a PR into `staging`. Do not merge to `master` or deploy without explicit
per-time approval, same as every prior phase.

---

## Self-Review Notes

**Spec coverage.** §3 client layout → Tasks 1, 4; §4 component tiers → Tasks 2 (`ui/`), 6/8 (`patterns/`),
4 (`layouts/`), 8 (`AutoForm`); §6 gating → Task 7 (read-only, server already decided); §9 data flow/routes →
Tasks 4, 6–10; §10 testing → Vitest throughout, Playwright in Task 12; §11 environments/proxy → Tasks 1, 11.

**Known gap, stated rather than silently dropped:** password-confirmation-before-request (spec §14, a P2
item) has no corresponding task — the signup form in Task 5 has no confirm-password field. If wanted, it's
a small addition to `SignupPage` plus a Zod `.refine()` on a client-only schema (the API schema doesn't need
a confirm field — it's a UX check, not a security one).

**One deliberate simplification vs. the spec:** `PostDto` has no per-viewer "did I already like this"
field, so `LikeButton` always shows the raw count and lets the mutation fire regardless of prior state. The
API's like/unlike are idempotent either way, so this cannot corrupt the count — it just means a user could
click "like" on a post they already liked and get a no-op 200 rather than a disabled button. Documented here
so it reads as a choice, not an oversight, if a reviewer asks "where's the liked-by-me indicator."

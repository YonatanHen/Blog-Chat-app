# Blog-Chat App — Express + React Rebuild Design

**Date:** 2026-07-16
**Status:** Approved
**Author:** Yonatan Hen

**Supersedes:** the 2026-07-12 Next.js renewal design, withdrawn and deleted (see §2 for why). It remains in
git history — `git show staging:docs/superpowers/specs/2026-07-12-blog-chat-renewal-design.md` — and every
decision worth keeping has been migrated into this document rather than left behind a reference.

---

## 1. Context & Goal

The existing app is a ~5-year-old MERN SPA (Create React App + Express + Mongoose + Socket.io) with JWT
auth, post CRUD, likes, a client-side search filter, and an ephemeral chat. It is being rebuilt as a
**portfolio piece targeting fullstack and backend roles**.

A review of the existing code found five critical authorization vulnerabilities, several functional bugs,
and a uniformly end-of-life stack. Rather than patch it, we rebuild on a modern React + Express stack while
preserving the project's identity: a MERN blog with real-time chat.

### Success criteria

- A deployed, seeded, publicly reachable demo with a one-click demo account.
- No authorization holes. Every vulnerability from the review has a regression test (§14).
- A REST API a backend interviewer can read, drive with curl, and respect: versioned, layered, validated,
  integration-tested.
- Modern, deliberate visual design that does not read as "bootcamp project".
- A codebase a prospective employer would be happy to inherit: typed, tested, layered, documented.

### Non-goals

- Migrating existing data. **The current Atlas cluster will be wiped and reseeded from scratch.**
- Supporting real user load. This is a demo and must run entirely on free tiers.
- **SEO and social preview cards.** Explicitly dropped (§2, §6). The SPA serves an empty shell to crawlers
  and that is accepted.

---

## 2. Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Backend | **Express + TypeScript** | The target roles are fullstack/backend. An explicit REST API is the artifact those interviews are about. |
| Frontend | **React + Vite** | Current standard SPA tooling. CRA is deprecated and unmaintained as of 2025. |
| Routing (client) | **React Router** | De facto standard outside a meta-framework; minimal API surface. |
| Server state | **TanStack Query** | Caching, refetch, loading/error states, optimistic updates. Pairs naturally with REST. |
| Language | **TypeScript** | Everywhere — API, client, shared package. |
| Database | **MongoDB + Mongoose 8** | Keeps the "MERN" identity, limits simultaneous learning curves. |
| Type safety | **Zod** | Compensates for Mongoose's weak typing. Validates at runtime, infers TS types. One source of truth, shared client↔server. |
| Auth | **`express-session` + `connect-redis`** | httpOnly cookie holding a session ID; data in Redis. Hand-rolled enough to explain in an interview, standard enough to be correct. |
| OAuth providers | **Google, Facebook** via Passport (P6) | No GitHub (explicitly not wanted). |
| Ephemeral store | **Redis** (Render Key Value in prod, container locally) | Session store, chat buffer, rate limiting, presence. See §7. |
| Realtime | **Standalone Socket.io service** (`apps/realtime`) | Its own long-running Render container. |
| Hosting (prod) | **Render** | Long-lived containers. |
| Prod topology | **`apps/api` serves the built SPA + the API from one origin** | No CORS, no cross-origin cookie problem, one web service. See §11. |
| Local / staging / E2E | **Docker Compose + `compose watch`** | Fully containerized, hot reload preserved. Replaces a cloud staging environment. See §11. |
| Styling | **Tailwind + shadcn/ui** | Current default; accessible primitives the user owns. |
| Theme | **Light only. White primary, blue secondary.** | Editorial aesthetic; blue is the accent (actions, links, focus), body text stays near-black. **No dark-mode toggle.** |
| Images | **Cloudinary** | Free forever tier. Replaces the S3 + CloudFront plan. |
| Likes | **Toggle (like / unlike)** | Not up/down voting. Count never goes below zero. |
| Repo | **Monorepo** (npm workspaces) | Services share models, Zod schemas, and ticket verification. |
| Testing | **Vitest (unit) + Supertest (API integration) + Playwright (E2E)** | Regression tests for the authorization bugs; E2E on critical paths. |

### Standing constraints

- **Free-tier services only.** No paid services. Pricing must be verified (not recalled) and presented
  before adopting anything.
- **Never push to `master` or deploy to production without explicit permission, each time.** A described
  workflow is not standing authorization. The user must manually validate that CI passed and staging runs
  as expected before anything is deployed.
- **Baby steps.** Decompose all work into small, independently verifiable increments.
- **One feature, one branch.** Each phase gets its own `dev/<feature>` branch. `dev/*` → `staging` →
  `master`, never `dev/*` → `master`.
- **Parallel agents** for independent tasks.
- **Summarize steps taken** at the end of each work session.
- **Ask before any `aws` CLI command.** The user's AWS account hosts another project. (Now largely moot —
  Cloudinary replaced S3 — but the constraint stands.)

### Why the stack changed (recorded so it is not re-litigated)

The 2026-07-12 design chose Next.js 15 (App Router), and Tasks 1–7 of its P1 plan were built before the
pivot. The reason for the change is **audience, not technology**: this is a portfolio piece for
fullstack/backend positions, and a Next.js app whose "backend" is a directory of Server Actions does not
show the thing those interviews probe — HTTP semantics, an explicit API contract, middleware ordering,
integration testing against real routes.

**What the pivot costs, stated plainly:** the Next.js design called server-side content gating "the clearest
justification for the rebuild," because in a client-rendered SPA the premium body would sit in the JSON
response. That objection is answered in §6 — the gating moves from "Server Component omits the field" to
"the API never serializes the field" — and the security property survives intact. What does **not** survive
is SEO for premium posts, which required server-rendering the full body to crawlers with JSON-LD paywall
markup. **SEO is out of scope entirely** (§1 non-goals), so the JSON-LD paywall design is dropped rather
than ported.

### Corrections carried forward from the previous design

1. **"Next.js can't run Socket.io" was wrong.** The library is fine; *Vercel's serverless model* cannot hold
   a long-lived connection. On Render (a persistent container) Socket.io works normally. Moot now, recorded
   to prevent re-derivation.
2. **Railway's free tier no longer exists.** Proposed in error, withdrawn.
3. **Chat messages do not belong in MongoDB.** They are ephemeral; Redis is the correct tier (§7).
4. **A cloud staging environment is not needed.** Render permits only one free Key Value instance per
   workspace, which would have forced prod and staging to share Redis. Local Docker Compose replaces cloud
   staging entirely and gives better dev/prod parity (§11).
5. **S3 + CloudFront replaced by Cloudinary.** Free forever; removes the shared-AWS-account hazard and the
   OAC/ACM/us-east-1 certificate complexity for a portfolio-scale image workload.

---

## 3. Architecture

```
blog-chat-app/
├── apps/
│   ├── api/                  # Express REST API + serves the built SPA → Render web service
│   ├── client/               # React (Vite) SPA → static bundle, served by apps/api
│   └── realtime/             # Socket.io server → separate Render web service
├── packages/
│   └── shared/               # Mongoose models, Zod schemas, connection caches, errors, ticket verify
├── compose.yaml              # full stack, dev target + `develop.watch` hot reload
├── compose.e2e.yaml          # prod-target images, seeded, for E2E / CI
├── render.yaml               # prod infrastructure as code
└── docs/
```

Two Render services in prod (`api`, `realtime`). Both are permitted to sleep and cold-start (~60 s) — an
accepted trade-off, since 750 free instance-hours/month funds only *one* always-on service.

### `apps/api` layout

```
src/
├── index.ts                  # composition root: build app, attach, listen
├── app.ts                    # express app: middleware order, routers, error handler
├── routes/
│   └── v1/
│       ├── index.ts          # mounts the v1 routers under /api/v1
│       ├── auth.ts           # POST /signup, /login, /logout; GET /me
│       ├── posts.ts          # CRUD + /:slug/likes, /:slug/comments
│       └── users.ts          # GET/PATCH/DELETE /:id
├── middleware/
│   ├── require-auth.ts       # 401 if no session
│   ├── require-owner.ts      # 403 if session identity ≠ resource author
│   ├── validate.ts           # Zod → 400 with field errors
│   └── error-handler.ts      # typed errors → status codes (LAST in the chain)
├── lib/
│   ├── services/             # business logic — the layer the old app lacked
│   ├── session.ts            # express-session + connect-redis wiring
│   ├── redis.ts              # globally cached client (see §7)
│   └── db.ts                 # globally cached Mongoose connection
└── static.ts                 # serves apps/client's build + SPA catch-all (prod only)
```

### `apps/client` layout

```
src/
├── main.tsx                  # React root, QueryClientProvider, RouterProvider
├── routes.tsx                # React Router route table
├── pages/                    # one page component per route
├── components/
│   ├── ui/                   # primitives: Button, Input, Card (shadcn + cva variants)
│   ├── patterns/             # composed: SearchBar, PostCard, EmptyState, PageHeader, AutoForm
│   └── layouts/PageShell.tsx # consistent page chrome
├── api/                      # typed fetch wrappers, one module per resource
└── hooks/                    # useQuery/useMutation hooks per resource
```

### REST API surface

Versioned and prefix-grouped. Every route is `/api/v1/<resource>`; the version prefix exists from day one so
a breaking change has somewhere to go.

| Method | Path | Auth | Notes |
|---|---|---|---|
| `POST` | `/api/v1/auth/signup` | — | Zod-validated; creates session |
| `POST` | `/api/v1/auth/login` | — | Generic failure message (§5) |
| `POST` | `/api/v1/auth/logout` | required | **POST, not GET** — the old app's GET logout was CSRF-able |
| `GET` | `/api/v1/auth/me` | — | Current session user, or 401 |
| `GET` | `/api/v1/posts` | — | Feed. Teaser bodies only |
| `POST` | `/api/v1/posts` | required | |
| `GET` | `/api/v1/posts/:slug` | — | Gated per §6 |
| `PATCH` | `/api/v1/posts/:slug` | owner | |
| `DELETE` | `/api/v1/posts/:slug` | owner | |
| `PUT` | `/api/v1/posts/:slug/likes` | required | Idempotent like |
| `DELETE` | `/api/v1/posts/:slug/likes` | required | Idempotent unlike |
| `GET`/`POST` | `/api/v1/posts/:slug/comments` | — / required | P3 |
| `GET` | `/api/v1/users/:id` | — | Public profile |
| `PATCH`/`DELETE` | `/api/v1/users/:id` | owner | Fixes the account-takeover hole |

**Like is `PUT`/`DELETE`, not `POST /toggle`** — a toggle is not idempotent, and the whole point of the
`Like` collection's unique index is that repeating the operation cannot corrupt the count.

### Middleware order (a real bug in the legacy app)

The old `app.js:19` registered `cors()` *after* the routers, so it never applied. Order is load-bearing and
is asserted by an integration test:

```
helmet → json body parser → session → routers → 404 handler → error handler
```

No CORS middleware in production — the SPA is same-origin (§11). In dev, Vite's proxy makes it same-origin
too, so CORS is never needed anywhere; that is a *consequence* of the topology choice, not an oversight.

### Migration map

| Old | New |
|---|---|
| `server/routers/post.js`, `user.js` | `apps/api/src/routes/v1/*` (thin) + `apps/api/src/lib/services/*` (logic) |
| `server/middleware/authenticate.js` | `apps/api/src/middleware/require-auth.ts` + `require-owner.ts` |
| `src/store/` (Redux, thunks, reducers) | **Deleted** — TanStack Query owns server state |
| `src/app.jsx` (`<Route>` config) | `apps/client/src/routes.tsx` |
| `src/functions/checkLogin.js` | **Deleted** (dead code; never worked) |
| `server/app.js` Socket.io block | `apps/realtime/` |
| `src/css/*.css` | Tailwind |
| `Dockerfile` (broken) | Per-app multi-stage Dockerfiles + Compose (§11) |

### Hazards to handle explicitly

1. **Mongoose and Redis connections must be globally cached.** Dev tooling reloads modules; a naive
   `mongoose.connect()` or `new Redis()` opens a new connection per file save until the pool is exhausted
   (Render's free Key Value allows **50 connections**). Cache the connection promise on `globalThis`.
2. **The SPA catch-all must not shadow the API.** `app.get('*')` returning `index.html` is registered
   **after** the API routers and excludes `/api/*`; otherwise every unmatched API call returns HTML and
   debugging becomes miserable.
3. **`trust proxy` must be set on Render.** Without it Express sees the proxy's IP, `Secure` cookies are
   dropped, and rate limiting keys every request to the same address.

---

## 4. UI Consistency ("factories", done the React way)

**Goal:** consistent objects across the app — one search bar, one card, one page frame — never rebuilt ad hoc.

**Explicit non-approach:** a literal factory function returning components. React identifies a component by
its *function reference*; a factory producing a new function per call creates a new component type on every
render, so React unmounts and remounts the subtree — losing state, focus, and scroll position. It fights the
framework.

**The mechanisms we use instead:**

- **`components/ui/*`** — primitives built on shadcn with **`cva` (class-variance-authority)**. `cva` *is* the
  variant factory: `Button` declares its `variant`/`size` options once, so no button can be styled ad hoc.
- **`components/patterns/*`** — composed, app-level components (`SearchBar`, `PostCard`, `EmptyState`,
  `PageHeader`). Defined once, imported everywhere.
- **`components/layouts/PageShell.tsx`** — the page factory: every page composes it, so title placement,
  container width, and spacing cannot drift between routes.
- **`AutoForm`** — a **schema-driven form generator**: `<AutoForm schema={CreatePostSchema} />` renders
  consistent, validated fields directly from a Zod schema — the same schema the API validates against. A
  legitimate factory, and it makes a form field structurally incapable of disagreeing with its validation.

**One component per file.** If a component must be shared across `apps/client` and a future app, its
prop-driven base belongs in a shared location and the per-app version wraps it — never fork the
implementation per app.

---

## 5. Auth & Authorization

**Sessions:** `express-session` with `connect-redis`. Login sets a signed, **httpOnly + Secure +
SameSite=Lax** cookie containing only an opaque session ID; the session record lives in Redis. JavaScript
cannot read an httpOnly cookie, which removes the XSS token-theft exposure of the old `localStorage` JWT.

**CSRF:** `SameSite=Lax` blocks cross-site cookie attachment on state-changing requests, and the SPA is
same-origin with the API (§11), so no CSRF token library is needed. This is only true because of the
single-origin topology — if the client is ever split to a second origin, CSRF tokens become mandatory. That
dependency is recorded here deliberately.

**Three enforcement layers:**

1. **`requireAuth` middleware** — mounted on protected routers; 401 for anonymous requests.
2. **`requireOwner(loadResource)` middleware — the ownership boundary.**
   ```ts
   export const requireOwner = (load: (req: Request) => Promise<{ author: Types.ObjectId }>) =>
     async (req, res, next) => {
       const resource = await load(req)
       if (!resource) return next(new NotFoundError())
       if (!resource.author.equals(req.session.userId)) return next(new ForbiddenError())
       next()
     }
   ```
   Identity is **always** `req.session.userId`, **never** a body field. This closes all five vulnerabilities
   from the review: account takeover via `/update-user`, deleting other users, deleting others' posts,
   editing others' posts, and liking as another user.
3. **Database constraints** — the unique `(user, post)` index on `Like` means even a handler-layer bug cannot
   produce a double-like.

Unlike the withdrawn Next.js design, there is no "middleware is only UX" caveat: there is no second entry
path that bypasses the middleware chain, because there are no Server Actions. Every request reaches a
handler through the same ordered chain.

**Passwords:** bcrypt cost **12** (was 8); minimum 8 characters; validated by the same Zod schema on client
and server. Login failure returns a single generic "Invalid username or password" — the old app leaked
username existence via `Unable to find user: <name>`. `verifyCredentials` returns `null` identically for
"no such user" and "wrong password".

**Rate limiting** on login/signup, backed by Redis (§7), from P6.

### Socket authentication across origins

`apps/realtime` is a separate Render service, so it has a different origin (`*.onrender.com`). **Render
subdomains are on the Public Suffix List, so a cookie cannot be set on the shared parent domain** — the API's
session cookie will never reach the realtime service. Cookie-based socket auth is therefore not an option.

**Solution — short-lived signed handshake ticket:**

1. The client calls `POST /api/v1/auth/socket-ticket`; the API verifies the session and mints a
   **~60-second JWT** containing `{ userId, username }`, signed with a secret shared by both services.
2. The client passes the ticket in the Socket.io handshake (`io(url, { auth: { ticket } })`).
3. The realtime service verifies the signature and expiry using the shared verifier in `packages/shared`,
   then attaches the identity to the socket.

The realtime service **never trusts a username sent from the client**. The old app echoed `message.user`
straight from the client payload, so anyone could speak as anyone.

---

## 6. Content Gating (the "Medium mechanism")

Posts carry a `premium: boolean` flag.

| | Free post | Premium (anonymous) | Premium (logged in) |
|---|---|---|---|
| Title, author, tags, cover, like count | ✅ | ✅ | ✅ |
| Body | ✅ full | ⚠️ **teaser only** (first ~2 paragraphs) | ✅ full |
| Comments | ✅ | ❌ | ✅ |
| Chat | — | ❌ | ✅ |
| Like / comment / post | login required | ❌ | ✅ |

**Enforcement lives in the service layer, not the UI.** `postService.getPost(slug, session)` returns an
object that **does not contain** the full `body` when the post is premium and the session is null:

```ts
// premium && !session  →  { ...post, body: teaser, gated: true }
// the full body is never serialized into the response
```

The React component renders whatever it is handed; when `gated` is true it shows the teaser and a "Sign in to
read" prompt. There is no full body in the JSON to open in DevTools, because the API never put it there.

> **On the SPA objection.** The previous design argued this feature is "impossible to implement securely" in
> a client-rendered SPA, because `GET /posts` returns every body. That is an argument against a *naive* API,
> not against APIs. The vulnerability was never the SPA — it was gating in the component instead of at the
> serialization boundary. Keeping the rule in the service layer answers it completely. The E2E assertion is
> unchanged and still the real test: **the gated bytes are absent from the raw response**, not merely hidden
> in the DOM.

**No SEO exception.** The withdrawn design served full premium bodies to crawlers with JSON-LD
`isAccessibleForFree: false` markup. SEO is a non-goal (§1), so that mechanism is dropped — along with its
accepted trade-off that a spoofed Googlebot user-agent could read premium content. **The new design has no
such bypass**, which makes the gating strictly stronger than the design it replaces.

---

## 7. Redis

**Prod:** Render Key Value, free plan — **25 MB, 50 connections, _no persistence_**. Data is lost on restart,
and Render may restart the instance during maintenance at any time.
**Local / E2E:** a `redis:7-alpine` container in Compose.

| Use | Structure | Notes |
|---|---|---|
| **Sessions** | `connect-redis` keys with TTL | See the persistence note below. |
| **Recent chat messages** | Capped list: `LPUSH` + `LTRIM` to last ~50, with TTL | Opening the chat shows recent context instead of an empty box. |
| **Rate limiting** | Counter + TTL per IP/user | Losing counters on restart is harmless. |
| **Presence** ("who's online") | `SET` with heartbeat TTLs | Inherently ephemeral by nature. |

**On "no persistence" now that sessions live here:** a Redis restart logs every user out. For a demo whose
services already cold-start after 15 minutes idle, this is acceptable and is *not* worth a paid tier or a
Mongo-backed session store. It is a deliberate trade, recorded so it is not mistaken for an oversight.

**Chat messages are NOT stored in MongoDB.** There is no `Message` model. The chat is a live room, not an
archive, and Redis is the semantically correct tier.

**Socket.io Redis adapter is _not_ used** — each service runs a single instance, so it would be unnecessary
machinery. It is the correct answer to "how would you scale this?" and is documented as such in the README
rather than built prematurely.

**Deployment:** Key Value is a **managed addon**, not a container we build. It is declared in `render.yaml` as
`type: keyvalue`, and Render injects its internal connection string into both services via `fromService`.
Constraints:

- **All three (api, realtime, keyvalue) must be pinned to the same region** — the internal URL is only
  reachable from services in that region.
- **`ipAllowList: []`** (empty) → no public access. Internal connections ride the private network and are
  *unauthenticated by default*, so exposing it publicly would be genuinely dangerous.
- Consequently **it is unreachable from a laptop.** Local development uses the Compose Redis container.
- **`maxmemoryPolicy: allkeys-lru`** guards against OOM in 25 MB. Our data volume will not approach it.
  (Note: with sessions in Redis, LRU eviction can log a user out early. At demo scale this will not trigger.)
- Only **one free Key Value instance per workspace** is permitted — which is why staging is local (§11).

---

## 8. Data Model

All models live in `packages/shared`, each paired with a Zod schema. TypeScript types are **inferred** from the
Zod schemas (`z.infer<typeof X>`), so validation and types cannot disagree. Models use explicit `Model<T>`
typing (`mongoose.models.X as Model<T> ?? mongoose.model<T>(...)`) — the untyped union return breaks
`.create()`'s overload resolution otherwise.

### User
```ts
{
  username:  string      // UNIQUE INDEX (the old schema had no unique constraint — a race condition)
  email:     string      // UNIQUE INDEX, Zod-validated
  password?: string      // OPTIONAL — OAuth users have none
  image?:    string      // Cloudinary public ID
  bio?:      string
  createdAt, updatedAt
}
```
No `Account`/`Session` collections — sessions live in Redis (§7), not Mongo. The hand-rolled `tokens: []`
array is removed (it grew unboundedly; logout wiped every device). The `virtual('tasks')` referencing a
nonexistent `Task` model — a five-year-old leftover from a to-do tutorial — is removed.

### Post
```ts
{
  title:       string
  slug:        string    // UNIQUE — enables /blog/:slug
  body:        string    // Markdown
  premium:     boolean   // default false — gated posts (§6)
  coverImage?: string    // Cloudinary public ID
  author:      ObjectId → User
  tags:        string[]  // indexed
  createdAt, updatedAt
}
```
Changes from the old schema:
- **`authorName` removed.** The denormalized copy went stale whenever a user renamed. We `populate('author')`.
- **`likes: Number` and embedded `likedBy: []` removed.** The count could drift from the array, and the array
  grew unboundedly inside a 16 MB document. Replaced by the `Like` collection.
- **No stored `excerpt`.** The teaser is derived server-side from `body` (first ~2 paragraphs), so there is a
  single source of truth.

### Like *(new collection — replaces the hand-rolled embedded array)*
```ts
{ user: ObjectId, post: ObjectId, createdAt }
// COMPOUND UNIQUE INDEX (user, post)
```
**Semantics: a toggle, exposed as idempotent `PUT`/`DELETE`.** Creating the document is a like; deleting it is
an unlike. There are no dislikes and the count cannot go below zero. Counts are derived via `countDocuments`,
so they can never disagree with reality.

The unique index makes double-liking impossible at the database level. The old toggle did read-then-write with
no protection: two fast clicks could both read "not liked" and both push.

### Comment *(new — the schema field that was defined but never used)*
```ts
{ body: string, author: ObjectId → User, post: ObjectId → Post,
  parent?: ObjectId → Comment,   // self-ref → threading
  createdAt, updatedAt }
```

*(No `Message` model — see §7.)*

---

## 9. Data Flow & Rendering

The old flow — `useEffect` → `dispatch` → thunk → `fetch` → Express → Mongo → JSON → reducer → store →
`useSelector` → render — collapses to:

```tsx
// apps/client/src/pages/BlogPage.tsx
export function BlogPage() {
  const { data: posts, isPending } = useQuery({ queryKey: ['posts'], queryFn: api.posts.list })
  if (isPending) return <PostFeedSkeleton />
  return <PostFeed posts={posts} />
}
```

**Redux is deleted.** It existed to cache server state on the client — which is exactly TanStack Query's job,
done properly: request deduplication, staleness, background refetch, and cache invalidation that cannot
desync from the server the way a hand-written reducer can.

**API access** goes through typed wrappers in `apps/client/src/api/*`, one module per resource, each sending
`credentials: 'include'` so the session cookie rides along. No component calls `fetch` directly.

**Mutations** use `useMutation` and invalidate the affected query keys on success. This replaces the
`DELETE_POST` reducer case, which had a bug where the post vanished from the UI even when the request failed —
invalidation refetches from the server, so a failed delete leaves the post visibly present, correctly.

**Optimistic UI** is kept for exactly one thing: the like button, via `onMutate` + `onError` rollback. It
demonstrates the failure path, not just the happy path, and replaces the old hand-managed state that could
desync permanently.

**Rendering:** no SSR (§2). Vite builds a static bundle; `apps/api` serves it and returns `index.html` for any
non-`/api` route so client-side routing survives a refresh.

| Route | Notes |
|---|---|
| `/blog` | Feed. Teaser bodies only — the API does not send full bodies to a list endpoint |
| `/blog/:slug` | Post. Gated per §6 |
| `/blog/new`, `/blog/:slug/edit` | Editor. Route guard redirects anonymous users (UX); the API enforces (security) |
| `/chat` | Holds the socket. Pre-loads the Redis buffer over REST, then subscribes |
| `/login`, `/signup` | Form state |

---

## 10. Errors & Testing

**Errors:** typed classes (`UnauthorizedError`, `ForbiddenError`, `NotFoundError`, `ValidationError`) live in
`packages/shared`, are thrown by services, and are translated **once** by `middleware/error-handler.ts` into a
status code and a consistent JSON error shape. Handlers never build error responses ad hoc, and the mapping
lives in exactly one place.

On the client, **every `alert()` is removed**; field errors render inline from Zod's
`error.flatten().fieldErrors` (the same schema that produced the API's 400), and transient feedback uses
`sonner` toasts.

**Vitest (unit)** — `packages/shared` and `apps/api/src/lib/services/*` against `mongodb-memory-server`, no
live database required. Covers Zod schemas, slug generation, teaser derivation, socket-ticket verification,
and the service-layer authorization rules.

**Supertest (API integration)** — the layer that most directly demonstrates backend competence, and where the
§14 regression checklist is enforced against **real routes through the real middleware chain**:
- a non-owner gets 403 on `DELETE /api/v1/posts/:slug`
- an anonymous request gets 401, not a redirect
- `GET /api/v1/posts/:slug` for a premium post as an anonymous user contains no full body
- logout is `POST`-only; `GET /api/v1/auth/logout` is 404
- middleware order is correct (a malformed body reaches the error handler, not a router)

**Playwright (E2E), against the Compose stack:** signup → login → create post → comment → like → logout; the
gating rule end-to-end (asserting on raw response bytes, not the DOM); a chat round-trip across two browser
contexts.

---

## 11. Environments

There is **no cloud staging environment.** Staging is a local Docker Compose stack — better dev/prod parity than
a cloud staging tier, costs nothing, and sidesteps Render's one-free-Redis limit.

| | Local dev (`compose watch`) | E2E / CI | Production |
|---|---|---|---|
| API | Container, dev target, hot reload | Container, prod target | Render web service |
| Client | Vite dev server in the container, proxying `/api` → api | Built into the api image | Static bundle served by the api service |
| Realtime | Container, dev target, hot reload | Container, prod target | Render web service |
| Mongo | Container + **named volume**, port bound to `127.0.0.1` | Container (ephemeral, seeded) | Atlas M0 |
| Redis | Container, port bound to `127.0.0.1` | Container | Render Key Value |
| Images | Cloudinary dev folder | mocked | Cloudinary prod folder |

**Same-origin in every environment.** In prod, `apps/api` serves the built SPA — one origin, so the session
cookie just works and CORS never enters the picture. In dev, Vite's `server.proxy` forwards `/api` to the
Express container, which reproduces the same-origin behavior without a build step. This is the single most
important consequence of the topology decision: **the auth model is identical in dev, CI, and prod**, so a
cookie bug cannot hide until deploy.

**Container ports bind to `127.0.0.1`, never `0.0.0.0`.** Mongo and Redis run without authentication locally;
publishing them on all interfaces exposes an unauthenticated database to the LAN.

**`compose.yaml`** — the full stack, all containerized, with **`develop.watch`** for hot reload.
`docker compose watch` is the dev command.

**Why Compose Watch rather than bind mounts** (this matters on Windows): a bind-mounted `node_modules` breaks
across the Windows→Linux boundary because native binaries are compiled for the wrong platform, and inotify
file-watching over a bind mount is unreliable on Windows. Compose Watch **copies** changed files into the
container instead, so both problems disappear. `node_modules` stays inside the image, installed for Linux.

**TLS-intercepting antivirus (this machine):** Avast's Web/Mail Shield MITMs container TLS, breaking `npm ci`
and even `apk` inside the build. The Dockerfiles accept an optional `extra-ca` BuildKit secret supplied by a
gitignored `compose.override.yaml`; the secret is absent in CI and on Render, where the mount is a no-op.
**Never bake a CA certificate into an image or commit one.**

**`compose.e2e.yaml`** — the full stack built from **prod-target** images, health-checked and seeded.
Playwright runs against it locally *and* in CI, so the production build is proven before Render ever sees it.

**CI (GitHub Actions, free for public repos):** triggered `on: pull_request` **only** — a raw commit to a
feature branch never runs CI. Stages: typecheck → lint → Vitest → Supertest → `docker compose -f
compose.e2e.yaml up --wait` → seed → Playwright → build. Production deploy is gated behind a GitHub
Environment (`production`) with a required reviewer; it never runs unattended. `permissions: contents: read`
and a `concurrency` group (cancel superseded runs) are set at the workflow level.

This also replaces the existing broken `Dockerfile` (a Windows `WORKDIR` inside a Linux image, no build step,
running as root) with per-app multi-stage Dockerfiles that run as a non-root user.

---

## 12. Production Deployment & Cost

**Hard constraint: free tier only.** Figures verified 2026-07-12; re-verify before provisioning.

| Component | Host | Free tier |
|---|---|---|
| `apps/api` (+ the SPA it serves) | Render web service | 750 instance-hours/workspace/month; 100 GB egress |
| `apps/realtime` | Render web service | (shares the same 750-hour pool) |
| Redis | Render Key Value | 25 MB, 50 connections, **no persistence**, **one per workspace** |
| Database | MongoDB Atlas M0 | 512 MB |
| Images | Cloudinary | Free-forever tier; ample for a demo's avatars and cover images |
| CI | GitHub Actions | Free (public repo) |

**Accepted:** free Render services **spin down after 15 minutes idle and cold-start in ~60 s**. Both services
are permitted to sleep. (750 hours funds only *one* always-on service, so keeping both warm is not possible on
the free tier — hence cold starts are accepted rather than worked around.)

**`render.yaml`** declares all three prod resources as infrastructure-as-code. Secrets (`MONGODB_URI`,
`CLOUDINARY_URL`, OAuth credentials) use `sync: false` and are set in the dashboard — never committed, never
hardcoded as a fallback. `SESSION_SECRET` and the socket-ticket secret use `generateValue: true`.

**Never write credentials, tokens, or connection strings into source.** `.env` is gitignored; `.env.example`
documents every variable with no real values. (A 5-year-old MongoDB credential was found leaked in this
repo's git history on 2026-07-16, rotated, and scrubbed with `filter-repo` — this constraint is not
hypothetical.)

**Uploads:** signed direct-to-Cloudinary uploads. An API route verifies the session and returns a short-lived
signature constrained by folder, content-type, and size; the browser uploads **straight to Cloudinary**; a
follow-up request persists the returned **public ID** (not a full URL, so the delivery host can change later
without rewriting documents). Bytes never transit the Render container, preserving its 100 GB egress
allowance.

---

## 13. Phased Delivery

Every phase ends **deployed and demoable**. If work stops after any phase, what exists is still a finished
thing. Each phase is a dedicated branch, decomposed into baby steps, with independent tasks dispatched to
parallel agents.

| Phase | Branch | Deliverable |
|---|---|---|
| **P1** | `dev/express-api-foundation` | Monorepo re-shape, `apps/api` (Express + TS), session auth on Redis, `requireAuth`/`requireOwner`, posts CRUD with correct authorization, Supertest integration suite, Compose dev + e2e, seed script, CI, deployed to Render. **Demoable via curl/Postman — no UI needed.** |
| **P2** | `dev/react-client` | Vite + React + React Router + TanStack Query, Tailwind + shadcn (`ui`/`patterns`/`layouts`), auth pages, blog feed/post/editor, likes with optimistic UI, Playwright E2E, served by `apps/api` in prod. |
| **P3** | `dev/comments-markdown` | Threaded comments, Markdown editor + preview, `AutoForm`, `premium` flag + gating (no JSON-LD — SEO dropped). |
| **P4** | `dev/realtime-chat` | `apps/realtime` Socket.io service, signed handshake tickets, Redis message buffer, presence + typing indicators. |
| **P5** | `dev/media-and-search` | Signed Cloudinary uploads, avatars + cover images, tags, MongoDB full-text search. |
| **P6** | `dev/oauth-polish` | Google + Facebook OAuth via Passport, Redis rate limiting, README + architecture diagram, demo account, final visual polish. |

**Splitting API and client into P1/P2 is deliberate:** P1 alone is a working, tested, deployed REST API — which
is the artifact a backend interview is actually about, and it exists standalone rather than as a byproduct of
shipping a UI.

### Disposition of the Next.js work

Tasks 1–7 of the withdrawn P1 plan were built on `dev/web-app-scaffold`, plus a CI pipeline on
`dev/ci-cd-pipeline` (PR #8). Both are **abandoned unmerged** — retained in git history, not deleted. PR #8
is closed without merging. `master` continues to run the legacy app untouched.

**Carried forward** (mostly by copy, not by merge):
- `packages/shared` — Zod schemas, Mongoose models + the `Model<T>` typing fix, `connectDb` cache, error
  classes. Essentially unchanged; it was always framework-agnostic.
- `userService.signup` / `verifyCredentials` — including the bcrypt-12 and username-enumeration fixes. Only
  the Auth.js `authorize()` wrapper is discarded.
- `requireAuth` / `requireOwner` **logic and tests** — re-homed from `auth()` to `req.session`.
- The Docker multi-stage pattern, Compose Watch config, root `.dockerignore`, and the `extra-ca` secret.
- The CI workflow's shape: `pull_request`-only trigger, per-workspace typecheck fanout, ephemeral staging
  stage, manual-gate prod deploy, `permissions`/`concurrency` hardening.

**Discarded:** Auth.js entirely, `middleware.ts`, the Server Actions model, `next.config.ts`, and the Next.js
scaffold wiring. The `cva`/Tailwind component tiers are re-created in `apps/client` as new files.

---

## 14. Regression Checklist

Every item is a real defect in the current codebase. Each must have a test in the rebuild — for API-layer
items, a Supertest integration test against the real route.

**Security**
- [ ] Non-owner cannot delete a post (`server/routers/post.js:42`)
- [ ] Non-owner cannot edit a post (`server/routers/post.js:34`)
- [ ] User cannot modify another user's account (`server/routers/user.js:73` — **account takeover**)
- [ ] User cannot delete another user's account (`server/routers/user.js:60`)
- [ ] Logout requires authentication **and is POST-only** (`server/routers/user.js:45` — unauthenticated GET)
- [ ] Like requires authentication and uses session identity, not a body field
- [ ] Chat messages use server-derived identity — a client cannot speak as another user
      (old `app.js:56` echoed `message.user` straight from the client payload)
- [ ] Session token is not readable by JavaScript (httpOnly cookie, not `localStorage`)
- [ ] Login does not reveal whether a username exists
- [ ] A premium post's full body is absent from the API response for an anonymous reader (§6)

**Correctness**
- [ ] Socket listeners are cleaned up (old `chat.jsx:51` added a listener per message received)
- [ ] Chat does not emit `disconnect` on every render (`chat.jsx:57`)
- [ ] A failed delete does not remove the post from the UI (`store/actions/posts.js:44`)
- [ ] Password confirmation is validated *before* the request, not after (`updateUser.jsx:58`)
- [ ] Password is not silently reset on every profile update (`user.js:79` compares plaintext to a hash)
- [ ] Double-click cannot double-like (enforced by the DB unique index)
- [ ] Search does not crash on a post with no body (`postsList.jsx:12`)
- [ ] Unique username/email enforced by index, not a racy `findOne` check
- [ ] The loading state actually renders (`blog.jsx:22` set it true and false synchronously)
- [ ] Logout is not fired before the delete request resolves (`navbar.jsx:33` invoked the callback immediately)

**Build correctness**
- [ ] Production build and static serving work (the old `Dockerfile` had a Windows `WORKDIR` in a Linux image,
      and `app.js:21` served `server/build` while CRA builds to `./build`)
- [ ] Middleware order is correct — the old `app.js:19` registered `cors()` *after* the routers, so it never
      applied. The new chain is asserted by an integration test (§3).
- [ ] The SPA catch-all does not shadow `/api/*` (§3)

# Blog-Chat App — Portfolio Renewal Design

**Date:** 2026-07-12
**Status:** Approved
**Author:** Yonatan Hen

---

## 1. Context & Goal

The existing app is a ~5-year-old MERN SPA (Create React App + Express + Mongoose + Socket.io) with JWT
auth, post CRUD, likes, a client-side search filter, and an ephemeral chat. It is being renewed as a
**freelance portfolio piece**.

A review of the existing code found five critical authorization vulnerabilities, several functional bugs,
and a uniformly end-of-life stack. Rather than patch it, we rebuild on Next.js while preserving the
project's identity: a MERN blog with real-time chat.

### Success criteria

- A deployed, seeded, publicly reachable demo with a one-click demo account.
- No authorization holes. Every vulnerability from the review has a regression test (§14).
- Modern, deliberate visual design that does not read as "bootcamp project".
- A codebase a prospective client would be happy to inherit: typed, tested, layered, documented.

### Non-goals

- Migrating existing data. **The current Atlas cluster will be wiped and reseeded from scratch.**
- Supporting real user load. This is a demo and must run entirely on free tiers.

---

## 2. Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Framework | **Next.js 15 (App Router)** | Server Components make content gating genuinely enforceable; SSR fixes SEO. |
| Language | **TypeScript** | Assumed by most freelance listings; Next.js is TS-first. |
| Database | **MongoDB + Mongoose 8** | User's choice — keeps the "MERN" identity, limits simultaneous learning curves. |
| Type safety | **Zod** | Compensates for Mongoose's weak typing. Validates at runtime, infers TS types. One source of truth. |
| Auth | **Auth.js v5** + MongoDB adapter | httpOnly cookie sessions, CSRF, and OAuth for a few lines each. |
| OAuth providers | **Google, Facebook** | No GitHub (explicitly not wanted). |
| Ephemeral store | **Redis** (Render Key Value in prod, container locally) | Chat buffer, rate limiting, presence. See §7. |
| Realtime | **Standalone Socket.io service** | Its own long-running Render container. |
| Hosting (prod) | **Render** | Long-lived containers, unlike Vercel's serverless functions. |
| Local / staging / E2E | **Docker Compose + `compose watch`** | Fully containerized, hot reload preserved. Replaces a cloud staging environment. See §11. |
| Styling | **Tailwind + shadcn/ui** | Current default; accessible primitives the user owns. |
| Theme | **Light only. White primary, blue secondary.** | Editorial aesthetic; blue is the accent (actions, links, focus), body text stays near-black for readability. **No dark-mode toggle.** |
| Images | **S3 (existing bucket) + CloudFront** | User already runs S3. CloudFront free tier is generous; S3→CloudFront transfer is free. |
| Likes | **Toggle (like / unlike)** | Not up/down voting. Count never goes below zero. |
| Repo | **Monorepo** | Two services must share models, Zod schemas, and ticket verification. |
| Testing | **Vitest (unit) + Playwright (E2E)** | Regression tests for the authorization bugs; E2E on critical paths. |

### Standing constraints

- **Free-tier services only.** No paid services. Pricing must be verified (not recalled) and presented
  before adopting anything.
- **Ask before any `aws` CLI command.** The user's AWS account hosts another project. Treat all AWS
  infrastructure as shared: new prefix or new bucket, never a bucket-level policy change.
- **Baby steps.** Decompose all work into small, independently verifiable increments.
- **One feature, one branch.** Each phase gets its own `dev/<feature>` branch.
- **Parallel agents** for independent tasks.
- **Summarize steps taken** at the end of each work session.

### Corrections made during design (recorded so they are not re-litigated)

1. **"Next.js can't run Socket.io" was wrong.** The library is fine; *Vercel's serverless model* cannot hold
   a long-lived connection. On Render (a persistent container) Socket.io works normally.
2. **Railway's free tier no longer exists.** Proposed in error, withdrawn.
3. **Chat messages do not belong in MongoDB.** They are ephemeral; Redis is the correct tier (§7).
4. **A cloud staging environment is not needed.** Render permits only one free Key Value instance per
   workspace, which would have forced prod and staging to share Redis. Local Docker Compose replaces cloud
   staging entirely and gives better dev/prod parity (§11).

---

## 3. Architecture

```
blog-chat-app/
├── apps/
│   ├── web/                  # Next.js 15 → Render web service
│   └── realtime/             # Socket.io server → Render web service
├── packages/
│   └── shared/               # Mongoose models, Zod schemas, socket-ticket verify, inferred TS types
├── compose.yaml              # full stack, dev target + `develop.watch` hot reload
├── compose.e2e.yaml          # prod-target images, seeded, for E2E / CI
├── render.yaml               # prod infrastructure as code
└── docs/
```

Two Render services in prod. Both are permitted to sleep and cold-start (~60 s) — an accepted trade-off,
since 750 free instance-hours/month funds only *one* always-on service.

### `apps/web` layout

```
app/
├── (auth)/login/page.tsx
├── (auth)/signup/page.tsx
├── blog/page.tsx                 # feed
├── blog/[slug]/page.tsx          # post
├── blog/new/page.tsx             # editor
├── chat/page.tsx
├── layout.tsx
├── error.tsx  /  not-found.tsx
└── api/auth/[...nextauth]/route.ts
components/
├── ui/                           # primitives: Button, Input, Card (shadcn + cva variants)
├── patterns/                     # composed: SearchBar, PostCard, EmptyState, PageHeader, AutoForm
└── layouts/PageShell.tsx         # consistent page chrome
lib/
├── actions/                      # Server Actions (replaces the Express routers)
├── services/                     # business logic (the layer the old app lacked)
├── auth.ts                       # Auth.js config
├── auth-guards.ts                # requireAuth / requireOwner
├── redis.ts                      # globally cached client (see §7)
└── db.ts                         # globally cached Mongoose connection
middleware.ts                     # route guards (UX only — see §5)
```

### Migration map

| Old | New |
|---|---|
| `server/routers/post.js`, `user.js` | `lib/actions/*` + `lib/services/*` |
| `server/middleware/authenticate.js` | Auth.js session + `lib/auth-guards.ts` |
| `src/store/` (Redux, thunks, reducers) | **Deleted** — server state lives on the server |
| `src/app.jsx` (`<Route>` config) | **Deleted** — the filesystem is the router |
| `src/functions/checkLogin.js` | **Deleted** (dead code; never worked) |
| `server/app.js` Socket.io block | `apps/realtime/` |
| `src/css/*.css` | Tailwind |
| `Dockerfile` (broken) | Per-app multi-stage Dockerfiles + Compose (§11) |

### Next.js hazards to handle explicitly

1. **Mongoose and Redis connections must be globally cached.** Next.js hot-reloads modules in dev; a naive
   `mongoose.connect()` or `new Redis()` opens a new connection per file save until the pool is exhausted
   (Render's free Key Value allows **50 connections**). Cache the connection promise on `globalThis`.
2. **Server Actions are public HTTP endpoints.** `'use server'` compiles to a POST route anyone can invoke
   with curl. Middleware does **not** protect it. Every action must independently re-authenticate and
   re-authorize (§5).

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
  consistent, validated fields directly from a Zod schema. A legitimate factory, and it makes a form field
  structurally incapable of disagreeing with its validation.

---

## 5. Auth & Authorization

**Sessions:** Auth.js v5, MongoDB adapter, **httpOnly + Secure + SameSite cookies**. JavaScript cannot read an
httpOnly cookie, removing the XSS token-theft exposure of the old `localStorage` approach. Auth.js also
supplies CSRF tokens.

**Three enforcement layers:**

1. **`middleware.ts`** — edge redirect for anonymous users hitting `/chat`, `/blog/new`, `/settings`.
   **This is UX, not security.** It does not protect Server Actions.

2. **Server Action guards — the actual security boundary.**
   ```ts
   export async function requireAuth() {
     const session = await auth()
     if (!session?.user) throw new UnauthorizedError()
     return session
   }
   export async function requireOwner(resource: { author: ObjectId }) {
     const session = await requireAuth()
     if (!resource.author.equals(session.user.id)) throw new ForbiddenError()
     return session
   }
   ```
   Every mutating action begins with one of these. Identity is **always** derived from the session, **never**
   from the request body. This closes all five vulnerabilities from the review: account takeover via
   `/update-user`, deleting other users, deleting others' posts, editing others' posts, and liking as another
   user.

3. **Database constraints** — the unique `(user, post)` index on `Like` means even an action-layer bug cannot
   produce a double-like.

**Passwords:** bcrypt cost **12** (was 8); minimum 8 characters; validated by the same Zod schema on client and
server. Login failure returns a single generic "Invalid username or password" — the old app leaked username
existence via `Unable to find user: <name>`.

**Rate limiting** on login/signup, backed by Redis (§7).

### Socket authentication across origins

The two services have different origins (`*.onrender.com`). **Render subdomains are on the Public Suffix List,
so a cookie cannot be set on the shared parent domain** — the web app's session cookie will never reach the
realtime service. Cookie-based socket auth is therefore not an option.

**Solution — short-lived signed handshake ticket:**

1. The client calls a Server Action; it verifies the session and mints a **~60-second JWT** containing
   `{ userId, username }`, signed with a secret shared by both services.
2. The client passes the ticket in the Socket.io handshake (`io(url, { auth: { ticket } })`).
3. The realtime service verifies the signature and expiry using the shared verifier in `packages/shared`, then
   attaches the identity to the socket.

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

**Enforcement lives in the service layer, not the UI.** `postService.getPost(slug, session)` returns an object
that **does not contain** the full `body` when the post is premium and the session is null. No component can
accidentally render it, and there is no JSON response to crack open in DevTools.

> This is the clearest justification for the rebuild. In the old client-rendered SPA the feature is *impossible
> to implement securely*: `GET /posts` returns every body, so "hiding" it in React leaves the content sitting in
> the network response. With Server Components, the gated bytes never leave the server.

**SEO exception (deliberate):** premium posts serve their full body to crawlers, marked with Google's sanctioned
paywalled-content structured data (JSON-LD `isAccessibleForFree: false` plus a `hasPart` block identifying the
gated section). Without that markup, serving different content to crawlers is **cloaking** and is penalized.

**Accepted trade-off:** because the full body is in the HTML for crawlers, a determined user can read premium
posts by spoofing a Googlebot user-agent. This is equally true of Medium. It is an inherent property of the
pattern, accepted knowingly in exchange for indexability.

---

## 7. Redis

**Prod:** Render Key Value, free plan — **25 MB, 50 connections, _no persistence_**. Data is lost on restart,
and Render may restart the instance during maintenance at any time.
**Local / E2E:** a `redis:7-alpine` container in Compose.

The "no persistence" constraint is acceptable because every use here is inherently ephemeral:

| Use | Structure | Notes |
|---|---|---|
| **Recent chat messages** | Capped list: `LPUSH` + `LTRIM` to last ~50, with TTL | Opening the chat shows recent context instead of an empty box. |
| **Rate limiting** | Counter + TTL per IP/user | Losing counters on restart is harmless. |
| **Presence** ("who's online") | `SET` with heartbeat TTLs | Inherently ephemeral by nature. |

**Chat messages are NOT stored in MongoDB.** There is no `Message` model. The chat is a live room, not an
archive, and Redis is the semantically correct tier.

**Socket.io Redis adapter is _not_ used** — each service runs a single instance, so it would be unnecessary
machinery. It is the correct answer to "how would you scale this?" and is documented as such in the README
rather than built prematurely.

**Deployment:** Key Value is a **managed addon**, not a container we build. It is declared in `render.yaml` as
`type: keyvalue`, and Render injects its internal connection string into both services via `fromService`.
Constraints:

- **All three (web, realtime, keyvalue) must be pinned to the same region** — the internal URL is only reachable
  from services in that region.
- **`ipAllowList: []`** (empty) → no public access. Internal connections ride the private network and are
  *unauthenticated by default*, so exposing it publicly would be genuinely dangerous.
- Consequently **it is unreachable from a laptop.** Local development uses the Compose Redis container.
- **`maxmemoryPolicy: allkeys-lru`** guards against OOM in 25 MB. Our data volume will not approach it.
- Only **one free Key Value instance per workspace** is permitted — which is why staging is local (§11).

---

## 8. Data Model

All models live in `packages/shared`, each paired with a Zod schema. TypeScript types are **inferred** from the
Zod schemas (`z.infer<typeof X>`), so validation and types cannot disagree.

### User
```ts
{
  username:  string      // UNIQUE INDEX (the old schema had no unique constraint — a race condition)
  email:     string      // UNIQUE INDEX, Zod-validated
  password?: string      // OPTIONAL — OAuth users have none
  image?:    string      // S3 object key
  bio?:      string
  createdAt, updatedAt
}
```
Auth.js manages its own `Account` / `Session` collections via the MongoDB adapter. The hand-rolled `tokens: []`
array is removed (it grew unboundedly; logout wiped every device). The `virtual('tasks')` referencing a
nonexistent `Task` model — a five-year-old leftover from a to-do tutorial — is removed.

### Post
```ts
{
  title:       string
  slug:        string    // UNIQUE — enables /blog/[slug]
  body:        string    // Markdown
  premium:     boolean   // default false — gated posts (§6)
  coverImage?: string    // S3 object key
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
**Semantics: a toggle.** Creating the document is a like; deleting it is an unlike. There are no dislikes and the
count cannot go below zero. Counts are derived via `countDocuments`, so they can never disagree with reality.

The unique index makes double-liking impossible at the database level. The old toggle did read-then-write with no
protection: two fast clicks could both read "not liked" and both push.

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
// app/blog/page.tsx — Server Component. Runs on the server. Ships zero JS.
export default async function BlogPage() {
  const session = await auth()
  const posts = await postService.list(session)
  return <PostFeed posts={posts} />
}
```

**Redux is deleted.** It existed to cache server state on the client; the server no longer needs a client-side
cache of its own data.

**Client Components** (`'use client'`), roughly 20% of the tree: `LikeButton` (uses `useOptimistic`),
`CommentForm`, `PostEditor`, `ChatRoom` (holds the socket), mobile nav toggle. Everything else is a Server
Component.

**Mutations** are Server Actions (`<form action={createPost}>`) — no `fetch`, no endpoint, no manual JSON.
`useOptimistic` gives the Like button an instant response that rolls back on server rejection, replacing the old
hand-managed state that could desync permanently.

**Cache invalidation:** `revalidatePath('/blog')` after mutations. Replaces the `DELETE_POST` reducer case, which
had a bug where the post vanished from the UI even when the request failed.

| Route | Strategy |
|---|---|
| `/blog` | Server-rendered, cached, revalidated on mutation |
| `/blog/[slug]` | Server-rendered + `generateStaticParams` (pre-built, instant, SEO-friendly) |
| `/chat` | Client component inside a server shell that pre-loads the Redis buffer |
| `/login`, `/signup` | Client components (form state) |

**SEO:** the old CRA app serves an empty `<div id="root">`. Google's second-wave JS rendering is deferred and
budget-limited, and social preview bots (LinkedIn, Facebook, X, Slack, WhatsApp) do not execute JS *at all* — so
shared links currently produce no preview card. Next.js emits real content plus per-route metadata
(`generateMetadata`), `sitemap.xml`, and JSON-LD.

---

## 10. Errors & Testing

**Errors:** typed classes (`UnauthorizedError`, `ForbiddenError`, `NotFoundError`, `ValidationError`) thrown in
services, caught at the action boundary, returned as `{ ok: false, error }`. `error.tsx` and `not-found.tsx`
handle page-level cases. **Every `alert()` is removed**; field errors render inline from Zod's
`error.flatten().fieldErrors`, and transient feedback uses `sonner` toasts.

**Vitest (unit):**
- Authorization rules — one explicit regression test per vulnerability in §14.
- Gating — *"an anonymous request for a premium post returns no full body"*.
- Zod schemas, slug generation, teaser derivation, socket-ticket verification.
- `mongodb-memory-server` — no live database required.

**Playwright (E2E), against the Compose stack:** signup → login → create post → comment → like → logout; the
gating rule end-to-end; a chat round-trip across two browser contexts.

---

## 11. Environments

There is **no cloud staging environment.** Staging is a local Docker Compose stack — better dev/prod parity than
a cloud staging tier, costs nothing, and sidesteps Render's one-free-Redis limit.

| | Local dev (`compose watch`) | E2E / CI | Production |
|---|---|---|---|
| Web | Container, dev target, hot reload | Container, prod target | Render web service |
| Realtime | Container, dev target, hot reload | Container, prod target | Render web service |
| Mongo | Container + **named volume** | Container (ephemeral, seeded) | Atlas M0 |
| Redis | Container | Container | Render Key Value |
| Images | S3 dev prefix | mocked | S3 prod prefix + CloudFront |

**`compose.yaml`** — the full stack (web, realtime, mongo, redis), all containerized, with **`develop.watch`**
for hot reload. `docker compose watch` is the dev command.

```yaml
develop:
  watch:
    - action: sync              # source edits → copied into the container → Next.js hot reloads
      path: ./apps/web
      target: /app/apps/web
      ignore: [node_modules/]
    - action: sync
      path: ./packages/shared
      target: /app/packages/shared
    - action: rebuild           # dependency changes → rebuild the image
      path: ./package.json
```

**Why Compose Watch rather than bind mounts** (this matters on Windows): a bind-mounted `node_modules` breaks
across the Windows→Linux boundary because native binaries are compiled for the wrong platform, and inotify
file-watching over a bind mount is unreliable on Windows. Compose Watch **copies** changed files into the
container instead, so both problems disappear. `node_modules` stays inside the image, installed for Linux.

**`compose.e2e.yaml`** — the full stack built from **prod-target** images, health-checked and seeded. Playwright
runs against it locally *and* in CI, so the production build is proven before Render ever sees it.

**CI (GitHub Actions, free for public repos):** typecheck → lint → Vitest →
`docker compose -f compose.e2e.yaml up --wait` → seed → Playwright → build. Badge in the README.

This also replaces the existing broken `Dockerfile` (a Windows `WORKDIR` inside a Linux image, no build step,
running as root) with per-app multi-stage Dockerfiles that run as a non-root user.

---

## 12. Production Deployment & Cost

**Hard constraint: free tier only.** Figures verified 2026-07-12; re-verify before provisioning.

| Component | Host | Free tier |
|---|---|---|
| `apps/web` | Render web service | 750 instance-hours/workspace/month; 100 GB egress |
| `apps/realtime` | Render web service | (shares the same 750-hour pool) |
| Redis | Render Key Value | 25 MB, 50 connections, **no persistence**, **one per workspace** |
| Database | MongoDB Atlas M0 | 512 MB |
| Images — storage | S3 (existing bucket, **new prefix**) | ~$0.023/GB-mo; negligible at this scale |
| Images — delivery | CloudFront + OAC | **Always-free: 1 TB/mo egress, 10M requests/mo.** S3→CloudFront origin transfer is **free**, so CloudFront *eliminates* the S3 egress bill. |
| CI | GitHub Actions | Free (public repo) |

**Accepted:** free Render services **spin down after 15 minutes idle and cold-start in ~60 s**. Both services are
permitted to sleep. (750 hours funds only *one* always-on service, so keeping both warm is not possible on the
free tier — hence cold starts are accepted rather than worked around.)

**`render.yaml`** declares all three prod resources as infrastructure-as-code. Secrets (`MONGODB_URI`, OAuth
credentials, AWS keys) use `sync: false` and are set in the dashboard — never committed. `AUTH_SECRET` and the
socket-ticket secret use `generateValue: true`.

**CloudFront setup:** **Origin Access Control (OAC)** with a fully private bucket — CloudFront is the only reader.
The ACM certificate **must be issued in `us-east-1`** regardless of bucket region. DNS via CNAME from any provider
(avoids the $0.50/mo Route 53 hosted zone).

**Uploads:** presigned direct-to-S3 `PUT`. A Server Action verifies the session and returns a short-expiry URL
constrained by content-type and size; the browser uploads **straight to S3**; a second action persists the
returned object **key** (not a full URL, so the bucket or CDN can move later without rewriting documents). Bytes
never transit the Render container, preserving its 100 GB egress allowance.

---

## 13. Phased Delivery

Every phase ends **deployed and demoable**. If work stops after any phase, what exists is still a finished thing.
Each phase is a dedicated branch, decomposed into baby steps, with independent tasks dispatched to parallel
agents.

| Phase | Branch | Deliverable |
|---|---|---|
| **P1** | `dev/nextjs-foundation` | Monorepo, Next.js 15 + TS, Tailwind + shadcn (white/blue), design-system skeleton (`ui`/`patterns`/`layouts`), Mongoose 8 + Zod in `packages/shared`, Auth.js credentials login, posts CRUD with correct authorization, Compose (dev + e2e), seed script, CI, deployed to Render. |
| **P2** | `dev/comments-markdown` | Threaded comments, Markdown editor + preview, `AutoForm`, post timestamps, `premium` flag + gating + paywall JSON-LD. |
| **P3** | `dev/realtime-chat` | `apps/realtime` Socket.io service, signed handshake tickets, Redis message buffer, presence + typing indicators. |
| **P4** | `dev/media-and-search` | Presigned S3 uploads, CloudFront + OAC, `next/image`, avatars + cover images, tags, MongoDB full-text search. |
| **P5** | `dev/oauth-polish` | Google + Facebook OAuth, Redis rate limiting, README + architecture diagram, demo account, final visual polish. |

---

## 14. Regression Checklist

Every item is a real defect in the current codebase. Each must have a test in the rebuild.

**Security**
- [ ] Non-owner cannot delete a post (`server/routers/post.js:42`)
- [ ] Non-owner cannot edit a post (`server/routers/post.js:34`)
- [ ] User cannot modify another user's account (`server/routers/user.js:73` — **account takeover**)
- [ ] User cannot delete another user's account (`server/routers/user.js:60`)
- [ ] Logout requires authentication (`server/routers/user.js:45` — unauthenticated GET)
- [ ] Like requires authentication and uses session identity, not a body field
- [ ] Chat messages use server-derived identity — a client cannot speak as another user
      (old `app.js:56` echoed `message.user` straight from the client payload)
- [ ] Session token is not readable by JavaScript (httpOnly cookie, not `localStorage`)
- [ ] Login does not reveal whether a username exists

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
- [ ] CORS applies to routes (old `app.js:19` registered `cors()` *after* the routers)

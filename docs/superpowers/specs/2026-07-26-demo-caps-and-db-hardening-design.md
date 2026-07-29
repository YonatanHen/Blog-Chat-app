# Demo Caps, Rate Limiting, and Database Hardening — Design

**Date:** 2026-07-26
**Status:** approved, not implemented
**Scope:** the final task before `staging` is promoted to `master`. Nothing here ships mid-phase.

> **Amendment 2026-07-29 — comments are now in scope.** This spec was written on 2026-07-26, when
> `models/comment.ts` existed but no service used it. Threaded comments shipped on 2026-07-28 (PR #32):
> `commentService.create()` is live behind `POST /api/v1/posts/:slug/comments`. The original §2 deferred
> comment caps to "when comments land" — they have landed, so the deferral is now a hole rather than a
> boundary, and comments are the most floodable surface in the app (unbounded and per-post, where users
> and posts are global one-shots). Three sections change: §3 gains a comment cap, §5 gains a comment
> limiter **and a mount-path correction**, and §6 gains a `seed.ts` fix. Details are marked *Amended
> 2026-07-29* in place.
>
> **The §6 fix is not optional bookkeeping.** `seed.ts:51` wipes posts, likes and users but never
> comments, so the weekly reset would leave every comment behind. A comment cap on top of that reset
> would fill once and never free a slot again — precisely the permanent-wall failure §1.3 exists to
> prevent. Capping comments without fixing the reseed is worse than not capping them at all.

> **Amendment 2026-07-29 (second) — the caps become per-owner, and rate limiting is dropped.**
> Decided by the project owner, whose goal is to leave headroom on a shared MongoDB free tier for a
> second portfolio project. Two structural changes:
>
> 1. **Limits are now 20 users globally, 2 posts per user, 10 comments per post** — replacing the
>    earlier global counts (15 / 30 / 200). This **reverses §2's "Not per-user quotas" non-goal**,
>    which is rewritten below rather than left to contradict §3.
> 2. **Rate limiting is removed entirely.** §5 no longer specifies limiters. This is a knowing
>    trade against §1.2 — see the risk recorded in §5 and §12.4, which are not softened.
>
> Worst-case footprint under the new numbers: 20 users → 40 posts → 400 comments, plus at most
> 20 × 40 = 800 likes. Roughly 1,260 documents, trivially small for an M0 cluster shared with
> another project, which is the point of the change.

---

## §1 Motivation

The rebuild is a portfolio piece. Recruiters need to sign up (the content wall is per-reader, so signing up
is what unlocks full post bodies — see the Express/React rebuild design doc), but the deployment is a demo,
not a product. It runs on free-tier infrastructure with no moderation and no support burden budget.

Three consequences follow, and this design addresses all three together because they are inseparable:

1. **Unbounded growth is a liability.** Anyone can create accounts and posts indefinitely on a public
   endpoint. Left open, the demo accumulates spam that a recruiter sees before they see the work.
2. **A cap creates a denial-of-service surface.** Capping at 20 users means 18 scripted requests kill the
   demo for every subsequent visitor. A cap without rate limiting is worse than no cap.
   *(Figures updated 2026-07-29 for the new caps. The claim itself is now **overruled, not withdrawn** —
   rate limiting was dropped in §5, making this the live exposure recorded as risk §12.4.)*
3. **A hard cap eventually kills the demo.** A portfolio runs for months. Without a reset, the wall becomes
   permanent and every recruiter after the 20th sees only a block message.

## §2 Non-goals

- **Not a moderation system.** No content review, no reporting, no admin UI.
- ~~**Not per-user quotas.**~~ *Amended 2026-07-29:* **reversed.** Posts and comments are now per-owner
  allowances (2 per user, 10 per post); only the user cap stays global. Keeping this non-goal alongside
  the new §3 would have left the document contradicting itself.
- ~~**Not comment caps.**~~ *Amended 2026-07-29:* comments landed in PR #32 and are now **in scope** —
  see §3, §5 and §6. The original text is preserved in git history; it read "when comments land, they
  need their own cap," and this amendment is that debt being paid.
- **Not like caps.** Likes are already bounded by the unique `(user, post)` index and by the caps above:
  at most `DEMO_MAX_USERS × (DEMO_MAX_USERS × DEMO_MAX_POSTS_PER_USER)` = 20 × 40 = 800 rows. A third cap
  would guard nothing.
- ~~**Not the full P6 rate-limiting design.**~~ *Amended 2026-07-29:* **no rate limiting at all**, here or
  deferred — see §5. The P6 phase entry in the main design spec still lists "Redis rate limiting"; that
  entry is now the only place the idea survives, and it is optional rather than planned.

---

## §3 Cap enforcement

*Rewritten by the second 2026-07-29 amendment.*

| Limit | Scope | Value |
|---|---|---|
| `DEMO_MAX_USERS` | **global** | 20 |
| `DEMO_MAX_POSTS_PER_USER` | per author | 2 |
| `DEMO_MAX_COMMENTS_PER_POST` | per post | 10 |

**No exemptions** — the owner account is capped like any visitor. Seed data occupies 2 users and 3 posts,
leaving 18 visitor accounts.

**Why per-owner scoping is not just a smaller number.** A global post cap is a shared pool, so one
enthusiastic visitor can consume all of it and every later visitor finds the app full. A per-user
allowance cannot be exhausted on anyone else's behalf: the worst a single account achieves is its own
2 posts. The ceiling is then a product of the caps rather than a single number — 20 × 2 = 40 posts,
40 × 10 = 400 comments — which is what makes the total footprint predictable enough to share a cluster.

**This also changes where the denial-of-service pressure sits.** Under global caps, posting was the
cheapest way to fill the app. Now posts and comments are self-limiting per account, so **signup is the
only remaining chokepoint**: 18 scripted registrations exhaust the demo. That concentration matters
because rate limiting has been dropped (§5) — it is the single surface where that removal is felt.

**Placement — the service layer, never middleware.** Business logic lives in `lib/services/` per the
project's code constraints; routers stay thin.

**Consequence, accepted deliberately:** new portfolio content is added by editing `apps/server/src/scripts/seed.ts`
and reseeding, never by writing through the live UI. This coheres with §6 — the weekly reseed wipes and
rewrites collections, so anything authored through the UI would be destroyed anyway.

```
userService.signup()     →  UserModel.countDocuments()                     >= DEMO_MAX_USERS
postService.create()     →  PostModel.countDocuments({ author: authorId }) >= DEMO_MAX_POSTS_PER_USER
commentService.create()  →  CommentModel.countDocuments({ post: postId })  >= DEMO_MAX_COMMENTS_PER_POST
```

Each throws `DemoLimitError`. The two scoped counts are **filtered queries, not collection counts** —
`author` and `post` are both already indexed (`models/post.ts:author`, `models/comment.ts:{post,createdAt}`),
so each guard costs an index lookup rather than a collection scan.

`authorId` comes from the session and `postId` from the resolved slug — **never from the request body**,
the same rule the ownership checks follow. A body-supplied owner would let a caller spend someone else's
allowance, or dodge their own.

**The seeded posts violate the per-user cap, and that is fine — but only by accident.** `seed.ts` creates
three posts all authored by `demo`, against a limit of 2. It survives because it calls `PostModel.create()`
directly rather than `postService.create()`, so the service-layer guard never runs. That bypass is
currently unintentional. Make it deliberate: either spread the seed across both accounts (2 for `demo`,
1 for `reader`) so the data honours its own rule, or record here that seeding writes below the service
layer on purpose. **Do not "tidy" `seed.ts` to call the service** — that would make reseeding fail on the
third post, and it would fail only in production, where the collection is not already empty.

**Accepted race condition.** Two concurrent signups at 19 users can both pass the check and yield 21.
Preventing this needs a transaction or an atomic counter. At demo traffic the cost of the guard exceeds the
cost of the overshoot, so the race is accepted and documented rather than fixed. It is bounded — the
overshoot is at most the concurrency level, not unbounded growth. The same applies to the two per-owner
caps, where the blast radius is smaller still: a race yields one extra post for one user.

## §4 Error and HTTP contract

A new typed error joins the existing set in `lib/errors.ts`, translated once by `middleware/error-handler.ts`
like every other. Handlers never build this response themselves.

```ts
/** 403 — the demo deployment has reached its fixed capacity. */
export class DemoLimitError extends Error { ... }
```

**Status 403, not 503.** 503 is semantically closer to "at capacity" and would permit a `Retry-After`
header, but it reads as *broken* to a visitor and trips uptime monitoring. This is a policy refusal of a
well-formed, well-authenticated request, which is what 403 means. A distinct error class rather than reusing
`ForbiddenError` keeps the case separable in tests and logs.

Response shape is the project's fixed one — `{ error: { message } }`, no `fields` (that is 400-only):

*Amended 2026-07-29 (second): two messages, because there are now two conditions.* The per-owner caps
mean a refusal no longer implies the demo is full — telling a visitor with 2 posts that the app is at
capacity is simply false, and it invites a support email about a working app.

**Global user cap reached** (`DEMO_MAX_USERS`) — the demo genuinely is full:

> This is a portfolio demo app and it's reached its visitor limit. For any questions, contact the creator
> directly on GitHub: github.com/YonatanHen

**Per-owner allowance reached** (`DEMO_MAX_POSTS_PER_USER`, `DEMO_MAX_COMMENTS_PER_POST`) — the app is
fine, this account has spent its share:

> This demo caps each account at 2 posts and each post at 10 comments, so there's room for everyone
> trying it out. Delete one of yours to make space.

Both are still 403 with the same `{ error: { message } }` shape; only the text differs. The suggested
remedy is real — delete is implemented for both posts and comments, so the message does not send a
visitor after an action they cannot take.

**Client:** `SignupPage` currently surfaces only client-side Zod errors. Verify during implementation that
the server's 403 message renders on the signup form, the new-post form, and — *amended 2026-07-29* —
`CommentForm`, which is a third submission path with its own error surface. The typed `ApiError` already
carries `status` and `message`, so this should be display wiring, not new plumbing.

## §5 Rate limiting — REMOVED

> **Amended 2026-07-29 (second): rate limiting is dropped from this design.** No `express-rate-limit`,
> no `rate-limit-redis`, no limiter middleware, no 429 anywhere. Decided by the project owner.

**This section previously opened by arguing the opposite**, and that argument is not withdrawn — it is
overruled. §1.2 still says, correctly, that *"a cap creates a denial-of-service surface… a cap without
rate limiting is worse than no cap."* Nothing below softens that; it is recorded as an accepted risk in
§12.4 rather than edited out of §1, because a spec that quietly deletes its own counter-argument stops
being useful for deciding whether to reverse the call later.

**What the exposure actually is now.** The per-owner caps from §3 changed its shape considerably. Posts
and comments are self-limiting per account, so they cannot be flooded by one caller. **Signup is the
whole remaining surface**: 18 unthrottled `POST /api/v1/auth/signup` requests exhaust the demo, and
nothing slows them down. Recovery is the weekly reseed in §6 — which means the realistic worst case is a
demo that is unusable for up to seven days, arriving without warning apart from the §7 email.

**Why it is nevertheless defensible here:** this is an unadvertised portfolio demo with no incentive for
a targeted attack, and the cost of being wrong is a reseed, not data loss. If the demo does get flooded
in practice, adding limiting back is a contained change — which is why the implementation notes below are
kept rather than deleted.

<details>
<summary><strong>If rate limiting is ever restored, read this first — the mount-path trap</strong></summary>

Comments are mounted **underneath** posts — `postsRouter.use('/:slug/comments', commentsRouter)`
(`apps/server/src/routes/v1/posts.ts:55`), giving `POST /api/v1/posts/:slug/comments`. A prefix mount for
a post limiter therefore swallows every comment request:

```ts
// WRONG — `use` matches the prefix and everything beneath it, so posting a
// comment spends the post-creation budget.
app.use('/api/v1/posts', limiters.createPost)
```

Register limiters as method-and-path-exact routes instead. `app.post(path, mw)` matches only that exact
path, and the limiter calls `next()`, so the request still falls through to `v1Router`:

```ts
app.post('/api/v1/auth/signup', limiters.signup)
app.post('/api/v1/auth/login', limiters.login)
app.post('/api/v1/posts', limiters.createPost)              // exact — excludes /:slug/comments
app.post('/api/v1/posts/:slug/comments', limiters.comment)  // its own budget
```

This also removes the need for a `skip: req.method !== 'POST'` guard. Use the cached client from
`lib/redis.ts` for the store — never a new connection (Render's free Key Value caps at 50). And note
IP-based limiting is defeatable by a distributed client: it raises the cost of casual abuse, and is not
a security boundary.

</details>

## §6 Weekly auto-reset

A GitHub Actions scheduled workflow runs `npm run seed` against production once a week.

- **Free.** Render Cron Jobs are a paid feature; GitHub Actions scheduled workflows are not.
- **Self-healing.** Visitor accounts and posts are wiped, slots free up, and the demo never dies.
- **Doubles as an Atlas keep-alive.** M0 clusters auto-pause after extended inactivity. A portfolio sits idle
  between recruiter visits, so the pause can land exactly when someone clicks the link. A weekly write
  prevents it. One job solves two problems.

> ~~`seed.ts` is already idempotent and destructive by design, so no changes to it are required.~~
> **Amended 2026-07-29 — this is no longer true, and it is the amendment's most important consequence.**

`seed.ts:51` wipes three collections:

```ts
await Promise.all([PostModel.deleteMany({}), LikeModel.deleteMany({}), UserModel.deleteMany({})])
```

`CommentModel` is absent — the file predates the comment feature and was never revisited when PR #32
landed. Left as-is, the weekly reset deletes every post and user while **every comment survives**, which
produces two compounding failures:

1. **The comment cap would never free a slot.** Comments would ratchet monotonically toward 200 and stop
   there forever, making the wall permanent. That is the exact failure mode §1.3 names as the reason the
   weekly reset exists — so shipping the §3 cap without this fix would *create* the problem the reset was
   designed to solve.
2. **Orphaned rows accumulate every week.** Surviving comments reference deleted posts and deleted
   authors, so each reset adds a fresh generation of dangling references to a collection nothing prunes.

**Required change:** add `CommentModel.deleteMany({})` to that `Promise.all`, and update the adjacent
`console.log('Wiping posts, likes and users…')`, which would otherwise misreport what ran.

This is a prerequisite of §3's comment cap, not an independent cleanup — implement it in the same task,
and before the cap if the two are split across commits.

**Requires:** `MONGODB_URI` as a GitHub Actions secret, scoped to the least-privilege application user
defined in §8 — not an admin credential.

## §7 Cap-reached email notification

When a cap is first reached, notify the owner by email via **Resend** (free tier: 3,000/month, 100/day; no
domain verification needed when sending to one's own address).

> **Amended 2026-07-29 (second): notify on the GLOBAL user cap only.** The per-owner caps from §3 are
> routine — a visitor writing a third post is the design working, not an incident, and mailing on it
> would train the owner to ignore the alert that matters. Only `DEMO_MAX_USERS` signals a demo that has
> actually stopped accepting people, and with rate limiting dropped (§5) it is also the only alert that
> the exhaustion risk in §12.4 will ever produce. `assertPostCapacity` / `assertCommentCapacity` throw
> without notifying.

Three properties, all mandatory:

1. **Never blocks the request.** Fire-and-forget with a `.catch()` that logs. A mail-provider outage must
   never surface as a user-facing error — the visitor still receives their clean 403.
2. **Deduped in Redis, or it becomes a mail bomb.** Every blocked request would otherwise send mail; a bot
   hitting a full endpoint sends hundreds. Guard with `SET notify:cap:<type> 1 EX 86400 NX` — the write
   succeeds only if the key is absent, giving at most one email per cap type per 24 hours.
3. **No visitor PII.** The email carries which cap was hit, the current counts, and a timestamp. It is a
   capacity signal, not a lead list. Never include the usernames or email addresses of people who signed up.

## §8 Database hardening

### MongoDB Atlas

| Control | Rationale |
|---|---|
| Dedicated user with `readWrite` on the single application database — never `atlasAdmin` | Least privilege. The 2026-07-16 credential leak in this repo's history makes blast radius a demonstrated concern, not a hypothetical one |
| Verify the rotated-out leaked user is **deleted**, not merely rotated | Rotation and removal are different operations; confirm the old principal no longer exists |
| Long, generated password — never hand-chosen | The allowlist below cannot be restrictive, so the credential is the primary control |
| IP allowlist `0.0.0.0/0`, **with a documented justification** | Render's free tier provides no static egress IP, so a narrow allowlist is impossible. Recording *why* prevents this reading as negligence in a portfolio review |
| TLS enforced; confirm the connection string does not disable it | Compensating control for the open allowlist |
| Wipe and reseed before go-live | Already planned in `docs/architecture/deployment-architecture.md`; clears any residue from the leaked-credential period |

### Render Key Value (Redis)

| Control | Status |
|---|---|
| `ipAllowList: []` — no public access | ✅ already set in `infra/render.yaml` |
| `maxmemoryPolicy: allkeys-lru` | ✅ already set. Eviction can log a user out early; acceptable at demo scale |
| `SESSION_SECRET` via `generateValue: true` | ✅ already set — never seen by the repo or by us |

### Application

| Control | Rationale |
|---|---|
| **Audit `console.*` for credential leakage** | The project's own guidance is to log request payloads during development. A signup payload contains a plaintext password. Confirm no payload logging reaches production, and that `DEBUG` gating is real |
| Confirm the password hashing cost factor is current | Cheap to verify, expensive to get wrong |
| Session cookie `httpOnly` + `Secure` + `SameSite=Lax` | ✅ already implemented; re-verify under the production origin |

## §9 Configuration and secrets

No credential, address, or key enters source. `.env.example` carries placeholders only; production values are
set in the Render dashboard with `sync: false`.

| Variable | Where | Notes |
|---|---|---|
| `DEMO_MAX_USERS` | `render.yaml`, value `20` | Not secret. Env-driven so tests can raise it |
| `DEMO_MAX_POSTS_PER_USER` | `render.yaml`, value `2` | Not secret *(renamed + rescoped 2026-07-29)* |
| `DEMO_MAX_COMMENTS_PER_POST` | `render.yaml`, value `10` | Not secret *(renamed + rescoped 2026-07-29)* |
| `NOTIFY_EMAIL` | `render.yaml`, `sync: false` | **Secret** — never in source, never in the repo |
| `RESEND_API_KEY` | `render.yaml`, `sync: false` | **Secret** |
| `MONGODB_URI` | Render dashboard + GitHub Actions secret | **Secret**, least-privilege user per §8 |

All five new variables are added to the `EnvSchema` in `apps/server/src/lib/env.ts`, so a missing value fails
at boot rather than at first use. `DEMO_MAX_*` get defaults; the two secrets do not.

## §10 Testing

| Level | Coverage |
|---|---|
| Unit | Each service: at cap → throws `DemoLimitError`; below cap → succeeds. Limits injected via env, not hardcoded |
| Unit | Notification dedupe: second cap hit within the window sends no mail |
| Unit | Notification failure does not propagate — the service still throws `DemoLimitError`, not a mail error |
| Integration | 403 status and exact `{ error: { message } }` body shape |
| Unit | **One user's posts do not consume another's allowance** — user A at 2 posts, assert user B can still create. The regression that a per-owner cap written as a collection count would introduce *(amended 2026-07-29)* |
| Unit | **One post's comments do not consume another post's allowance** — same shape, scoped by `post` *(amended 2026-07-29)* |
| Unit | The per-owner counts filter by session identity, not by a body field — a caller supplying someone else's `author` cannot spend their allowance *(amended 2026-07-29)* |
| Unit | Notification fires for the global user cap and **not** for either per-owner cap *(amended 2026-07-29)* |
| Unit | `seed.ts` clears comments — assert `CommentModel.countDocuments()` is 0 after a reseed, so the §6 reset cannot silently regress *(amended 2026-07-29)* |

~~429 from the rate limiter is distinguishable from the 403~~ — removed with §5; there is no 429 anywhere
in this design any more.

**No E2E for the caps.** Driving a browser through 20 signups to reach a wall is slow and brittle, and the
integration tests already assert the contract. Playwright's scope stays as defined for the existing E2E work.

## §11 Sequencing

This is **a prerequisite of promotion**, implemented on its own `dev/*` branch and merged to `staging` via
PR like everything else. It must land before `staging` → `master`, because promoting without it exposes an
uncapped, unthrottled, unhardened deployment.

> *Amended 2026-07-29:* the original text read "the **last task** before promotion." That was written when
> promotion was expected to follow P2 directly. The current decision is to promote only once, after P4
> (realtime), the remaining P5 media work, and P6 (OAuth) have all landed — so this is no longer the last
> task, only one of several that must precede the single promotion. Two consequences: the §8 hardening
> checklist and the §12.1 free-tier figures are verified here **provisionally** and must be re-verified
> immediately before the deploy, since months may pass between the two; and any feature landing after this
> one that adds a user-writable collection needs its own cap, the same debt this amendment just paid for
> comments.

Merging to `master` is a production deploy — Render auto-deploys from that branch — and requires explicit
approval, per the project's standing rule. This spec does not constitute that approval.

## §12 Open risks

1. **Free-tier limits move.** The Render, Atlas, and Resend figures cited here should be re-verified against
   current provider documentation at implementation time rather than trusted from this document.
2. **The legacy service collision is unresolved.** A Render service predating `infra/render.yaml` currently
   watches `master` and auto-deploys the legacy app. Applying this Blueprint creates a *parallel* set of
   services rather than updating that one. This is the same mechanism that took the site down on 2026-07-16.
   It is out of scope here but **must be settled before promotion**.
3. ~~**IP-based rate limiting is defeatable.**~~ Moot — rate limiting was removed entirely (§5).
4. **The demo can be exhausted in seconds, and nothing throttles it.** *(added 2026-07-29)* With §5 gone,
   18 scripted signups fill the global user cap with no resistance. The per-owner caps in §3 mean posts and
   comments cannot be flooded the same way, so signup is the whole surface — but it is completely open.
   Recovery is the §6 weekly reseed, so the realistic worst case is **an unusable demo for up to seven
   days**, announced only by the §7 email. This directly contradicts §1.2, which is left standing rather
   than rewritten. Accepted by the project owner on 2026-07-29 on the grounds that an unadvertised
   portfolio demo is not a worthwhile target and the cost of being wrong is a reseed, not data loss.
   **Revisit if the demo is ever flooded in practice** — §5's collapsed section keeps the implementation
   notes for exactly that.
5. **`workflow_dispatch` on the reset is the manual recovery lever.** Given risk 4, the §6 workflow's
   manual trigger stops being a convenience and becomes the incident response. Confirm it works before
   promotion rather than discovering it during an outage.

# Demo Caps, Rate Limiting, and Database Hardening — Design

**Date:** 2026-07-26
**Status:** approved, not implemented
**Scope:** the final task before `staging` is promoted to `master`. Nothing here ships mid-phase.

---

## §1 Motivation

The rebuild is a portfolio piece. Recruiters need to sign up (the content wall is per-reader, so signing up
is what unlocks full post bodies — see the Express/React rebuild design doc), but the deployment is a demo,
not a product. It runs on free-tier infrastructure with no moderation and no support burden budget.

Three consequences follow, and this design addresses all three together because they are inseparable:

1. **Unbounded growth is a liability.** Anyone can create accounts and posts indefinitely on a public
   endpoint. Left open, the demo accumulates spam that a recruiter sees before they see the work.
2. **A cap creates a denial-of-service surface.** Capping at 15 users means 13 scripted requests kill the
   demo for every subsequent visitor. A cap without rate limiting is worse than no cap.
3. **A hard cap eventually kills the demo.** A portfolio runs for months. Without a reset, the wall becomes
   permanent and every recruiter after the 15th sees only a block message.

## §2 Non-goals

- **Not a moderation system.** No content review, no reporting, no admin UI.
- **Not per-user quotas.** The caps are global counts, not per-account allowances.
- **Not comment caps.** Comments are not implemented (`models/comment.ts` exists, no service does). When
  comments land, they need their own cap — noted here so it is not forgotten.
- **Not the full P6 rate-limiting design.** This is the minimum needed to protect the caps. The broader
  rate-limiting story stays in P6.

---

## §3 Cap enforcement

**Limits:** 15 users, 30 posts. Global counts, **no exemptions** — the owner account is capped like any
visitor. Seed data occupies 2 users and 3 posts, leaving 13 and 27 visitor slots.

**Consequence, accepted deliberately:** new portfolio content is added by editing `apps/server/src/scripts/seed.ts`
and reseeding, never by writing through the live UI. This coheres with §6 — the weekly reseed wipes and
rewrites collections, so anything authored through the UI would be destroyed anyway.

**Placement — the service layer, never middleware.** Business logic lives in `lib/services/` per the
project's code constraints; routers stay thin.

```
userService.signup()  →  UserModel.countDocuments() >= DEMO_MAX_USERS  →  throw DemoLimitError
postService.create()  →  PostModel.countDocuments() >= DEMO_MAX_POSTS  →  throw DemoLimitError
```

**Accepted race condition.** Two concurrent signups at count 14 can both pass the check and yield 16 users.
Preventing this needs a transaction or an atomic counter. At demo traffic the cost of the guard exceeds the
cost of the overshoot, so the race is accepted and documented rather than fixed. It is bounded — the
overshoot is at most the concurrency level, not unbounded growth.

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

> This is a portfolio demo app and it's reached its visitor limit. For any questions, contact the creator
> directly on GitHub: github.com/YonatanHen

**Client:** `SignupPage` currently surfaces only client-side Zod errors. Verify during implementation that
the server's 403 message renders on both the signup and new-post forms; the typed `ApiError` already carries
`status` and `message`, so this should be display wiring, not new plumbing.

## §5 Rate limiting

Without this, §3 is self-defeating: 13 scripted `POST /api/v1/users` requests exhaust the demo in seconds.

`express-rate-limit` with a Redis store, reusing the cached client from `lib/redis.ts` — never a new
connection (Render's free Key Value caps at 50). Applied to the two capped mutations only, not globally:

| Route | Limit |
|---|---|
| `POST /api/v1/users` (signup) | 5 / hour / IP |
| `POST /api/v1/posts` (create) | 10 / hour / IP |

Exceeding a limit returns **429**, which is distinct from the 403 cap message — "you are going too fast" and
"the demo is full" are different conditions and must not be conflated.

**Known limitation:** IP-based limiting is defeatable by a distributed client. It raises the cost of casual
abuse, which is the goal; it is not a security boundary. The weekly reset in §6 is the actual recovery
mechanism.

## §6 Weekly auto-reset

A GitHub Actions scheduled workflow runs `npm run seed` against production once a week.

- **Free.** Render Cron Jobs are a paid feature; GitHub Actions scheduled workflows are not.
- **Self-healing.** Visitor accounts and posts are wiped, slots free up, and the demo never dies.
- **Doubles as an Atlas keep-alive.** M0 clusters auto-pause after extended inactivity. A portfolio sits idle
  between recruiter visits, so the pause can land exactly when someone clicks the link. A weekly write
  prevents it. One job solves two problems.

`seed.ts` is already idempotent and destructive by design, so no changes to it are required.

**Requires:** `MONGODB_URI` as a GitHub Actions secret, scoped to the least-privilege application user
defined in §8 — not an admin credential.

## §7 Cap-reached email notification

When a cap is first reached, notify the owner by email via **Resend** (free tier: 3,000/month, 100/day; no
domain verification needed when sending to one's own address).

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
| `DEMO_MAX_USERS` | `render.yaml`, value `15` | Not secret. Env-driven so tests can raise it |
| `DEMO_MAX_POSTS` | `render.yaml`, value `30` | Not secret |
| `NOTIFY_EMAIL` | `render.yaml`, `sync: false` | **Secret** — never in source, never in the repo |
| `RESEND_API_KEY` | `render.yaml`, `sync: false` | **Secret** |
| `MONGODB_URI` | Render dashboard + GitHub Actions secret | **Secret**, least-privilege user per §8 |

All four new variables are added to the `EnvSchema` in `apps/server/src/lib/env.ts`, so a missing value fails
at boot rather than at first use. `DEMO_MAX_*` get defaults; the two secrets do not.

## §10 Testing

| Level | Coverage |
|---|---|
| Unit | Each service: at cap → throws `DemoLimitError`; below cap → succeeds. Limits injected via env, not hardcoded |
| Unit | Notification dedupe: second cap hit within the window sends no mail |
| Unit | Notification failure does not propagate — the service still throws `DemoLimitError`, not a mail error |
| Integration | 403 status and exact `{ error: { message } }` body shape |
| Integration | 429 from the rate limiter is distinguishable from the 403 cap response |

**No E2E for the caps.** Driving a browser through 15 signups to reach a wall is slow and brittle, and the
integration tests already assert the contract. Playwright's scope stays as defined for the existing E2E work.

## §11 Sequencing

This is the **last task before promotion**, implemented on its own `dev/*` branch and merged to `staging` via
PR like everything else. It must land before `staging` → `master`, because promoting without it exposes an
uncapped, unthrottled, unhardened deployment.

Merging to `master` is a production deploy — Render auto-deploys from that branch — and requires explicit
approval, per the project's standing rule. This spec does not constitute that approval.

## §12 Open risks

1. **Free-tier limits move.** The Render, Atlas, and Resend figures cited here should be re-verified against
   current provider documentation at implementation time rather than trusted from this document.
2. **The legacy service collision is unresolved.** A Render service predating `infra/render.yaml` currently
   watches `master` and auto-deploys the legacy app. Applying this Blueprint creates a *parallel* set of
   services rather than updating that one. This is the same mechanism that took the site down on 2026-07-16.
   It is out of scope here but **must be settled before promotion**.
3. **IP-based rate limiting is defeatable.** Stated in §5 and accepted; the weekly reset is the real recovery
   path.

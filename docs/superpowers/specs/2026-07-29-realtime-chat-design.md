# Realtime Chat (P4) — Design

**Date:** 2026-07-29
**Status:** approved, not implemented
**Scope:** P4. Authenticated realtime chat, presence, and typing indicators.
**Supersedes:** the `apps/realtime` / handshake-ticket design in
`2026-07-16-express-react-rebuild-design.md` §5. See §2 and §10 below.

---

## §1 What this builds

The legacy app's chat, rebuilt: one global room, signed-in readers only, messages held in Redis rather
than MongoDB. It closes the three chat items still open on the main spec's §14 regression checklist, all
of which are real defects in the 2021 code:

| Legacy defect | Closed by |
|---|---|
| `app.js:56` echoed `message.user` straight from the client payload — anyone could speak as anyone | §3 |
| `chat.jsx:51` added a listener per message received | §6 |
| `chat.jsx:57` emitted `disconnect` on every render | §6 |

**Not in scope:** direct messages, multiple rooms, message history beyond the live buffer, moderation,
file or image attachments, read receipts, message editing or deletion.

---

## §2 Architecture — Socket.io runs inside `apps/server`

**Decision (2026-07-29): there is no `apps/realtime`.** Socket.io attaches to the same HTTP server that
serves the REST API and the built SPA.

```ts
const sessionMiddleware = buildSessionMiddleware({ store, secret, secure })
const app = buildApp({ sessionMiddleware, trustProxy, clientDist })
const server = http.createServer(app)
const io = new Server(server)
io.engine.use(sessionMiddleware)
server.listen(env.PORT)
```

### Why this replaces the two-service design

The main spec put realtime in its own Render service. That forced a chain of consequences, each solving a
problem created by the one before it:

1. A separate service means a **different origin**.
2. A different origin means the session cookie cannot reach it — and `onrender.com` is on the **Public
   Suffix List**, so widening the cookie to the parent domain is not merely inadvisable, it is refused by
   the browser.
3. No cookie means inventing a **signed handshake ticket**: a new endpoint, a JWT library, a shared
   signing secret, and a sign/verify pair that must agree across two codebases.
4. A sign/verify pair split across two apps needs a **shared package**, which the main spec left as an
   open question because `packages/zod-shared` is schemas-only by design.
5. A separate origin also means **CORS**, contradicting the project's "CORS is never needed anywhere"
   property.

Collapsing to one service dissolves all five at once. Nothing in items 1–5 was solving a problem the
product has; each was solving a problem the topology introduced.

### The free-tier argument, stated accurately

Render grants **750 instance-hours per month per workspace**. A month is roughly 730 hours, so the
allowance funds **one** service running continuously — never two. Under the two-service design both must
sleep, and opening the chat costs *two* ~60-second cold starts in series: one to wake the API for the
handshake, another to wake the realtime service for the socket. A blog post that loads slowly reads as
slow; a chat that does nothing for two minutes reads as broken.

**What one service actually buys, without overclaiming:** the cold-start cost halves from two to one, and
staying warm becomes *possible* within the free allowance. It is not automatic — Render spins a free
service down after 15 minutes without inbound traffic regardless of the hour budget, so genuinely
eliminating cold starts needs a periodic ping (an external uptime pinger on a 5–10 minute interval is the
cheapest option and is free). That ping is **not** part of this phase; it is recorded as risk §12.1.

### What is given up, honestly

A standalone realtime service is a legitimate portfolio talking point — it is the one place this project
would demonstrate service-to-service authentication, and it allows the socket layer to scale
independently of the API. Both are real. The independent scaling is theoretical at demo traffic, and the
auth story is traded for a simpler one that is *correct* rather than merely impressive. Recorded here so
the choice reads as deliberate if a reviewer asks why the chat is not its own service.

### The one refactor this forces

`buildApp` currently constructs the session middleware internally from `SessionOptions`. Socket.io needs
**that same instance** — a second one built from the same options would work, but two middleware objects
sharing one store is a coincidence rather than a guarantee. So `BuildAppOptions` takes a prebuilt
`sessionMiddleware: RequestHandler` and the construction moves to the entry point. Existing tests that
pass `session: {...}` are updated to build it themselves.

`app.test.ts`'s middleware-order assertion is **unaffected**: Socket.io attaches to the HTTP server, not
to the Express chain, so `helmet → json → session → routers → 404 → error handler` is unchanged.

---

## §3 Authentication — the session, directly

No ticket. No token. The handshake runs the same session middleware as every REST request, so the socket
reads the same session from the same Redis store.

```ts
io.use((socket, next) => {
  const { userId, username } = socket.request.session ?? {}
  if (!userId) return next(new Error('unauthorized'))
  socket.data.user = { userId, username }
  socket.join(`user:${userId}`)   // see revocation below
  next()
})
```

**Identity is server-derived, always.** Every message the server broadcasts is stamped from
`socket.data.user`. The client's payload carries a body and nothing else — there is no author field to
spoof, because the schema in §5 does not have one. This is the fix for `app.js:56`.

`saveUninitialized: false` is already set, so an anonymous handshake does not allocate a Redis key before
being rejected.

### Revocation on logout

Reading the session live is better than a ticket for revocation — but only for *new* connections. An
already-open socket holds its identity in `socket.data`, so destroying the session does not by itself
close it. Leaving a socket authenticated after logout would contradict the project's authorization model,
so `POST /api/v1/auth/logout` disconnects that user's sockets:

```ts
io.in(`user:${userId}`).disconnectSockets()
```

The `user:<id>` room exists solely for this. It costs one `join` per connection and removes the need for a
hand-maintained socket registry.

---

## §4 Redis structures

Chat data is ephemeral by design (main spec §7): there is no `Message` model and messages never enter
MongoDB. The chat is a live room, not an archive.

| Key | Structure | Purpose |
|---|---|---|
| `chat:messages` | List, `LPUSH` + `LTRIM 0 49`, TTL 24h | Recent context so an arriving reader sees a conversation, not an empty box |

That is the entire Redis footprint. **Presence is deliberately not in Redis.**

### Presence is in-memory, derived from connected sockets

The main spec §7 lists presence as a Redis use — `SET` with heartbeat TTLs. **This design drops that
entirely**, and the reason is §2: there is one service running one instance, with no Socket.io Redis
adapter. `io.sockets` is therefore already the complete and authoritative answer to "who is online."

```ts
// the whole implementation
const online = new Set(
  [...io.sockets.sockets.values()].map((s) => s.data.user.userId),
)
```

Recomputed on `connection` and `disconnect`, and broadcast. Nothing is stored.

A Redis presence set exists to let *separate processes* agree on who is connected. With a single process
there is nobody to agree with, so it would add a key, a client event, a TTL and a cutoff constant to a
25 MB store shared with the session data — and buy nothing until a second instance exists, which §2 rules
out.

**No heartbeat event either.** Heartbeats exist to notice clients that vanish without a clean disconnect.
Socket.io already does that: its ping/pong timeout fires `disconnect` for a dead connection. Adding an
application-level heartbeat on top would be a second, worse implementation of a mechanism the transport
already provides.

**On restart:** the process loses in-memory presence, and simultaneously drops every socket — so presence
correctly becomes empty rather than becoming stale. The two cannot desynchronise, which is a property the
Redis version would have had to work to preserve.

**Redis has no persistence on the free plan** (main spec §7), so a restart also empties the message
buffer. That is correct behaviour for this data, not a failure: the chat is live, and an empty room after
a restart is honest.

---

## §5 API surface

### REST — on `apps/server`, same origin as everything else

| Method | Path | Auth | Returns |
|---|---|---|---|
| `GET` | `/api/v1/chat/messages` | `requireAuth` | The recent buffer, oldest first |

The client loads the buffer over REST and *then* subscribes, matching the main spec's data-flow table.
Doing it the other way round — subscribing first and back-filling — opens a window where a message
arriving mid-fetch is either duplicated or lost.

### Socket events

| Direction | Event | Payload |
|---|---|---|
| client → server | `message` | `{ body: string }` — validated by `ChatMessageSchema` |
| client → server | `typing` | `{ typing: boolean }` |
| server → client | `message` | `ChatMessage` (see below) |
| server → client | `presence` | `{ users: { id, username }[] }` |
| server → client | `typing` | `{ userId, username, typing }` |

`ChatMessageSchema` lives in `packages/zod-shared` with every other schema, so the same rules validate the
socket payload on the server and the composer on the client:

```ts
export const ChatMessageSchema = z.object({
  body: z.string().trim().min(1, 'Message cannot be empty').max(1000, 'Message must be at most 1,000 characters'),
})
```

The broadcast shape adds only server-derived fields:

```ts
type ChatMessage = {
  id: string          // crypto.randomUUID() — for React keys and client-side dedup
  body: string
  author: { id: string; username: string }   // from socket.data.user, never the payload
  sentAt: string      // ISO, server clock
}
```

**`typing` is never persisted** — it is broadcast and forgotten. Writing a keystroke signal to Redis would
put the highest-frequency, lowest-value event in the app into a 25 MB store.

**Business logic lives in `lib/services/chat.ts`**, per the project's code constraints. The socket handlers
authenticate, validate, and delegate — the same rule the REST routers follow. Handlers are thin.

---

## §6 Client design

The remaining two §14 regression items are both React lifecycle defects, which is why the socket is a
designed unit rather than inline `useEffect` code.

**The socket is created once, outside render.** A `socket.io-client` instance is module-level (or held in
a ref), created with `autoConnect: false` and connected by an effect that runs once. Creating it during
render produces a new connection per render — the shape of `chat.jsx:57`, which emitted `disconnect` on
every render.

**Every listener is removed in the effect's cleanup.** `chat.jsx:51` registered a handler per message
received, so the listener count grew with the conversation and each message was handled N times. The rule
here: every `socket.on(...)` has a matching `socket.off(...)` in the same effect's return.

```ts
useEffect(() => {
  socket.on('message', onMessage)
  socket.on('presence', onPresence)
  return () => {
    socket.off('message', onMessage)
    socket.off('presence', onPresence)
  }
}, [])
```

**Structure:** `apps/client/src/hooks/use-chat.ts` owns the socket lifecycle and exposes
`{ messages, online, typingUsers, send, status }`. `apps/client/src/pages/ChatPage.tsx` renders; it holds
no socket logic. The `/chat` route is wrapped in `RequireAuth` — a UX redirect only, since §3 is what
actually enforces it.

**Connection status is surfaced, not hidden.** `status` is `connecting | connected | reconnecting |
failed`, and the page renders it. Given §2's cold start, a chat that looks idle while the service wakes is
indistinguishable from a broken one; saying "connecting" is the difference.

**Message bodies render as plain text, not Markdown.** `MarkdownPreview` exists and is safe, but chat is a
different surface from comments: a fast-moving room does not benefit from block quotes and tables, and
keeping it plain removes the question of what a link in a chat message should do.

---

## §7 Errors

A rejected handshake surfaces as a connection error, not an HTTP status — Socket.io's middleware signals
failure with `next(new Error(...))`. The client maps it to `status: 'failed'` and a signed-out prompt.

Message validation failures are returned to the sender only, as an `error` event carrying the Zod message,
rather than broadcast. The REST endpoint uses the project's existing typed errors and error handler; it
introduces no new error class.

---

## §8 Testing

| Level | Coverage |
|---|---|
| Unit | `chatService.append` trims the buffer to 50 and sets the TTL |
| Unit | `ChatMessageSchema` rejects empty and over-length bodies |
| Integration | Presence reflects connect and disconnect, and lists a user once when they hold two sockets |
| Integration | An anonymous socket handshake is rejected |
| Integration | An authenticated socket receives its own broadcast, stamped with the session's identity — **not** with an author supplied in the payload |
| Integration | `GET /api/v1/chat/messages` 401s for an anonymous request |
| Integration | Logout disconnects that user's open sockets |
| E2E | Two browser contexts exchange a message (main spec §10 already requires this) |

The identity test is the one that matters: it is the §14 regression, and it must assert that a payload
carrying `author` or `user` cannot influence the broadcast.

---

## §9 Configuration and deployment

**No new environment variables.** The two-service design needed a socket-ticket secret; this one needs
nothing — it reuses `SESSION_SECRET` and `REDIS_URL`, both already validated at boot by `lib/env.ts`.

**No new Render service.** `infra/render.yaml` is unchanged apart from removing the `apps/realtime`
comment. WebSocket upgrades work on Render web services with no extra configuration.

**`infra/compose.yaml`** needs no new container. The Vite dev proxy already forwards `/api`; the socket
connects to the same origin, so it needs a `ws: true` proxy entry for the Socket.io path.

---

## §10 Documentation this decision invalidates

The single-service decision contradicts the main design spec in five places. Leaving them would have the
repository describing a service that will never exist.

**These are amended on this branch once this design is approved, before implementation starts** — not in
the same commit as this document, so the design can be reviewed on its own first. Until they land, the
main spec still describes the two-service plan and this file is the only record that it is superseded,
which is the one window where the two disagree:

| Document | Change |
|---|---|
| Main spec §3 | Remove `apps/realtime` from the layout and the migration map |
| Main spec §5 | Replace "Socket authentication across origins" with §3 above; the PSL analysis stays as the *reason* the ticket was designed, marked superseded |
| Main spec §7 | Remove presence from the Redis table entirely — it is in-memory now (§4). The sessions and chat-buffer rows stand; the rate-limiting row already went with the demo-caps amendment |
| Main spec §12 | Cost table: one web service, not two; correct the cold-start note |
| Main spec §13 | P4 row: no separate service |
| `CLAUDE.md` | The `apps/realtime` architecture bullet and the "realtime is the exception" CORS paragraph — CORS is now genuinely never needed anywhere |
| `README.md` | Move chat out of "Not yet built"; the architecture diagram gains the socket on the existing service |

---

## §11 Sequencing

Implemented on `dev/realtime-chat`, merged to `staging` via PR. It does not block and is not blocked by
P2 Task 14 (demo caps) — they share no files now that Task 14 no longer touches `app.ts`.

**Chat has no cap and no rate limit.** Task 14 caps users, posts and comments; messages are exempt because
the buffer is inherently self-limiting — `LTRIM` holds 50 and a TTL discards the rest, so flooding the
chat cannot grow storage. It can drown the visible conversation, which the weekly reset does not fix and
nothing else does either. Accepted: see risk §12.2.

---

## §12 Open risks

1. **Staying warm needs a pinger that does not exist yet.** §2 claims the *option* of no cold starts, not
   the fact. Without a periodic external ping, the service still sleeps after 15 idle minutes and the
   first chat visitor waits ~60 seconds. Decide before promotion whether to add one; if not, the
   connecting state in §6 is the entire mitigation.
2. **A flooder can drown the room.** With no message cap or rate limit (§11), 50 rapid messages evict all
   real conversation from the buffer. Storage is unaffected and the TTL cleans up, so this is a nuisance
   rather than a liability — but unlike the §12.4 risk in the demo-caps design, the weekly reseed does not
   recover it, because there is nothing to reseed. Revisit if it happens.
3. **Presence is per-user, not per-connection.** Two tabs are one entry in the online list, and closing
   one leaves the user online via the other socket. That is the desired behaviour — deduplicating by
   `userId` is why the set is keyed that way — recorded so it is not mistaken for an oversight.
4. **Reverting to two services later is expensive.** This design deletes the ticket, the shared package,
   and the CORS configuration. If the project ever wants realtime split out — for scaling or as a
   portfolio talking point — items 1–5 in §2 all come back. The superseded §5 in the main spec is kept
   rather than deleted for exactly this reason.

# Realtime Chat (P4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add authenticated realtime chat — one global room, messages held in Redis, presence and typing indicators — running inside `apps/server` rather than as a separate service.

**Architecture:** Socket.io attaches to the same Node HTTP server as Express and shares the Express session middleware via `io.engine.use(sessionMiddleware)`. The socket therefore reads the same session as every REST request: no handshake ticket, no shared crypto package, no CORS. Messages live in a capped Redis list; presence is derived in-memory from `io.sockets` and stored nowhere.

**Tech Stack:** Socket.io 4 (server + client), Express 5, `express-session` + `connect-redis`, `redis` v6 (node-redis camelCase API), Zod, React 19, Vitest, Playwright.

**Design spec:** `docs/superpowers/specs/2026-07-29-realtime-chat-design.md`. Read it before Task 1 — the "why" for every decision below lives there, and several are deliberate deviations from the main design spec.

## Global Constraints

- **No `any`.** `@typescript-eslint/no-explicit-any` is an error repo-wide.
- **No new environment variables.** Chat reuses `SESSION_SECRET` and `REDIS_URL`.
- **No CORS, ever.** Socket.io is same-origin; do not add a `cors` option to the `Server` constructor.
- **Business logic lives in `lib/services/`.** Socket handlers and routers authenticate, validate, delegate.
- **Zod is the single source of truth.** Schemas in `packages/zod-shared/src/schemas/`; types inferred with `z.infer`, never hand-declared.
- **Identity always comes from the session**, never from a request body or socket payload.
- **Gate `console.*` tracing with `if (process.env.DEBUG)`** on the server, `if (DEBUG)` on the client.
- **Never pass credentials or message bodies to a log** — use `redactSecrets` if a payload must be traced.
- **Commits carry no Claude attribution and no `Co-Authored-By` trailer.**
- **Never merge without a PR**, and never to `master`.
- Redis calls use node-redis camelCase: `lPush`, `lTrim`, `lRange`, `expire`.

---

## File Structure

**Create:**

| Path | Responsibility |
|---|---|
| `packages/zod-shared/src/schemas/chat.ts` | `ChatMessageSchema` (the wire-in payload) and the `ChatMessage` broadcast type |
| `apps/server/src/lib/services/chat.ts` | Redis buffer: append with trim + TTL, list oldest-first |
| `apps/server/src/lib/services/chat.test.ts` | Buffer unit tests against a fake Redis client |
| `apps/server/src/routes/v1/chat.ts` | `GET /api/v1/chat/messages` |
| `apps/server/src/routes/v1/chat.test.ts` | Route auth + shape |
| `apps/server/src/realtime/index.ts` | `createRealtime` — Socket.io wiring, auth guard, event handlers |
| `apps/server/src/realtime/realtime.test.ts` | Socket integration: auth, identity, presence, logout |
| `apps/client/src/hooks/use-chat.ts` | Socket lifecycle and chat state |
| `apps/client/src/hooks/use-chat.test.tsx` | Listener cleanup — the `chat.jsx` regressions |
| `apps/client/src/pages/ChatPage.tsx` | Renders; holds no socket logic |
| `e2e/chat.spec.ts` | Two browser contexts exchange a message |

**Modify:** `apps/server/src/app.ts`, `index.ts`, `test/helpers.ts`, `lib/session.test.ts`, `routes/v1/index.ts`, `routes/v1/auth.ts`, `packages/zod-shared/src/schemas/index.ts`, `apps/client/src/routes.tsx`, `apps/client/src/components/layouts/PageShell.tsx`, `apps/client/vite.config.ts`, both `package.json` files.

---

### Task 1: Accept a prebuilt session middleware in `buildApp`

Socket.io must share the *same* session middleware instance as Express. `buildApp` currently constructs it internally from `SessionOptions`, so the entry point cannot hand the same object to both.

**Files:**
- Modify: `apps/server/src/app.ts`
- Modify: `apps/server/src/index.ts`
- Modify: `apps/server/src/test/helpers.ts:24-27`
- Modify: `apps/server/src/lib/session.test.ts:10`

**Interfaces:**
- Consumes: `buildSessionMiddleware(opts: SessionOptions): RequestHandler` — already exists in `lib/session.ts`.
- Produces: `BuildAppOptions.sessionMiddleware?: RequestHandler` replacing `session?: SessionOptions`.

- [ ] **Step 1: Change the option in `app.ts`**

Replace the `session` field and its use:

```ts
export type BuildAppOptions = {
  /** Prebuilt so the Socket.io server can share this exact instance. */
  sessionMiddleware?: express.RequestHandler
  /** Behind Render's proxy this must be set, or Secure cookies are dropped. */
  trustProxy?: boolean
  /** Directory holding the built SPA. Absent in P1 — there is no client yet. */
  clientDist?: string
}
```

```ts
  if (opts.sessionMiddleware) {
    app.use(opts.sessionMiddleware)
  }
```

Delete the now-unused `buildSessionMiddleware` / `SessionOptions` import from `app.ts`.

- [ ] **Step 2: Run the server tests to see exactly what breaks**

Run: `npm run test -- apps/server`
Expected: FAIL. `test/helpers.ts`, `lib/session.test.ts` and `index.ts` still pass `session: {...}`, which is no longer a valid option.

- [ ] **Step 3: Update `test/helpers.ts`**

```ts
import { buildSessionMiddleware } from '../lib/session.js'

export function buildTestApp(overrides: Partial<BuildAppOptions> = {}): express.Express {
  return buildApp({
    sessionMiddleware: buildSessionMiddleware({
      store: new session.MemoryStore(),
      secret: TEST_SESSION_SECRET,
      secure: false,
    }),
    ...overrides,
  })
}
```

- [ ] **Step 4: Update `lib/session.test.ts`**

Replace the `buildApp({ session: {...} })` call at line 10:

```ts
  buildApp({
    sessionMiddleware: buildSessionMiddleware({
      store: new session.MemoryStore(),
      secret: SECRET,
      secure,
    }),
  })
```

Add `buildSessionMiddleware` to that file's imports from `./session.js`.

- [ ] **Step 5: Update `index.ts`**

```ts
import { buildSessionMiddleware } from './lib/session.js'

  const sessionMiddleware = buildSessionMiddleware({
    store: new RedisStore({ client: redis, prefix: 'sess:' }),
    secret: env.SESSION_SECRET,
    secure: isProd, // a Secure cookie over plain http:// is silently dropped
  })

  const app = buildApp({
    sessionMiddleware,
    trustProxy: isProd, // Render terminates TLS at a proxy
    clientDist: env.CLIENT_DIST,
  })
```

- [ ] **Step 6: Run the full gate**

Run: `npm run typecheck && npm run lint && npm run test`
Expected: all pass. `app.test.ts`'s middleware-order assertion must still pass unchanged — this task moves *where* the middleware is built, not where it runs.

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/app.ts apps/server/src/index.ts apps/server/src/test/helpers.ts apps/server/src/lib/session.test.ts
git commit -m "refactor(server): build the session middleware at the entry point

Socket.io needs the same middleware instance Express uses, and buildApp
constructed it internally. Moves construction to index.ts and takes a prebuilt
handler. No behaviour change: the middleware still runs in the same position."
```

---

### Task 2: `ChatMessageSchema` in `zod-shared`

**Files:**
- Create: `packages/zod-shared/src/schemas/chat.ts`
- Modify: `packages/zod-shared/src/schemas/index.ts`
- Modify: `packages/zod-shared/src/schemas/schemas.test.ts`

**Interfaces:**
- Produces: `ChatMessageSchema` (validates `{ body: string }`), `type ChatMessageInput = z.infer<typeof ChatMessageSchema>`, and `type ChatMessage = { id, body, author: { id, username }, sentAt }`.

- [ ] **Step 1: Write the failing test**

Append to `packages/zod-shared/src/schemas/schemas.test.ts`:

```ts
describe('ChatMessageSchema', () => {
  it('trims and accepts a normal message', () => {
    const result = ChatMessageSchema.parse({ body: '  hello  ' })
    expect(result.body).toBe('hello')
  })

  it('rejects a whitespace-only message', () => {
    expect(ChatMessageSchema.safeParse({ body: '   ' }).success).toBe(false)
  })

  it('rejects a message over 1,000 characters', () => {
    expect(ChatMessageSchema.safeParse({ body: 'a'.repeat(1001) }).success).toBe(false)
  })

  // The author is server-derived. A payload claiming one must not survive
  // parsing, or the socket handler could be tempted to trust it.
  it('strips an author supplied by the client', () => {
    const result = ChatMessageSchema.parse({ body: 'hi', author: { id: 'x', username: 'admin' } })
    expect(result).not.toHaveProperty('author')
  })
})
```

Add `ChatMessageSchema` to that file's import from `./index.js`.

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm run test -- packages/zod-shared`
Expected: FAIL — `ChatMessageSchema` is not exported.

- [ ] **Step 3: Write the schema**

```ts
// packages/zod-shared/src/schemas/chat.ts
import { z } from 'zod'

/**
 * The socket payload a client may send. `body` and nothing else: the author and
 * timestamp are stamped by the server from the session, so there is no author
 * field here to spoof. Zod objects strip unknown keys, which is the second
 * reason a client-supplied author cannot reach a handler.
 */
export const ChatMessageSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, 'Message cannot be empty')
    .max(1000, 'Message must be at most 1,000 characters'),
})

export type ChatMessageInput = z.infer<typeof ChatMessageSchema>

/** What the server broadcasts. Every field beyond `body` is server-derived. */
export type ChatMessage = {
  id: string
  body: string
  author: { id: string; username: string }
  /** ISO 8601, server clock. */
  sentAt: string
}
```

- [ ] **Step 4: Export it**

Add to `packages/zod-shared/src/schemas/index.ts`:

```ts
export * from './chat.js'
```

- [ ] **Step 5: Run it and confirm it passes**

Run: `npm run test -- packages/zod-shared`
Expected: PASS, 4 new tests.

- [ ] **Step 6: Commit**

```bash
git add packages/zod-shared/src/schemas/chat.ts packages/zod-shared/src/schemas/index.ts packages/zod-shared/src/schemas/schemas.test.ts
git commit -m "feat(shared): ChatMessageSchema — body only, author is server-derived"
```

---

### Task 3: `chatService` — the Redis message buffer

**Files:**
- Create: `apps/server/src/lib/services/chat.ts`
- Create: `apps/server/src/lib/services/chat.test.ts`

**Interfaces:**
- Consumes: `ChatMessage` from `@blog/zod-shared`.
- Produces:
  - `type ChatRedis = { lPush(k: string, v: string): Promise<number>; lTrim(k: string, s: number, e: number): Promise<unknown>; lRange(k: string, s: number, e: number): Promise<string[]>; expire(k: string, s: number): Promise<unknown> }`
  - `createChatService(redis: ChatRedis): ChatService`
  - `type ChatService = { append(message: ChatMessage): Promise<void>; list(): Promise<ChatMessage[]> }`
  - `CHAT_KEY = 'chat:messages'`, `CHAT_BUFFER_SIZE = 50`, `CHAT_TTL_SECONDS = 86400`

A factory, not a plain object like `postService`. Mongoose models are module-level singletons that a service can import; the Redis client is created at the entry point and passed down, so injecting it is what makes this unit testable without a live Redis.

- [ ] **Step 1: Write the failing test**

```ts
// apps/server/src/lib/services/chat.test.ts
import type { ChatMessage } from '@blog/zod-shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CHAT_BUFFER_SIZE, CHAT_KEY, CHAT_TTL_SECONDS, createChatService } from './chat.js'

/** A list-shaped fake: LPUSH prepends, LTRIM slices, LRANGE reads. */
function fakeRedis() {
  const store: string[] = []
  return {
    store,
    lPush: vi.fn(async (_k: string, v: string) => store.unshift(v)),
    lTrim: vi.fn(async (_k: string, s: number, e: number) => {
      store.splice(0, store.length, ...store.slice(s, e + 1))
    }),
    lRange: vi.fn(async (_k: string, s: number, e: number) =>
      e === -1 ? store.slice(s) : store.slice(s, e + 1),
    ),
    expire: vi.fn(async () => undefined),
  }
}

const message = (body: string): ChatMessage => ({
  id: `id-${body}`,
  body,
  author: { id: 'u1', username: 'demo' },
  sentAt: '2026-07-29T00:00:00.000Z',
})

describe('chatService', () => {
  let redis: ReturnType<typeof fakeRedis>

  beforeEach(() => {
    redis = fakeRedis()
  })

  it('writes to the capped key and refreshes its TTL', async () => {
    await createChatService(redis).append(message('hello'))

    expect(redis.lPush).toHaveBeenCalledWith(CHAT_KEY, expect.stringContaining('hello'))
    expect(redis.lTrim).toHaveBeenCalledWith(CHAT_KEY, 0, CHAT_BUFFER_SIZE - 1)
    expect(redis.expire).toHaveBeenCalledWith(CHAT_KEY, CHAT_TTL_SECONDS)
  })

  it('keeps only the newest CHAT_BUFFER_SIZE messages', async () => {
    const service = createChatService(redis)
    for (let i = 0; i < CHAT_BUFFER_SIZE + 10; i++) await service.append(message(`m${i}`))

    expect(redis.store).toHaveLength(CHAT_BUFFER_SIZE)
    const bodies = (await service.list()).map((m) => m.body)
    expect(bodies).toContain(`m${CHAT_BUFFER_SIZE + 9}`)
    expect(bodies).not.toContain('m0')
  })

  // LPUSH puts newest at the head; a chat reads oldest-first.
  it('lists oldest first', async () => {
    const service = createChatService(redis)
    await service.append(message('first'))
    await service.append(message('second'))

    expect((await service.list()).map((m) => m.body)).toEqual(['first', 'second'])
  })

  it('returns an empty array when the buffer is empty', async () => {
    expect(await createChatService(redis).list()).toEqual([])
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm run test -- apps/server/src/lib/services/chat.test.ts`
Expected: FAIL — `./chat.js` does not exist.

- [ ] **Step 3: Implement the service**

```ts
// apps/server/src/lib/services/chat.ts
import type { ChatMessage } from '@blog/zod-shared'

export const CHAT_KEY = 'chat:messages'
/** Enough for arriving context, small enough to stay trivial in a 25 MB store. */
export const CHAT_BUFFER_SIZE = 50
export const CHAT_TTL_SECONDS = 60 * 60 * 24

/** The four commands this service uses — narrow so tests need no live Redis. */
export type ChatRedis = {
  lPush(key: string, value: string): Promise<number>
  lTrim(key: string, start: number, stop: number): Promise<unknown>
  lRange(key: string, start: number, stop: number): Promise<string[]>
  expire(key: string, seconds: number): Promise<unknown>
}

export type ChatService = {
  append(message: ChatMessage): Promise<void>
  list(): Promise<ChatMessage[]>
}

export function createChatService(redis: ChatRedis): ChatService {
  return {
    async append(message) {
      await redis.lPush(CHAT_KEY, JSON.stringify(message))
      // Trim on every write rather than periodically: the list can never
      // exceed the cap even briefly, so a burst cannot spike memory.
      await redis.lTrim(CHAT_KEY, 0, CHAT_BUFFER_SIZE - 1)
      // Refreshed on each write, so an idle room expires but a busy one never does.
      await redis.expire(CHAT_KEY, CHAT_TTL_SECONDS)
      if (process.env.DEBUG) console.log('[CHAT_SERVICE] append', { id: message.id })
    },

    async list() {
      const raw = await redis.lRange(CHAT_KEY, 0, -1)
      // LPUSH writes newest-to-head; a conversation reads oldest-first.
      return raw.reverse().map((entry) => JSON.parse(entry) as ChatMessage)
    },
  }
}
```

- [ ] **Step 4: Run it and confirm it passes**

Run: `npm run test -- apps/server/src/lib/services/chat.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/lib/services/chat.ts apps/server/src/lib/services/chat.test.ts
git commit -m "feat(api): chat message buffer on a capped Redis list"
```

---

### Task 4: `GET /api/v1/chat/messages`

The client loads the buffer over REST and *then* subscribes. Subscribing first and back-filling opens a window where a message arriving mid-fetch is duplicated or lost.

**Files:**
- Create: `apps/server/src/routes/v1/chat.ts`
- Create: `apps/server/src/routes/v1/chat.test.ts`
- Modify: `apps/server/src/routes/v1/index.ts`
- Modify: `apps/server/src/app.ts`
- Modify: `apps/server/src/index.ts`

**Interfaces:**
- Consumes: `ChatService` (Task 3), `requireAuth`.
- Produces: `createChatRouter(chatService: ChatService): Router`; `BuildAppOptions.chatService?: ChatService`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/server/src/routes/v1/chat.test.ts
import type { ChatMessage } from '@blog/zod-shared'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import type { ChatService } from '../../lib/services/chat.js'
import { buildTestApp } from '../../test/helpers.js'

const stored: ChatMessage[] = [
  { id: '1', body: 'first', author: { id: 'u1', username: 'demo' }, sentAt: '2026-07-29T00:00:00.000Z' },
]

const stubService: ChatService = {
  append: async () => undefined,
  list: async () => stored,
}

describe('GET /api/v1/chat/messages', () => {
  it('401s for an anonymous reader — chat is signed-in only', async () => {
    const app = buildTestApp({ chatService: stubService })
    const res = await request(app).get('/api/v1/chat/messages')
    expect(res.status).toBe(401)
  })

  it('returns the buffer for a signed-in reader', async () => {
    const app = buildTestApp({ chatService: stubService })
    const agent = request.agent(app)
    await agent.post('/api/v1/session-test/login').send({})

    const res = await agent.get('/api/v1/chat/messages')
    expect(res.status).toBe(200)
    expect(res.body).toEqual(stored)
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npm run test -- apps/server/src/routes/v1/chat.test.ts`
Expected: FAIL — `chatService` is not a valid `buildTestApp` option and the route 404s.

- [ ] **Step 3: Write the router**

```ts
// apps/server/src/routes/v1/chat.ts
import { Router } from 'express'
import type { ChatService } from '../../lib/services/chat.js'
import { requireAuth } from '../../middleware/require-auth.js'

/**
 * Takes the service rather than importing it: the Redis client is created at
 * the entry point, so the service cannot be a module-level singleton the way
 * the Mongoose-backed ones are.
 */
export function createChatRouter(chatService: ChatService): Router {
  const chatRouter = Router()

  // requireAuth, not optional: the wall covers the room itself, not just
  // posting into it (design §5).
  chatRouter.get('/messages', requireAuth, async (_req, res) => {
    res.json(await chatService.list())
  })

  return chatRouter
}
```

- [ ] **Step 4: Mount it on the app, not on the shared router**

`routes/v1/index.ts` needs **no change**. `v1Router` is a module-level singleton, so mounting chat onto it would stack a new router on every `buildApp` call — two tests with different stub services would both hit whichever registered first. Mount it on the app instead, where it is scoped to that app instance.

In `apps/server/src/app.ts`, add the import and the option:

```ts
import { createChatRouter } from './routes/v1/chat.js'
import type { ChatService } from './lib/services/chat.js'
```

```ts
  /** Absent in tests that do not exercise chat. */
  chatService?: ChatService
```

Then mount it immediately before `v1Router`:

```ts
  // On the app, not on v1Router: that router is a module singleton, and
  // mounting per-buildApp would leak one test's service into the next.
  if (opts.chatService) app.use('/api/v1/chat', createChatRouter(opts.chatService))
  app.use('/api/v1', v1Router)
```

- [ ] **Step 5: Run it and confirm it passes**

Run: `npm run test -- apps/server/src/routes/v1/chat.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 6: Wire the real service in `index.ts`**

```ts
import { createChatService } from './lib/services/chat.js'

  const chatService = createChatService(redis)

  const app = buildApp({
    sessionMiddleware,
    trustProxy: isProd,
    clientDist: env.CLIENT_DIST,
    chatService,
  })
```

- [ ] **Step 7: Gate and commit**

Run: `npm run typecheck && npm run lint && npm run test`
Expected: all pass.

```bash
git add apps/server/src/routes/v1/chat.ts apps/server/src/routes/v1/chat.test.ts apps/server/src/routes/v1/index.ts apps/server/src/app.ts apps/server/src/index.ts
git commit -m "feat(api): GET /chat/messages returns the recent buffer, auth required"
```

---

### Task 5: Socket.io server, session auth, and message broadcast

The core of the phase. Closes §14's *"chat messages use server-derived identity"*.

**Files:**
- Create: `apps/server/src/realtime/index.ts`
- Create: `apps/server/src/realtime/realtime.test.ts`
- Modify: `apps/server/package.json`
- Modify: `apps/server/src/index.ts`

**Interfaces:**
- Consumes: `ChatService`, `ChatMessageSchema`, `ChatMessage`, the session middleware from Task 1.
- Produces: `createRealtime(opts: { server: http.Server; sessionMiddleware: RequestHandler; chatService: ChatService }): Realtime` where `type Realtime = { io: Server; disconnectUser(userId: string): void; close(): Promise<void> }`.

- [ ] **Step 1: Install the dependencies**

```bash
npm install socket.io --workspace=@blog/server
npm install -D socket.io-client --workspace=@blog/server
```

`socket.io-client` is a devDependency here — the server workspace needs it only to drive integration tests. The client app installs its own copy in Task 7.

- [ ] **Step 2: Write the failing test**

```ts
// apps/server/src/realtime/realtime.test.ts
import { createServer, type Server as HttpServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { ChatMessage } from '@blog/zod-shared'
import session from 'express-session'
import request from 'supertest'
import { io as ioClient, type Socket } from 'socket.io-client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../app.js'
import { buildSessionMiddleware } from '../lib/session.js'
import type { ChatService } from '../lib/services/chat.js'
import { createRealtime, type Realtime } from './index.js'

const SECRET = 'test-only-secret-never-used-in-production-32c'

function stubChatService(): ChatService & { appended: ChatMessage[] } {
  const appended: ChatMessage[] = []
  return { appended, append: async (m) => void appended.push(m), list: async () => appended }
}

describe('realtime', () => {
  let httpServer: HttpServer
  let realtime: Realtime
  let chatService: ReturnType<typeof stubChatService>
  let url: string
  let app: ReturnType<typeof buildApp>
  const sockets: Socket[] = []

  beforeEach(async () => {
    chatService = stubChatService()
    const sessionMiddleware = buildSessionMiddleware({
      store: new session.MemoryStore(),
      secret: SECRET,
      secure: false,
    })
    app = buildApp({ sessionMiddleware, chatService })
    httpServer = createServer(app)
    realtime = createRealtime({ server: httpServer, sessionMiddleware, chatService })
    await new Promise<void>((resolve) => httpServer.listen(0, resolve))
    url = `http://localhost:${(httpServer.address() as AddressInfo).port}`
  })

  afterEach(async () => {
    sockets.forEach((s) => s.disconnect())
    sockets.length = 0
    await realtime.close()
    await new Promise<void>((resolve) => httpServer.close(() => resolve()))
  })

  /** Signs in over REST and returns the session cookie for the handshake. */
  async function signedInCookie(): Promise<string> {
    const res = await request(app).post('/api/v1/session-test/login').send({})
    return (res.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!
  }

  function connect(cookie?: string): Socket {
    const socket = ioClient(url, {
      transports: ['websocket'],
      extraHeaders: cookie ? { Cookie: cookie } : {},
    })
    sockets.push(socket)
    return socket
  }

  it('rejects an anonymous handshake', async () => {
    const socket = connect()
    const error = await new Promise<Error>((resolve) => socket.on('connect_error', resolve))
    expect(error.message).toBe('unauthorized')
  })

  it('accepts a handshake carrying a valid session cookie', async () => {
    const socket = connect(await signedInCookie())
    await new Promise<void>((resolve) => socket.on('connect', resolve))
    expect(socket.connected).toBe(true)
  })

  // THE regression (spec §14, legacy app.js:56). The payload's author must be
  // ignored entirely; the broadcast identity comes from the session.
  it('stamps the session identity and ignores an author in the payload', async () => {
    const socket = connect(await signedInCookie())
    await new Promise<void>((resolve) => socket.on('connect', resolve))

    const received = new Promise<ChatMessage>((resolve) => socket.on('message', resolve))
    socket.emit('message', { body: 'hello', author: { id: 'evil', username: 'admin' } })

    const message = await received
    // The session's identity, not the payload's. Asserted as two separate
    // claims because `toEqual` treats an undefined property as absent, so a
    // whole-object comparison could pass for the wrong reason.
    expect(message.author.id).toBe('user-123')
    expect(message.author.username).not.toBe('admin')
    expect(message.body).toBe('hello')
    expect(chatService.appended).toHaveLength(1)
  })

  it('rejects an empty message without broadcasting it', async () => {
    const socket = connect(await signedInCookie())
    await new Promise<void>((resolve) => socket.on('connect', resolve))

    const failure = new Promise<{ message: string }>((resolve) => socket.on('error', resolve))
    socket.emit('message', { body: '   ' })

    expect((await failure).message).toMatch(/empty/i)
    expect(chatService.appended).toHaveLength(0)
  })
})
```

> `/api/v1/session-test/login` is the existing non-production helper route in `routes/v1/index.ts`; it sets `userId` to `'user-123'` and no username, which is why the assertion expects `username: undefined`.

- [ ] **Step 3: Run it and confirm it fails**

Run: `npm run test -- apps/server/src/realtime/realtime.test.ts`
Expected: FAIL — `./index.js` does not exist.

- [ ] **Step 4: Implement `createRealtime`**

```ts
// apps/server/src/realtime/index.ts
import { randomUUID } from 'node:crypto'
import type { Server as HttpServer } from 'node:http'
import { ChatMessageSchema, type ChatMessage } from '@blog/zod-shared'
import type { RequestHandler } from 'express'
import { Server, type Socket } from 'socket.io'
import type { ChatService } from '../lib/services/chat.js'

export type RealtimeUser = { userId: string; username: string }

export type Realtime = {
  io: Server
  /** Ends every socket held by this user — used on logout. */
  disconnectUser(userId: string): void
  close(): Promise<void>
}

type CreateRealtimeOptions = {
  server: HttpServer
  /** The SAME instance Express uses, so the socket reads the same session. */
  sessionMiddleware: RequestHandler
  chatService: ChatService
}

/**
 * Socket.io on the app's own HTTP server. No CORS option: this is same-origin
 * by construction (design §2), and adding one would silently permit the
 * cross-origin case the design deliberately removed.
 */
export function createRealtime({
  server,
  sessionMiddleware,
  chatService,
}: CreateRealtimeOptions): Realtime {
  const io = new Server(server)

  // Runs the session middleware on the handshake request, so socket.request
  // carries the same session object a REST handler would see.
  io.engine.use(sessionMiddleware)

  io.use((socket, next) => {
    const session = socket.request.session
    if (!session?.userId) {
      next(new Error('unauthorized'))
      return
    }
    socket.data.user = { userId: session.userId, username: session.username }
    // One room per user, solely so logout can end their sockets without a
    // hand-maintained registry.
    socket.join(`user:${session.userId}`)
    next()
  })

  io.on('connection', (socket: Socket) => {
    const user = socket.data.user as RealtimeUser
    if (process.env.DEBUG) console.log('[REALTIME] connected', { userId: user.userId })

    socket.on('message', async (payload: unknown) => {
      const parsed = ChatMessageSchema.safeParse(payload)
      if (!parsed.success) {
        // Back to the sender only — a malformed message is not the room's business.
        socket.emit('error', { message: parsed.error.errors[0]?.message ?? 'Invalid message' })
        return
      }

      const message: ChatMessage = {
        id: randomUUID(),
        body: parsed.data.body,
        // From the socket's session, NEVER from the payload. Zod already
        // stripped any author the client sent; this is the second reason it
        // cannot be spoofed.
        author: { id: user.userId, username: user.username },
        sentAt: new Date().toISOString(),
      }

      await chatService.append(message)
      io.emit('message', message)
    })

    socket.on('disconnect', () => {
      if (process.env.DEBUG) console.log('[REALTIME] disconnected', { userId: user.userId })
    })
  })

  return {
    io,
    disconnectUser(userId) {
      io.in(`user:${userId}`).disconnectSockets()
    },
    close: () => io.close(),
  }
}
```

- [ ] **Step 5: Declare the session fields on Socket.io's request type**

`socket.request` is a Node `IncomingMessage`; `express-session` augments Express's `Request`. Add to `apps/server/src/types/express-session.d.ts` (create if absent — check for an existing `SessionData` augmentation first and extend that file instead of duplicating it):

```ts
import 'socket.io'

declare module 'http' {
  interface IncomingMessage {
    session?: { userId?: string; username?: string }
  }
}

declare module 'socket.io' {
  interface Socket {
    data: { user: { userId: string; username: string } }
  }
}
```

- [ ] **Step 6: Run it and confirm it passes**

Run: `npm run test -- apps/server/src/realtime/realtime.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 7: Wire it into the entry point**

Replace `app.listen(...)` in `index.ts`:

```ts
import { createServer } from 'node:http'
import { createRealtime } from './realtime/index.js'

  const server = createServer(app)
  createRealtime({ server, sessionMiddleware, chatService })

  server.listen(env.PORT, () => {
    console.log(`API listening on :${env.PORT} (${env.NODE_ENV})`)
  })
```

- [ ] **Step 8: Gate and commit**

Run: `npm run typecheck && npm run lint && npm run test`
Expected: all pass.

```bash
git add apps/server/src/realtime apps/server/src/index.ts apps/server/src/types apps/server/package.json package-lock.json
git commit -m "feat(api): Socket.io on the app server, authenticated by the session

Identity comes from socket.data.user, set once at the handshake from the
session. The payload schema has no author field and Zod strips unknown keys, so
a client cannot speak as another user — the legacy app.js:56 defect."
```

---

### Task 6: Presence, typing, and disconnect-on-logout

**Files:**
- Modify: `apps/server/src/realtime/index.ts`
- Modify: `apps/server/src/realtime/realtime.test.ts`
- Modify: `apps/server/src/app.ts`
- Modify: `apps/server/src/routes/v1/auth.ts`
- Modify: `apps/server/src/index.ts`

**Interfaces:**
- Produces: server→client events `presence` (`{ users: { id, username }[] }`) and `typing` (`{ userId, username, typing }`); client→server `typing` (`{ typing: boolean }`); `BuildAppOptions.disconnectUser?: (userId: string) => void`.

- [ ] **Step 1: Write the failing tests**

Append to `realtime.test.ts`:

```ts
  it('lists a user once even when they hold two sockets', async () => {
    const cookie = await signedInCookie()
    const first = connect(cookie)
    await new Promise<void>((resolve) => first.on('connect', resolve))

    const second = connect(cookie)
    const presence = await new Promise<{ users: { id: string }[] }>((resolve) =>
      second.on('presence', resolve),
    )

    expect(presence.users.filter((u) => u.id === 'user-123')).toHaveLength(1)
  })

  it('relays a typing signal without persisting it', async () => {
    const watcher = connect(await signedInCookie())
    await new Promise<void>((resolve) => watcher.on('connect', resolve))
    const typer = connect(await signedInCookie())
    await new Promise<void>((resolve) => typer.on('connect', resolve))

    const signal = new Promise<{ typing: boolean }>((resolve) => watcher.on('typing', resolve))
    typer.emit('typing', { typing: true })

    expect((await signal).typing).toBe(true)
    expect(chatService.appended).toHaveLength(0)
  })

  it('disconnects a user\'s sockets when asked', async () => {
    const socket = connect(await signedInCookie())
    await new Promise<void>((resolve) => socket.on('connect', resolve))

    const closed = new Promise<void>((resolve) => socket.on('disconnect', () => resolve()))
    realtime.disconnectUser('user-123')

    await closed
    expect(socket.connected).toBe(false)
  })
```

- [ ] **Step 2: Run them and confirm they fail**

Run: `npm run test -- apps/server/src/realtime/realtime.test.ts`
Expected: FAIL — no `presence` or `typing` event is ever emitted; the disconnect test times out.

- [ ] **Step 3: Add presence and typing to `createRealtime`**

Add above `io.on('connection', ...)`:

```ts
  /**
   * Derived from the live socket set, never stored. One process with no Redis
   * adapter means io.sockets already is the authoritative answer, and
   * Socket.io's ping/pong timeout already fires `disconnect` for a dead client —
   * so a Redis set plus application heartbeats would reimplement, worse, two
   * things that already work (design §4).
   *
   * Deduplicated by userId: two tabs are one person online.
   */
  function broadcastPresence(): void {
    const byId = new Map<string, { id: string; username: string }>()
    for (const socket of io.sockets.sockets.values()) {
      const user = socket.data.user as RealtimeUser | undefined
      if (user) byId.set(user.userId, { id: user.userId, username: user.username })
    }
    io.emit('presence', { users: [...byId.values()] })
  }
```

Inside the `connection` handler, call `broadcastPresence()` immediately, add the typing relay, and call it again on disconnect:

```ts
    broadcastPresence()

    socket.on('typing', (payload: unknown) => {
      const typing = Boolean((payload as { typing?: unknown } | null)?.typing)
      // Broadcast and forget. Writing the highest-frequency, lowest-value event
      // in the app into a 25 MB store would be a poor trade (design §5).
      socket.broadcast.emit('typing', {
        userId: user.userId,
        username: user.username,
        typing,
      })
    })
```

```ts
    socket.on('disconnect', () => {
      if (process.env.DEBUG) console.log('[REALTIME] disconnected', { userId: user.userId })
      broadcastPresence()
    })
```

- [ ] **Step 4: Run them and confirm they pass**

Run: `npm run test -- apps/server/src/realtime/realtime.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Disconnect sockets on logout**

Reading the session live revokes *new* connections; an open socket keeps its identity in memory. Add the option to `app.ts`:

```ts
  /** Ends a user's sockets on logout. Absent in tests without realtime. */
  disconnectUser?: (userId: string) => void
```

The logout handler reads it off the app rather than importing it, so no module-level state is involved and each app instance carries its own. In `routes/v1/auth.ts`:

```ts
authRouter.post('/logout', requireAuth, async (req, res) => {
  const userId = req.session.userId
  await destroySession(req)
  res.clearCookie('sid')
  // The session is gone, but a socket opened before now still holds its
  // identity in memory. Without this, logout leaves a live authenticated
  // socket behind.
  const disconnectUser = req.app.get('disconnectUser') as ((id: string) => void) | undefined
  if (userId && disconnectUser) disconnectUser(userId)
  res.status(204).end()
})
```

In `app.ts`, register it: `if (opts.disconnectUser) app.set('disconnectUser', opts.disconnectUser)`.

- [ ] **Step 6: Wire the late binding in `index.ts`**

`createRealtime` needs the HTTP server, which needs the app — so the app needs a reference that resolves later:

```ts
  let realtime: Realtime | undefined
  const app = buildApp({
    sessionMiddleware,
    trustProxy: isProd,
    clientDist: env.CLIENT_DIST,
    chatService,
    disconnectUser: (userId) => realtime?.disconnectUser(userId),
  })
  const server = createServer(app)
  realtime = createRealtime({ server, sessionMiddleware, chatService })
```

The closure defers resolution past the assignment. The `?.` can never actually be hit, because no request is served before `listen()`.

- [ ] **Step 7: Add the logout integration test**

Append to `realtime.test.ts`:

```ts
  it('ends the socket when the user logs out over REST', async () => {
    const cookie = await signedInCookie()
    const socket = connect(cookie)
    await new Promise<void>((resolve) => socket.on('connect', resolve))

    const closed = new Promise<void>((resolve) => socket.on('disconnect', () => resolve()))
    await request(app).post('/api/v1/auth/logout').set('Cookie', cookie)

    await closed
    expect(socket.connected).toBe(false)
  })
```

This requires the test's `buildApp` call to pass `disconnectUser: (id) => realtime.disconnectUser(id)` — add it, using a `let realtime` declared before `beforeEach` as in Step 6.

- [ ] **Step 8: Gate and commit**

Run: `npm run typecheck && npm run lint && npm run test`
Expected: all pass.

```bash
git add apps/server/src/realtime apps/server/src/app.ts apps/server/src/routes/v1/auth.ts apps/server/src/index.ts
git commit -m "feat(api): in-memory presence, typing relay, and logout disconnects sockets"
```

---

### Task 7: The `useChat` hook

Both remaining §14 chat items are React lifecycle defects, which is why the socket is a designed unit rather than inline effect code.

**Files:**
- Create: `apps/client/src/hooks/use-chat.ts`
- Create: `apps/client/src/hooks/use-chat.test.tsx`
- Modify: `apps/client/package.json`

**Interfaces:**
- Produces: `useChat(): { messages: ChatMessage[]; online: ChatUser[]; typingUsers: string[]; status: ChatStatus; send(body: string): void; setTyping(typing: boolean): void }` where `type ChatStatus = 'connecting' | 'connected' | 'reconnecting' | 'failed'`.

- [ ] **Step 1: Install the client dependency**

```bash
npm install socket.io-client --workspace=@blog/client
```

- [ ] **Step 2: Write the failing test**

```tsx
// apps/client/src/hooks/use-chat.test.tsx
import '@testing-library/jest-dom/vitest'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const handlers = new Map<string, (payload: unknown) => void>()
const socket = {
  connected: false,
  connect: vi.fn(),
  disconnect: vi.fn(),
  emit: vi.fn(),
  on: vi.fn((event: string, fn: (payload: unknown) => void) => {
    handlers.set(event, fn)
    return socket
  }),
  off: vi.fn((event: string) => {
    handlers.delete(event)
    return socket
  }),
}

vi.mock('socket.io-client', () => ({ io: vi.fn(() => socket) }))

const { useChat } = await import('./use-chat.js')

describe('useChat', () => {
  afterEach(() => {
    handlers.clear()
    vi.clearAllMocks()
    cleanup()
  })

  it('appends a broadcast message', async () => {
    const { result } = renderHook(() => useChat())
    act(() => {
      handlers.get('message')?.({
        id: '1',
        body: 'hello',
        author: { id: 'u1', username: 'demo' },
        sentAt: '2026-07-29T00:00:00.000Z',
      })
    })
    await waitFor(() => expect(result.current.messages).toHaveLength(1))
    expect(result.current.messages[0]?.body).toBe('hello')
  })

  // Legacy chat.jsx:51 registered a listener per message received, so every
  // message was handled N times and the count grew with the conversation.
  it('removes every listener it registered on unmount', () => {
    const { unmount } = renderHook(() => useChat())
    const registered = socket.on.mock.calls.map(([event]) => event)

    unmount()

    const removed = socket.off.mock.calls.map(([event]) => event)
    for (const event of registered) expect(removed).toContain(event)
    expect(handlers.size).toBe(0)
  })

  // Legacy chat.jsx:57 emitted disconnect on every render.
  it('does not reconnect or disconnect on re-render', () => {
    const { rerender } = renderHook(() => useChat())
    const connectsAfterMount = socket.connect.mock.calls.length

    rerender()
    rerender()

    expect(socket.connect).toHaveBeenCalledTimes(connectsAfterMount)
    expect(socket.disconnect).not.toHaveBeenCalled()
  })

  it('sends the body only — the server stamps the author', () => {
    const { result } = renderHook(() => useChat())
    act(() => result.current.send('  hi  '))
    expect(socket.emit).toHaveBeenCalledWith('message', { body: 'hi' })
  })
})
```

- [ ] **Step 3: Run it and confirm it fails**

Run: `npm run test -- apps/client/src/hooks/use-chat.test.tsx`
Expected: FAIL — `./use-chat.js` does not exist.

- [ ] **Step 4: Implement the hook**

```ts
// apps/client/src/hooks/use-chat.ts
import type { ChatMessage } from '@blog/zod-shared'
import { useCallback, useEffect, useRef, useState } from 'react'
import { io, type Socket } from 'socket.io-client'
import { DEBUG } from '../lib/constants.js'

export type ChatUser = { id: string; username: string }
export type ChatStatus = 'connecting' | 'connected' | 'reconnecting' | 'failed'

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [online, setOnline] = useState<ChatUser[]>([])
  const [typingUsers, setTypingUsers] = useState<string[]>([])
  const [status, setStatus] = useState<ChatStatus>('connecting')

  // Held in a ref, created once. Creating it during render would open a
  // connection per render — the shape of the legacy chat.jsx:57 defect.
  const socketRef = useRef<Socket | null>(null)
  if (socketRef.current === null) {
    socketRef.current = io({ autoConnect: false, transports: ['websocket'] })
  }

  useEffect(() => {
    const socket = socketRef.current
    if (!socket) return

    const onConnect = () => setStatus('connected')
    const onDisconnect = () => setStatus('reconnecting')
    const onConnectError = () => setStatus('failed')
    const onMessage = (message: ChatMessage) => setMessages((prev) => [...prev, message])
    const onPresence = ({ users }: { users: ChatUser[] }) => setOnline(users)
    const onTyping = ({ username, typing }: { username: string; typing: boolean }) =>
      setTypingUsers((prev) =>
        typing ? [...new Set([...prev, username])] : prev.filter((u) => u !== username),
      )
    const onError = ({ message }: { message: string }) => {
      if (DEBUG) console.warn('[CHAT] rejected', message)
    }

    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    socket.on('connect_error', onConnectError)
    socket.on('message', onMessage)
    socket.on('presence', onPresence)
    socket.on('typing', onTyping)
    socket.on('error', onError)
    socket.connect()

    // Every `on` above has an `off` here. The legacy chat.jsx:51 grew its
    // listener count with the conversation because it had no cleanup.
    return () => {
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      socket.off('connect_error', onConnectError)
      socket.off('message', onMessage)
      socket.off('presence', onPresence)
      socket.off('typing', onTyping)
      socket.off('error', onError)
      socket.disconnect()
    }
  }, [])

  const send = useCallback((body: string) => {
    const trimmed = body.trim()
    if (!trimmed) return
    // Body only. The author is stamped server-side from the session.
    socketRef.current?.emit('message', { body: trimmed })
  }, [])

  const setTyping = useCallback((typing: boolean) => {
    socketRef.current?.emit('typing', { typing })
  }, [])

  return { messages, online, typingUsers, status, send, setTyping }
}
```

- [ ] **Step 5: Run it and confirm it passes**

Run: `npm run test -- apps/client/src/hooks/use-chat.test.tsx`
Expected: PASS, 4 tests. The unmount test also calls `socket.disconnect()` once, which is correct — the "does not disconnect on re-render" test asserts it is not called *while mounted*.

- [ ] **Step 6: Commit**

```bash
git add apps/client/src/hooks/use-chat.ts apps/client/src/hooks/use-chat.test.tsx apps/client/package.json package-lock.json
git commit -m "feat(client): useChat — socket created once, every listener cleaned up"
```

---

### Task 8: `ChatPage`, route, and navigation

**Files:**
- Create: `apps/client/src/pages/ChatPage.tsx`
- Modify: `apps/client/src/routes.tsx`
- Modify: `apps/client/src/components/layouts/PageShell.tsx`

**Interfaces:**
- Consumes: `useChat` (Task 7), `RequireAuth`, `Button`, `Input`.

- [ ] **Step 1: Write `ChatPage`**

```tsx
// apps/client/src/pages/ChatPage.tsx
import { useState } from 'react'
import { Button } from '../components/ui/button.js'
import { Input } from '../components/ui/input.js'
import { useChat } from '../hooks/use-chat.js'

const STATUS_LABEL = {
  connecting: 'Connecting…',
  connected: '',
  reconnecting: 'Reconnecting…',
  failed: 'Could not connect. Reload to try again.',
} as const

export function ChatPage() {
  const { messages, online, typingUsers, status, send, setTyping } = useChat()
  const [draft, setDraft] = useState('')

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    send(draft)
    setDraft('')
    setTyping(false)
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 p-4">
      <header className="flex items-baseline justify-between">
        <h1 className="text-2xl font-bold">Chat</h1>
        <p className="text-xs text-[var(--muted-foreground)]">{online.length} online</p>
      </header>

      {/* The service sleeps when idle and cold-starts in ~60s, so a silent
          page is indistinguishable from a broken one. Say what is happening. */}
      {STATUS_LABEL[status] && (
        <p className="text-xs text-[var(--muted-foreground)]">{STATUS_LABEL[status]}</p>
      )}

      <ul className="flex flex-col gap-2">
        {messages.map((m) => (
          <li key={m.id} className="text-sm">
            {/* Plain text, not Markdown: a fast room does not need tables, and
                it removes the question of what a link in chat should do. */}
            <span className="font-semibold">{m.author.username}</span> {m.body}
          </li>
        ))}
      </ul>

      <p className="h-4 text-xs text-[var(--muted-foreground)]">
        {typingUsers.length > 0 && `${typingUsers.join(', ')} typing…`}
      </p>

      <form onSubmit={submit} className="flex gap-2">
        <Input
          aria-label="Message"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value)
            setTyping(e.target.value.length > 0)
          }}
          disabled={status === 'failed'}
        />
        <Button type="submit" disabled={draft.trim().length === 0 || status !== 'connected'}>
          Send
        </Button>
      </form>
    </div>
  )
}
```

- [ ] **Step 2: Add the route**

In `apps/client/src/routes.tsx`, import `ChatPage` and `RequireAuth`, then add to `children`:

```tsx
      {
        path: '/chat',
        element: (
          <RequireAuth>
            <ChatPage />
          </RequireAuth>
        ),
      },
```

`RequireAuth` is a UX redirect only — the socket handshake in Task 5 is what enforces it.

- [ ] **Step 3: Add the nav link**

In `PageShell.tsx`, add a `Chat` link beside the existing `New Post` link, rendered only when `useMe()` resolves a user. Match the surrounding link markup exactly rather than inventing new classes.

- [ ] **Step 4: Gate and commit**

Run: `npm run typecheck && npm run lint && npm run test`
Expected: all pass.

```bash
git add apps/client/src/pages/ChatPage.tsx apps/client/src/routes.tsx apps/client/src/components/layouts/PageShell.tsx
git commit -m "feat(client): chat page, guarded route, and nav link"
```

---

### Task 9: WebSocket proxying in dev

**Files:**
- Modify: `apps/client/vite.config.ts`

- [ ] **Step 1: Add the socket.io proxy entry**

The client connects to its own origin (`io()` with no URL), so in dev that is Vite on `:5173`. Vite must forward the Socket.io path to the API container, and `ws: true` is required or the upgrade fails:

```ts
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:3000',
        changeOrigin: false,
      },
      // Socket.io's own endpoint, not under /api. `ws: true` proxies the
      // upgrade; without it the handshake polls forever and never upgrades.
      '/socket.io': {
        target: process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:3000',
        changeOrigin: false,
        ws: true,
      },
    },
```

- [ ] **Step 2: Verify against the running stack**

Run: `npm run dev`
Then open `http://localhost:5173/chat` signed in, and confirm in DevTools → Network → WS that a `101 Switching Protocols` upgrade succeeds and a sent message appears in a second browser window.

If nothing appears, the container is serving stale code before the code is wrong — use the `docker-compose-rebuild` skill first.

- [ ] **Step 3: Commit**

```bash
git add apps/client/vite.config.ts
git commit -m "build(client): proxy the socket.io upgrade to the API in dev"
```

---

### Task 10: E2E — two browser contexts

**Files:**
- Create: `e2e/chat.spec.ts`

- [ ] **Step 1: Write the test**

```ts
import { expect, test } from '@playwright/test'

/**
 * Two independent browser contexts, so each has its own cookie jar and its own
 * session — the only way to prove a message actually crosses the server rather
 * than being echoed locally.
 */
test('two signed-in users exchange a message', async ({ browser }) => {
  const stamp = Date.now()

  async function signUp(name: string) {
    const context = await browser.newContext()
    const page = await context.newPage()
    await page.goto('/signup')
    await page.getByLabel('Username').fill(name)
    await page.getByLabel('Email').fill(`${name}@example.com`)
    // exact: true — "Confirm password" also contains "Password".
    await page.getByLabel('Password', { exact: true }).fill('a-valid-password')
    await page.getByLabel('Confirm password').fill('a-valid-password')
    await page.getByRole('button', { name: 'Sign Up' }).click()
    await expect(page).toHaveURL('/')
    return page
  }

  const alice = await signUp(`e2e-a-${stamp}`)
  const bob = await signUp(`e2e-b-${stamp}`)

  await alice.goto('/chat')
  await bob.goto('/chat')
  // The Send button enables only once the socket reports connected.
  await expect(alice.getByRole('button', { name: 'Send' })).toBeEnabled()
  await expect(bob.getByRole('button', { name: 'Send' })).toBeEnabled()

  await alice.getByLabel('Message').fill('hello from alice')
  await alice.getByRole('button', { name: 'Send' }).click()

  await expect(bob.getByText('hello from alice')).toBeVisible()
  // Stamped with the sender's session identity, not anything the client sent.
  await expect(bob.getByText(`e2e-a-${stamp}`)).toBeVisible()
})
```

- [ ] **Step 2: Run it**

Run: `npm run test:e2e -- e2e/chat.spec.ts`
Expected: PASS. This builds the production image, so it exercises the same single-service topology that ships.

- [ ] **Step 3: Commit**

```bash
git add e2e/chat.spec.ts
git commit -m "test(e2e): a message crosses the server between two browser contexts"
```

---

### Task 11: Final gate and documentation

**Files:**
- Modify: `README.md`
- Modify: `docs/architecture/deployment-architecture.md`
- Modify: `docs/superpowers/specs/2026-07-16-express-react-rebuild-design.md` (§14 checklist)

- [ ] **Step 1: Tick the three §14 chat items**

In the main spec's §14, mark each with what closed it:

- Chat messages use server-derived identity → `realtime.test.ts`, "stamps the session identity and ignores an author in the payload"
- Socket listeners are cleaned up → `use-chat.test.tsx`, "removes every listener it registered on unmount"
- Chat does not emit `disconnect` on every render → `use-chat.test.tsx`, "does not reconnect or disconnect on re-render"

- [ ] **Step 2: Move chat out of the README's "Not yet built"**

Add to **Core features**: `**Realtime chat** — one room, signed-in only, with presence and typing indicators; messages live in Redis, not MongoDB.`

Remove chat from the "Not yet built" note, leaving OAuth and media uploads. Add the socket to the architecture Mermaid diagram as part of the existing `apps/server` node — not a new service.

- [ ] **Step 3: Update `deployment-architecture.md`**

Flip the realtime row from planned to built, and record that it runs in the API service rather than its own.

- [ ] **Step 4: Full gate**

Run: `npm ci && npm run typecheck && npm run lint && npm run build && npm run test && npm run test:e2e`
Expected: all pass, no skips.

- [ ] **Step 5: Commit**

```bash
git add README.md docs/
git commit -m "docs: chat is built — tick the §14 chat items and update the README"
```

- [ ] **Step 6: STOP — open a PR, do not merge**

Report: P4 complete, all three §14 chat regressions closed and covered. Open a PR to `staging`. **Do not merge to `master` and do not deploy** — that requires explicit per-time approval.

Raise at that point: **risk §12.1 of the design is still open.** Nothing keeps the service warm, so the first chat visitor after 15 idle minutes waits ~60 s. The connecting state from Task 8 is currently the entire mitigation. Decide before promotion whether to add an external pinger.

---

## Self-Review Notes

**Spec coverage.** §2 architecture → Tasks 1, 5, 9; §3 auth and logout revocation → Tasks 5, 6; §4 Redis buffer and in-memory presence → Tasks 3, 6; §5 REST and socket API → Tasks 2, 4, 5, 6; §6 client lifecycle → Tasks 7, 8; §7 errors → Task 5 Step 4 (sender-only `error` event); §8 testing → every task plus Task 10; §9 configuration → Task 9 (no new env vars, so nothing else to do); §10 doc amendments → already landed in commit `10f7e04c`, with the README's remaining move handled in Task 11; §11 sequencing → Task 11 Step 6; §12 risks → surfaced at Task 11 Step 6.

**Type consistency.** `ChatMessage` is defined once in Task 2 and consumed unchanged in Tasks 3, 5, 7, 8. `ChatService` is defined in Task 3 and consumed in Tasks 4, 5. `RealtimeUser` in Task 5 is reused by Task 6's `broadcastPresence`. The presence payload is `{ users: { id, username }[] }` in Tasks 6, 7 and 8 alike — note it is `id`, not `userId`, on the wire, while `socket.data.user` uses `userId` internally.

**Known deviation from the codebase's patterns, deliberate.** `chatService` is a factory while `postService` and friends are plain objects. Mongoose models are module-level singletons a service can import; the Redis client is built at the entry point, so injection is what makes Task 3 testable without a live Redis. Task 3 states this inline so it does not read as inconsistency.

**Three defects found by this review and fixed inline**, recorded because each would have surfaced as a confusing failure mid-implementation rather than an obvious one:

1. **Task 4 mounted the chat router onto the module-level `v1Router`.** Every `buildApp` call would have stacked another router onto the same shared instance, so the first stub service registered would answer for every later test — a cross-test leak that looks like a caching bug. Now mounted on the app.
2. **Task 6 offered two ways to wire `disconnectUser`** (module state vs reading it off the app) and left the choice to the implementer. A plan states one. The module-state variant also reintroduced defect 1's problem.
3. **Task 5's identity assertion used `toEqual` against `username: undefined`.** Vitest treats an undefined property as absent, so the assertion would also have passed if the author were dropped entirely — it would not have caught a real regression. Split into two explicit claims.

**Not in this plan, by design.** No message cap and no rate limit — the `LTRIM` buffer is self-limiting for storage, and the design accepts that a flooder can drown the visible conversation (risk §12.2). No Socket.io Redis adapter, no `apps/realtime`, no handshake ticket.

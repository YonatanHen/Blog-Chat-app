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
    // The broadcast and the persisted record must carry the same identity —
    // not just the same length of stored messages.
    expect(chatService.appended[0]!.author.id).toBe('user-123')
  })

  it('rejects an empty message without broadcasting it', async () => {
    const socket = connect(await signedInCookie())
    await new Promise<void>((resolve) => socket.on('connect', resolve))

    const failure = new Promise<{ message: string }>((resolve) => socket.on('error', resolve))
    socket.emit('message', { body: '   ' })

    expect((await failure).message).toMatch(/empty/i)
    expect(chatService.appended).toHaveLength(0)
  })

  // Regression guard for the process-killing bug: Socket.io does not await or
  // catch handler promises, so an uncaught rejection from chatService.append
  // (e.g. a Redis blip) would become an unhandled rejection and, under
  // Node's default flags, terminate the process — every other socket and all
  // REST traffic with it. This asserts the three properties the try/catch
  // fix guarantees, not just that "something" happened.
  it('recovers from a failed append: errors the sender, never broadcasts, and stays connected', async () => {
    const socket = connect(await signedInCookie())
    await new Promise<void>((resolve) => socket.on('connect', resolve))

    // Same chatService instance the running realtime already closed over —
    // reassigning append simulates a persistence failure (e.g. Redis down)
    // for this one message, without touching the stub used by every passing
    // test above.
    chatService.append = async () => {
      throw new Error('redis unavailable')
    }

    let broadcast = false
    socket.on('message', () => {
      broadcast = true
    })

    const failure = new Promise<{ message: string }>((resolve) => socket.on('error', resolve))
    socket.emit('message', { body: 'this will fail to persist' })

    // Property 1: the sender gets an error event, not silence.
    expect((await failure).message).toMatch(/could not send|try again/i)

    // Give a wrongly-scheduled broadcast a chance to arrive before asserting
    // its absence — the assertion above only proves the catch branch ran,
    // not that the emit branch was skipped.
    await new Promise((resolve) => setTimeout(resolve, 100))

    // Property 2: a message that was never persisted must never reach
    // anyone's room. This is the property most likely to rot under a future
    // refactor, so it is asserted directly rather than inferred from the
    // error event alone.
    expect(broadcast).toBe(false)
    expect(chatService.appended).toHaveLength(0)

    // Property 3: the rejection was actually caught, not merely deferred —
    // the socket is still connected and the server keeps working afterward.
    expect(socket.connected).toBe(true)

    chatService.append = async (m) => void chatService.appended.push(m)
    const received = new Promise<ChatMessage>((resolve) => socket.on('message', resolve))
    socket.emit('message', { body: 'still works' })
    const message = await received
    expect(message.body).toBe('still works')
    expect(chatService.appended).toHaveLength(1)
  })
})

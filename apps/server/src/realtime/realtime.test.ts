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
    app = buildApp({
      sessionMiddleware,
      chatService,
      disconnectUser: (id) => realtime.disconnectUser(id),
    })
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

  /**
   * Signs in over REST and returns the session cookie for the handshake.
   * `userId` defaults to the fixed 'user-123' every other test in this file
   * uses; pass one explicitly to stand up a second, distinct identity.
   */
  async function signedInCookie(userId?: string): Promise<string> {
    const res = await request(app)
      .post('/api/v1/session-test/login')
      .send(userId ? { userId } : {})
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

  // Design §8: presence must reflect connect AND disconnect. Two distinct
  // identities on purpose — with one shared identity, dedup would keep the
  // user listed via a second socket, and the assertion below would pass for
  // the wrong reason.
  it('removes a user from presence when their socket disconnects', async () => {
    const watcher = connect(await signedInCookie('watcher-1'))
    await new Promise<void>((resolve) => watcher.on('connect', resolve))

    const leaver = connect(await signedInCookie('leaver-1'))
    await new Promise<void>((resolve) => leaver.on('connect', resolve))

    // The presence broadcast triggered by leaver's own connection is still in
    // flight to watcher at this point (it's a separate round trip from the
    // client-side 'connect' event above). Wait for it explicitly so the
    // listener registered below can only be resolved by the DISCONNECT
    // broadcast, not race the connect one.
    await new Promise<void>((resolve) => {
      watcher.on('presence', function onConnectPresence({ users }: { users: { id: string }[] }) {
        if (users.some((u) => u.id === 'leaver-1')) {
          watcher.off('presence', onConnectPresence)
          resolve()
        }
      })
    })

    const presence = new Promise<{ users: { id: string }[] }>((resolve) =>
      watcher.on('presence', resolve),
    )
    leaver.disconnect()

    const ids = (await presence).users.map((u) => u.id)
    expect(ids).not.toContain('leaver-1')
    expect(ids).toContain('watcher-1')
  })

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

  it('ends the socket when the user logs out over REST', async () => {
    const cookie = await signedInCookie()
    const socket = connect(cookie)
    await new Promise<void>((resolve) => socket.on('connect', resolve))

    const closed = new Promise<void>((resolve) => socket.on('disconnect', () => resolve()))
    await request(app).post('/api/v1/auth/logout').set('Cookie', cookie)

    await closed
    expect(socket.connected).toBe(false)
  })
})

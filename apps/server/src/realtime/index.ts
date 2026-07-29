import { randomUUID } from 'node:crypto'
import type { IncomingMessage, Server as HttpServer } from 'node:http'
import { ChatMessageSchema, type ChatMessage } from '@blog/zod-shared'
import type { RequestHandler } from 'express'
import { Server, type DefaultEventsMap, type Socket } from 'socket.io'
import type { ChatService } from '../lib/services/chat.js'

/**
 * `username` is optional here, honestly: the handshake guard below only
 * requires `userId`, and the `session-test` helper route (and, in principle,
 * any future session path) can produce a session with no username. Typing
 * this as a required `string` would be a lie the compiler can't catch.
 */
export type RealtimeUser = { userId: string; username?: string }

/**
 * `socket.data`'s shape. Socket.io declares `Socket<..., SocketData = any>` —
 * a non-generic `interface Socket { data: {...} }` augmentation does NOT
 * override that generic default (verified: it silently resolves to `any`
 * and no cast off it is visible to `no-explicit-any`). Parameterising the
 * `Server`/`Socket` generics is the only way to type `socket.data` for real.
 */
type RealtimeSocketData = { user: RealtimeUser }
type RealtimeServer = Server<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, RealtimeSocketData>
type RealtimeSocket = Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, RealtimeSocketData>

/**
 * `socket.request` is the raw Node `IncomingMessage` from the handshake, after
 * `sessionMiddleware` has run over it via `io.engine.use`. Widened locally
 * rather than through a global `declare module 'http'` augmentation — that
 * would collide with express-session's own `Express.Request.session` typing
 * (Express's `Request` extends both `Express.Request` and `IncomingMessage`)
 * and silently break `req.session` typing everywhere else in the app.
 */
type SessionRequest = IncomingMessage & {
  session?: { userId?: string; username?: string }
}

export type Realtime = {
  io: RealtimeServer
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
  const io = new Server<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, RealtimeSocketData>(
    server,
  )

  // Runs the session middleware on the handshake request, so socket.request
  // carries the same session object a REST handler would see.
  io.engine.use(sessionMiddleware)

  io.use((socket, next) => {
    const session = (socket.request as SessionRequest).session
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

  io.on('connection', (socket: RealtimeSocket) => {
    const user = socket.data.user
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

      // Socket.io does not await or catch handler promises — an uncaught
      // rejection here (e.g. a Redis blip) becomes an unhandled rejection
      // that, under Node's default flags, kills the whole process. Caught
      // here and reported to the sender instead; the room never sees a
      // message that was not actually persisted.
      try {
        await chatService.append(message)
      } catch {
        if (process.env.DEBUG) console.error('[REALTIME] append failed', { id: message.id })
        socket.emit('error', { message: 'Could not send message. Please try again.' })
        return
      }

      io.emit('message', message)
      if (process.env.DEBUG) console.log('[REALTIME] broadcast', { id: message.id })
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

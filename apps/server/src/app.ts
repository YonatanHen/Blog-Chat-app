import express from 'express'
import helmet from 'helmet'
import type { ChatService } from './lib/services/chat.js'
import { errorHandler } from './middleware/error-handler.js'
import { notFound } from './middleware/not-found.js'
import { createChatRouter } from './routes/v1/chat.js'
import { v1Router } from './routes/v1/index.js'
import { mountStatic } from './static.js'

export type BuildAppOptions = {
  /** Prebuilt so the Socket.io server can share this exact instance. */
  sessionMiddleware?: express.RequestHandler
  /** Behind Render's proxy this must be set, or Secure cookies are dropped. */
  trustProxy?: boolean
  /** Directory holding the built SPA. Absent in P1 — there is no client yet. */
  clientDist?: string
  /** Absent in tests that do not exercise chat. */
  chatService?: ChatService
  /** Ends a user's sockets on logout. Absent in tests without realtime. */
  disconnectUser?: (userId: string) => void
}

/**
 * Builds the Express app. Order is load-bearing and asserted by app.test.ts:
 *   helmet → json → session → routers → 404 → error handler
 */
export function buildApp(opts: BuildAppOptions): express.Express {
  const app = express()

  if (opts.trustProxy) {
    // Render terminates TLS at a proxy. Without this Express sees the proxy's
    // IP, marks the connection insecure, and silently drops the Secure cookie.
    app.set('trust proxy', 1)
  }

  app.use(helmet())
  app.use(express.json({ limit: '100kb' }))

  if (opts.sessionMiddleware) {
    app.use(opts.sessionMiddleware)
  }

  if (opts.disconnectUser) app.set('disconnectUser', opts.disconnectUser)

  // On the app, not on v1Router: that router is a module singleton, and
  // mounting per-buildApp would leak one test's service into the next.
  if (opts.chatService) app.use('/api/v1/chat', createChatRouter(opts.chatService))
  app.use('/api/v1', v1Router)
  if (opts.clientDist) mountStatic(app, opts.clientDist)
  app.use(notFound)
  app.use(errorHandler)

  return app
}
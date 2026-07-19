import express from 'express'
import helmet from 'helmet'
import { buildSessionMiddleware, type SessionOptions } from './lib/session.js'
import { errorHandler } from './middleware/error-handler.js'
import { notFound } from './middleware/not-found.js'
import { v1Router } from './routes/v1/index.js'

export type BuildAppOptions = {
  session?: SessionOptions
  /** Behind Render's proxy this must be set, or Secure cookies are dropped. */
  trustProxy?: boolean
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

  if (opts.session) {
    app.use(buildSessionMiddleware(opts.session))
  }

  app.use('/api/v1', v1Router)
  // static SPA catch-all goes here
  app.use(notFound)
  app.use(errorHandler)

  return app
}
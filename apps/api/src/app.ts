import express from 'express'
import type session from 'express-session'
import helmet from 'helmet'
import { errorHandler } from './middleware/error-handler.js'
import { notFound } from './middleware/not-found.js'
import { v1Router } from './routes/v1/index.js'

export type BuildAppOptions = {
  /**
   * Session store. The composition root passes RedisStore; integration tests
   * pass express-session's MemoryStore so the suite needs no Redis container.
   */
  sessionStore?: session.Store
  /** Behind Render's proxy this must be set, or Secure cookies are dropped. */
  trustProxy?: boolean
}

/**
 * Builds the Express app. Order is load-bearing and asserted by app.test.ts:
 *   helmet → json → session → routers → 404 → error handler
 */
export function buildApp(_opts: BuildAppOptions): express.Express {
  const app = express()

  app.use(helmet())
  app.use(express.json({ limit: '100kb' }))
  // session goes here
  app.use('/api/v1', v1Router)
  // static SPA catch-all goes here
  app.use(notFound)
  app.use(errorHandler)

  return app
}

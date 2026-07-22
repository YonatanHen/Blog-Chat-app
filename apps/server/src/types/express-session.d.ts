import 'express-session'

declare module 'express-session' {
  interface SessionData {
    /** The ONLY source of caller identity. Never read identity from a body field. */
    userId?: string
    username?: string
  }
}

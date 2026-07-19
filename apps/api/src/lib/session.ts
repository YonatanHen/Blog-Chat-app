import session from 'express-session'
import type { RequestHandler } from 'express'

const ONE_WEEK_MS = 1000 * 60 * 60 * 24 * 7

export type SessionOptions = {
  store: session.Store
  secret: string
  /** true in production only: a Secure cookie is dropped over plain http://. */
  secure: boolean
}

export function buildSessionMiddleware({ store, secret, secure }: SessionOptions): RequestHandler {
  return session({
    store,
    secret,
    name: 'sid', // not the default connect.sid — don't advertise the stack
    resave: false,
    // Do NOT persist a session for a request that never wrote to it. Otherwise
    // every anonymous read allocates a Redis key on a 25 MB instance.
    saveUninitialized: false,
    cookie: {
      httpOnly: true, // JS cannot read it — removes the legacy XSS token-theft path
      sameSite: 'lax', // the CSRF defense; sufficient ONLY because we are same-origin
      secure,
      maxAge: ONE_WEEK_MS,
      path: '/',
    },
  })
}

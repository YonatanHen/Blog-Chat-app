import 'express-session'
import 'socket.io'

declare module 'express-session' {
  interface SessionData {
    /** The ONLY source of caller identity. Never read identity from a body field. */
    userId?: string
    username?: string
  }
}

declare module 'socket.io' {
  interface Socket {
    data: { user: { userId: string; username: string } }
  }
}

import { createServer } from 'node:http'
import { connectDb } from './lib/db.js'
import { RedisStore } from 'connect-redis' // NAMED export in v9 — there is no default
import { loadEnv } from './lib/env.js'
import { getRedis } from './lib/redis.js'
import { createChatService } from './lib/services/chat.js'
import { buildSessionMiddleware } from './lib/session.js'
import { buildApp } from './app.js'
import { createRealtime, type Realtime } from './realtime/index.js'

async function main(): Promise<void> {
  // Validate the environment FIRST: fail before opening any connection.
  const env = loadEnv()
  const isProd = env.NODE_ENV === 'production'

  const redis = await getRedis(env.REDIS_URL)
  await connectDb(env.MONGODB_URI)

  const sessionMiddleware = buildSessionMiddleware({
    store: new RedisStore({ client: redis, prefix: 'sess:' }),
    secret: env.SESSION_SECRET,
    secure: isProd, // a Secure cookie over plain http:// is silently dropped
  })

  const chatService = createChatService(redis)

  // `createRealtime` needs `server`, which needs `app`, which needs a
  // reference to `disconnectUser` — resolved via this closure once
  // `realtime` is assigned below, after `app` is built.
  // eslint-disable-next-line prefer-const -- reassigned once, after the closure that captures it is created
  let realtime: Realtime | undefined
  const app = buildApp({
    sessionMiddleware,
    trustProxy: isProd, // Render terminates TLS at a proxy
    clientDist: env.CLIENT_DIST,
    chatService,
    disconnectUser: (userId) => realtime?.disconnectUser(userId),
  })

  const server = createServer(app)
  realtime = createRealtime({ server, sessionMiddleware, chatService })

  server.listen(env.PORT, () => {
    console.log(`API listening on :${env.PORT} (${env.NODE_ENV})`)
  })
}

main().catch((err) => {
  console.error('Fatal startup error:', err)
  process.exit(1)
})
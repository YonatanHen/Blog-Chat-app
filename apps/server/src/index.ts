import { connectDb } from './lib/db.js'
import { RedisStore } from 'connect-redis' // NAMED export in v9 — there is no default
import { loadEnv } from './lib/env.js'
import { getRedis } from './lib/redis.js'
import { buildApp } from './app.js'

async function main(): Promise<void> {
  // Validate the environment FIRST: fail before opening any connection.
  const env = loadEnv()
  const isProd = env.NODE_ENV === 'production'

  const redis = await getRedis(env.REDIS_URL)
  await connectDb(env.MONGODB_URI)

  const app = buildApp({
    session: {
      store: new RedisStore({ client: redis, prefix: 'sess:' }),
      secret: env.SESSION_SECRET,
      secure: isProd, // a Secure cookie over plain http:// is silently dropped
    },
    trustProxy: isProd, // Render terminates TLS at a proxy
    clientDist: env.CLIENT_DIST,
  })

  app.listen(env.PORT, () => {
    console.log(`API listening on :${env.PORT} (${env.NODE_ENV})`)
  })
}

main().catch((err) => {
  console.error('Fatal startup error:', err)
  process.exit(1)
})
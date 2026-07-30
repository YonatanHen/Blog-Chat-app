import { createClient, type RedisClientType } from 'redis'

type Cache = { client: RedisClientType | null; promise: Promise<RedisClientType> | null }

// Cached on globalThis for the same reason as ./db.ts: tsx
// watch reloads modules on every save, and a fresh createClient() per reload
// exhausts Render's free Key Value connection cap (50) in a few minutes.
const globalCache = globalThis as typeof globalThis & { _redis?: Cache }
const cache: Cache = (globalCache._redis ??= { client: null, promise: null })

export async function getRedis(url: string): Promise<RedisClientType> {
  if (cache.client) return cache.client
  cache.promise ??= (async () => {
    const client: RedisClientType = createClient({ url })
    client.on('error', (err) => console.error('Redis client error:', err))
    await client.connect()
    return client
  })()
  cache.client = await cache.promise
  return cache.client
}

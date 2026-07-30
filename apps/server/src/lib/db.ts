import mongoose from 'mongoose'

type Cache = { conn: typeof mongoose | null; promise: Promise<typeof mongoose> | null }

const globalCache = globalThis as typeof globalThis & { _mongoose?: Cache }
const cache: Cache = (globalCache._mongoose ??= { conn: null, promise: null })

export async function connectDb(uri: string): Promise<void> {
  if (cache.conn) return
  cache.promise ??= mongoose.connect(uri, { bufferCommands: false })
  cache.conn = await cache.promise
}

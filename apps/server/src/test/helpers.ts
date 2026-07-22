import { CommentModel } from '../models/comment.js'
import { LikeModel } from '../models/like.js'
import { PostModel } from '../models/post.js'
import { UserModel } from '../models/user.js'
import session from 'express-session'
import type express from 'express'
import { MongoMemoryServer } from 'mongodb-memory-server'
import mongoose from 'mongoose'
import { afterAll, beforeAll, beforeEach } from 'vitest'
import { buildApp, type BuildAppOptions } from '../app.js'

// Test-only. Never imported by src/index.ts, so it is unreachable from the
// tsup bundle and the production image. Production secrets always come from
// validated env (apps/server/src/lib/env.ts) — this constant exists so tests that
// need a working session don't each have to invent their own 32-char string.
const TEST_SESSION_SECRET = 'test-only-secret-never-used-in-production-32c'

/**
 * Builds an app with a real (in-memory) session for tests that need one but
 * don't care about its exact secret or store. Tests asserting the cookie
 * policy itself (session.test.ts) call buildApp() directly instead.
 */
export function buildTestApp(overrides: Partial<BuildAppOptions> = {}): express.Express {
  return buildApp({
    session: { store: new session.MemoryStore(), secret: TEST_SESSION_SECRET, secure: false },
    ...overrides,
  })
}

/**
 * Spins an in-memory MongoDB for the calling test file and truncates every
 * collection between tests. Call once at the top level of a test file.
 *
 * syncIndexes() is essential: unique indexes are layer 3 of the authorization
 * model, and without it Mongoose builds them lazily and the tests that assert
 * duplicate-key behaviour would silently pass for the wrong reason.
 */
export function useTestDb(): void {
  let mongod: MongoMemoryServer

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create()
    await mongoose.connect(mongod.getUri())
    await mongoose.syncIndexes()
  })

  afterAll(async () => {
    await mongoose.disconnect()
    await mongod.stop()
  })

  beforeEach(async () => {
    await Promise.all([
      UserModel.deleteMany({}),
      PostModel.deleteMany({}),
      LikeModel.deleteMany({}),
      CommentModel.deleteMany({}),
    ])
  })
}

import session from 'express-session'
import type express from 'express'
import { buildApp, type BuildAppOptions } from '../app.js'

// Test-only. Never imported by src/index.ts, so it is unreachable from the
// tsup bundle and the production image. Production secrets always come from
// validated env (apps/api/src/lib/env.ts) — this constant exists so tests that
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

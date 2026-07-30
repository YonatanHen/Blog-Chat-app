import request from 'supertest'
import { afterAll, describe, expect, it } from 'vitest'
import { buildTestApp, useTestDb } from '../../test/helpers.js'

useTestDb()

// A dedicated file, not a case inside oauth.test.ts: configuredProviders()
// caches its result in a module-level singleton on first call, and
// oauth.test.ts's own tests are the first callers in that module instance
// (with GOOGLE_CLIENT_ID unset). This file needs a fresh module load so
// resolvePublicOrigin() actually runs against the env set below.
const ORIGINAL = {
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  PUBLIC_ORIGIN: process.env.PUBLIC_ORIGIN,
  RENDER_EXTERNAL_URL: process.env.RENDER_EXTERNAL_URL,
}
afterAll(() => {
  for (const [key, value] of Object.entries(ORIGINAL)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

process.env.GOOGLE_CLIENT_ID = 'test-client-id'
process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret'
delete process.env.PUBLIC_ORIGIN

describe('GET /api/v1/auth/google — callback URL production regression', () => {
  // REGRESSION: registerOAuthStrategies used to be built from
  // `process.env.PUBLIC_ORIGIN ?? 'http://localhost:5173'` directly, bypassing
  // the RENDER_EXTERNAL_URL fallback. With PUBLIC_ORIGIN correctly left unset
  // on Render, that sent Google a callback URL of
  // `http://localhost:5173/api/v1/auth/google/callback` in production —
  // rejected by Google as a redirect_uri_mismatch, since only the real
  // onrender.com URL was registered. This proves resolvePublicOrigin() is
  // actually reached from the OAuth route, not just from loadEnv().
  it('builds the callback from RENDER_EXTERNAL_URL when PUBLIC_ORIGIN is unset', async () => {
    process.env.RENDER_EXTERNAL_URL = 'https://blog-chat-app.onrender.com'

    const res = await request(buildTestApp()).get('/api/v1/auth/google')

    expect(res.status).toBe(302)
    const location = res.headers.location
    if (!location) throw new Error('Expected a Location header on the OAuth redirect.')
    expect(location).toContain('accounts.google.com')
    const redirectUri = new URL(location).searchParams.get('redirect_uri')
    expect(redirectUri).toBe('https://blog-chat-app.onrender.com/api/v1/auth/google/callback')
    expect(redirectUri).not.toContain('localhost')
  })
})

import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { buildTestApp, useTestDb } from '../../test/helpers.js'

useTestDb()

// The test env sets no GOOGLE_* or FACEBOOK_* credentials, so both providers are
// disabled here. That is the point: the app must serve every other route
// normally with no OAuth apps registered at all.
describe('GET /api/v1/auth/providers', () => {
  it('reports both providers disabled when unconfigured', async () => {
    const res = await request(buildTestApp()).get('/api/v1/auth/providers')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ google: false, facebook: false })
  })

  it('needs no session — the sign-in page asks before anyone is signed in', async () => {
    const res = await request(buildTestApp()).get('/api/v1/auth/providers')
    expect(res.status).not.toBe(401)
  })
})

describe('disabled provider routes', () => {
  it.each(['google', 'facebook'])('reports 503 rather than redirecting for %s', async (provider) => {
    const res = await request(buildTestApp()).get(`/api/v1/auth/${provider}`)
    expect(res.status).toBe(503)
    expect(res.body.error.message).toMatch(/not enabled/i)
  })

  it.each(['google', 'facebook'])('reports 503 on the %s callback too', async (provider) => {
    const res = await request(buildTestApp()).get(`/api/v1/auth/${provider}/callback`)
    expect(res.status).toBe(503)
  })
})

// Password auth must be entirely unaffected by the OAuth work.
describe('password auth still works alongside OAuth', () => {
  it('signs up and reaches /me', async () => {
    const agent = request.agent(buildTestApp())
    const signup = await agent
      .post('/api/v1/auth/signup')
      .send({ username: 'localuser', email: 'local@example.com', password: 'correct-horse' })
    expect(signup.status).toBe(201)
    const me = await agent.get('/api/v1/auth/me')
    expect(me.body.username).toBe('localuser')
  })
})

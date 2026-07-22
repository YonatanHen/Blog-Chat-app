import session from 'express-session'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { buildApp } from '../app.js'

const SECRET = 'test-secret-at-least-32-characters-long'

function appWith(secure: boolean, trustProxy = false) {
  return buildApp({
    session: { store: new session.MemoryStore(), secret: SECRET, secure },
    trustProxy,
  })
}

async function sessionCookie(secure: boolean, trustProxy = false, path = '/api/v1/session-test/login') {
  const req = request(appWith(secure, trustProxy)).post(path)
  if (trustProxy) req.set('X-Forwarded-Proto', 'https')
  const res = await req.send({})
  const raw = res.headers['set-cookie']
  const cookies = Array.isArray(raw) ? raw : raw ? [raw] : []
  return cookies.find((c) => c.startsWith('sid=')) ?? ''
}

describe('session cookie policy', () => {
  it('is httpOnly — JavaScript cannot read it, unlike the legacy localStorage JWT', async () => {
    expect(await sessionCookie(false)).toMatch(/HttpOnly/i)
  })

  it('is SameSite=Lax — the only CSRF defense, and sufficient because we are same-origin', async () => {
    expect(await sessionCookie(false)).toMatch(/SameSite=Lax/i)
  })

  it('is named sid, not the default connect.sid — no need to advertise the stack', async () => {
    expect(await sessionCookie(false)).toMatch(/^sid=/)
  })

  it('is Secure in production — behind Render, trustProxy + X-Forwarded-Proto make the request look secure', async () => {
    expect(await sessionCookie(true, true)).toMatch(/Secure/i)
  })

  it('withholds the cookie entirely if secure is true but the request is not actually secure', async () => {
    expect(await sessionCookie(true, false)).toBe('')
  })

  it('is NOT Secure in dev — a Secure cookie over plain http:// is silently dropped', async () => {
    expect(await sessionCookie(false)).not.toMatch(/Secure/i)
  })
})

describe('session lifecycle', () => {
  it('does not set a cookie for an anonymous request (saveUninitialized: false)', async () => {
    // Otherwise every crawler hit writes a session into a 25 MB Redis.
    const res = await request(appWith(false)).get('/api/v1/health')
    expect(res.headers['set-cookie']).toBeUndefined()
  })

  it('round-trips userId across requests on the same agent', async () => {
    const agent = request.agent(appWith(false))
    await agent.post('/api/v1/session-test/login').send({})
    const res = await agent.get('/api/v1/session-test/whoami')
    expect(res.body).toEqual({ userId: 'user-123' })
  })
})
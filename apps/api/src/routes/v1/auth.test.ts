import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { buildTestApp, useTestDb } from '../../test/helpers.js'

useTestDb()

const app = () => buildTestApp()
const CREDS = { username: 'yonatan', email: 'y@example.com', password: 'correct-horse' }

describe('POST /api/v1/auth/signup', () => {
  it('creates the user, returns 201, and starts a session', async () => {
    const res = await request(app()).post('/api/v1/auth/signup').send(CREDS)
    expect(res.status).toBe(201)
    expect(res.body).toEqual({ id: expect.any(String), username: 'yonatan' })
    expect(res.headers['set-cookie']?.[0]).toMatch(/^sid=/)
  })

  it('never returns the password or its hash', async () => {
    const res = await request(app()).post('/api/v1/auth/signup').send(CREDS)
    expect(JSON.stringify(res.body)).not.toContain('correct-horse')
    expect(res.body).not.toHaveProperty('password')
  })

  it('returns 400 with field errors for a short password', async () => {
    const res = await request(app()).post('/api/v1/auth/signup').send({ ...CREDS, password: 'short' })
    expect(res.status).toBe(400)
    expect(res.body.error.fields.password).toBeDefined()
  })

  it('returns 409 for a duplicate username', async () => {
    const agent = app()
    await request(agent).post('/api/v1/auth/signup').send(CREDS)
    const res = await request(agent).post('/api/v1/auth/signup').send({ ...CREDS, email: 'b@example.com' })
    expect(res.status).toBe(409)
  })
})

describe('POST /api/v1/auth/login', () => {
  it('returns 200 and starts a session for correct credentials', async () => {
    const agent = request.agent(app())
    await agent.post('/api/v1/auth/signup').send(CREDS)
    await agent.post('/api/v1/auth/logout')
    const res = await agent.post('/api/v1/auth/login').send({ username: 'yonatan', password: 'correct-horse' })
    expect(res.status).toBe(200)
    expect(res.body.username).toBe('yonatan')
  })

  it('returns a generic 401 for a wrong password — no hint that the user exists', async () => {
    const agent = request.agent(app())
    await agent.post('/api/v1/auth/signup').send(CREDS)
    const res = await agent.post('/api/v1/auth/login').send({ username: 'yonatan', password: 'wrong' })
    expect(res.status).toBe(401)
    expect(res.body.error.message).toBe('Invalid username or password.')
  })

  it('returns the IDENTICAL response for an unknown username', async () => {
    // The legacy app returned "Unable to find user: <name>", leaking existence.
    // Byte-identical responses are the whole point of this test.
    const agent = request.agent(app())
    await agent.post('/api/v1/auth/signup').send(CREDS)
    const wrongPassword = await agent.post('/api/v1/auth/login').send({ username: 'yonatan', password: 'wrong' })
    const unknownUser = await agent.post('/api/v1/auth/login').send({ username: 'nobody', password: 'wrong' })
    expect(unknownUser.status).toBe(wrongPassword.status)
    expect(unknownUser.body).toEqual(wrongPassword.body)
  })

  it('regenerates the session id on login to prevent session fixation', async () => {
    const agent = request.agent(app())
    await agent.post('/api/v1/auth/signup').send(CREDS)
    const before = await agent.get('/api/v1/auth/me')
    const beforeSid = before.headers['set-cookie']?.[0]
    await agent.post('/api/v1/auth/logout')
    const res = await agent.post('/api/v1/auth/login').send({ username: 'yonatan', password: 'correct-horse' })
    const afterSid = res.headers['set-cookie']?.[0]
    expect(afterSid).toBeDefined()
    expect(afterSid).not.toBe(beforeSid)
  })
})

describe('POST /api/v1/auth/logout', () => {
  it('returns 204 and clears the session', async () => {
    const agent = request.agent(app())
    await agent.post('/api/v1/auth/signup').send(CREDS)
    const res = await agent.post('/api/v1/auth/logout')
    expect(res.status).toBe(204)
    expect((await agent.get('/api/v1/auth/me')).status).toBe(401)
  })

  it('is POST-only — GET /logout is 404', async () => {
    // The legacy user.js:45 exposed logout over GET, so any <img src> logged you out.
    const res = await request(app()).get('/api/v1/auth/logout')
    expect(res.status).toBe(404)
  })

  it('requires authentication — an anonymous logout is 401', async () => {
    const res = await request(app()).post('/api/v1/auth/logout')
    expect(res.status).toBe(401)
  })
})

describe('GET /api/v1/auth/me', () => {
  it('returns the current user when signed in', async () => {
    const agent = request.agent(app())
    await agent.post('/api/v1/auth/signup').send(CREDS)
    const res = await agent.get('/api/v1/auth/me')
    expect(res.status).toBe(200)
    expect(res.body.username).toBe('yonatan')
  })

  it('returns 401 — never a redirect — for an anonymous caller', async () => {
    // An API must answer with a status, not a 302 to a login page.
    const res = await request(app()).get('/api/v1/auth/me')
    expect(res.status).toBe(401)
  })
})

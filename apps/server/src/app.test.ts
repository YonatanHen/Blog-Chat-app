import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { buildApp } from './app.js'

const app = buildApp({})

describe('middleware order', () => {
  // The legacy app.js:19 registered cors() AFTER the routers, so it never ran.
  // Order is load-bearing; assert it rather than trusting it.
  it('runs helmet before the routers — security headers are present on a route response', async () => {
    const res = await request(app).get('/api/v1/health')
    expect(res.status).toBe(200)
    expect(res.headers['x-dns-prefetch-control']).toBe('off')
    expect(res.headers['x-content-type-options']).toBe('nosniff')
  })

  it('parses a JSON body before the routers reach it', async () => {
    const res = await request(app).post('/api/v1/echo-test').send({ hello: 'world' })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ hello: 'world' })
  })

  it('sends a malformed JSON body to the error handler, not to a router', async () => {
    const res = await request(app)
      .post('/api/v1/echo-test')
      .set('Content-Type', 'application/json')
      .send('{"broken": ')
    expect(res.status).toBe(400)
    expect(res.body.error.message).toMatch(/json/i)
  })
})

describe('404 handler', () => {
  it('returns the standard error shape for an unknown API route', async () => {
    const res = await request(app).get('/api/v1/does-not-exist')
    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: { message: 'Route not found: GET /api/v1/does-not-exist' } })
  })
})

describe('error handler', () => {
  it('translates a thrown NotFoundError to 404 with the standard shape', async () => {
    const res = await request(app).get('/api/v1/throw-test/not-found')
    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: { message: 'Nothing here.' } })
  })

  it('translates a thrown ValidationError to 400 and includes field errors', async () => {
    const res = await request(app).get('/api/v1/throw-test/validation')
    expect(res.status).toBe(400)
    expect(res.body).toEqual({
      error: { message: 'Invalid input.', fields: { title: ['Too short'] } },
    })
  })

  it('translates an async rejection — Express 5 forwards it with no try/catch', async () => {
    const res = await request(app).get('/api/v1/throw-test/async-forbidden')
    expect(res.status).toBe(403)
  })

  it('does not leak an unexpected error message to the client', async () => {
    const res = await request(app).get('/api/v1/throw-test/boom')
    expect(res.status).toBe(500)
    // The real message ("db password rejected") must never reach the client.
    expect(res.body).toEqual({ error: { message: 'Internal server error.' } })
  })
})

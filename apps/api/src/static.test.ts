import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { buildApp } from './app.js'

function fixtureDist() {
  const dir = mkdtempSync(join(tmpdir(), 'client-dist-'))
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>SPA</title>')
  writeFileSync(join(dir, 'app.js'), 'console.log("bundle")')
  return dir
}

const app = () => buildApp({ clientDist: fixtureDist() })

describe('SPA static serving', () => {
  it('serves index.html at the root', async () => {
    const res = await request(app()).get('/')
    expect(res.status).toBe(200)
    expect(res.text).toContain('<title>SPA</title>')
  })

  it('serves a real asset from the build', async () => {
    const res = await request(app()).get('/app.js')
    expect(res.status).toBe(200)
    expect(res.text).toContain('bundle')
  })

  it('returns index.html for a client route so a refresh does not 404', async () => {
    const res = await request(app()).get('/blog/some-post')
    expect(res.status).toBe(200)
    expect(res.text).toContain('<title>SPA</title>')
  })
})

describe('the catch-all MUST NOT shadow the API (spec §3 hazard 2, §14)', () => {
  it('still routes a real API request to the API', async () => {
    const res = await request(app()).get('/api/v1/health')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ status: 'ok' })
  })

  it('returns JSON 404 — not index.html — for an unknown API route', async () => {
    // If the catch-all wins here, every mistyped API call returns HTML with a
    // 200 and debugging becomes miserable.
    const res = await request(app()).get('/api/v1/does-not-exist')
    expect(res.status).toBe(404)
    expect(res.headers['content-type']).toMatch(/json/)
    expect(res.text).not.toContain('<title>SPA</title>')
  })

  it('returns JSON 401 — not index.html — for an unauthorized API route', async () => {
    const res = await request(app()).get('/api/v1/auth/me')
    expect(res.status).toBe(401)
    expect(res.headers['content-type']).toMatch(/json/)
  })
})

describe('no client build present (the P1 default)', () => {
  it('boots fine and serves the API', async () => {
    const res = await request(buildApp({})).get('/api/v1/health')
    expect(res.status).toBe(200)
  })

  it('404s a client route instead of crashing', async () => {
    expect((await request(buildApp({})).get('/blog')).status).toBe(404)
  })
})
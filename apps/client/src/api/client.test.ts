import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, request } from './client.js' // eslint-disable-line @typescript-eslint/no-unused-vars

describe('request', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('returns the parsed JSON body on a 2xx response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 })),
    )
    await expect(request('/api/v1/health')).resolves.toEqual({ ok: true })
  })

  it('returns undefined for a 204 with no body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })))
    await expect(request('/api/v1/posts/x')).resolves.toBeUndefined()
  })

  it('throws ApiError carrying the status and field errors on a 400', async () => {
    const body = { error: { message: 'Invalid input.', fields: { title: ['Too short'] } } }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 400 })))
    await expect(request('/api/v1/posts')).rejects.toMatchObject({
      status: 400,
      message: 'Invalid input.',
      fields: { title: ['Too short'] },
    })
  })

  it('always sends credentials so the session cookie rides along', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await request('/api/v1/posts')
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/posts', expect.objectContaining({ credentials: 'include' }))
  })
})

/**
 * `request` is the single path every API call takes, so its DEBUG trace sees
 * the signup and login bodies — plaintext passwords included. Per-endpoint
 * fixes cannot cover this: a wrapper that logs whatever it is handed re-leaks
 * anything its callers were careful about.
 */
describe('request credential logging', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    vi.resetModules()
    vi.restoreAllMocks()
  })

  it('never logs a password from a request body, even with DEBUG on', async () => {
    vi.stubEnv('VITE_DEBUG', 'true')
    vi.resetModules()
    const { request: freshRequest } = await import('./client.js')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 200 })))
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})

    await freshRequest('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: 'recruiter', password: 'super-secret-value' }),
    })

    // Without this the test passes vacuously whenever DEBUG resolves false.
    expect(log).toHaveBeenCalled()
    expect(JSON.stringify(log.mock.calls)).not.toContain('super-secret-value')
  })
})

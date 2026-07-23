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

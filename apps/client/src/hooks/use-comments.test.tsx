import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useComments, useCreateComment, useDeleteComment, useUpdateComment } from './use-comments.js'
import { queryKeys } from '../lib/query-client.js'
import type { Comment } from '../api/comments.js'

const comment: Comment = {
  id: 'c1',
  body: 'Nice post.',
  author: { id: 'u1', username: 'demo' },
  parent: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return { client, wrapper }
}

const jsonResponse = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })

function stubFetch(response: () => Response) {
  // The parameters are declared so `fetchMock.mock.calls[n]` is a typed tuple
  // rather than the empty one an argument-less vi.fn() infers.
  const fetchMock = vi.fn((_url: string, _init: RequestInit) => Promise.resolve(response()))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('useComments', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('fetches the thread for the post', async () => {
    const fetchMock = stubFetch(() => jsonResponse([comment]))
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useComments('my-post'), { wrapper })

    await waitFor(() => expect(result.current.data).toEqual([comment]))
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/v1/posts/my-post/comments')
  })

  it('does not fire without a slug', () => {
    const fetchMock = stubFetch(() => jsonResponse([]))
    const { wrapper } = makeWrapper()
    renderHook(() => useComments(''), { wrapper })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

// Invalidate, never patch: a create needs the server-assigned id that replies
// hang off, and a delete cascades to a subtree only the server can size.
describe('comment mutations', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('useCreateComment POSTs the body and parent, then invalidates the list', async () => {
    const fetchMock = stubFetch(() => jsonResponse(comment, 201))
    const { client, wrapper } = makeWrapper()
    const invalidate = vi.spyOn(client, 'invalidateQueries')

    const { result } = renderHook(() => useCreateComment('my-post'), { wrapper })
    result.current.mutate({ body: 'Reply.', parent: 'c1' })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('/api/v1/posts/my-post/comments')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ body: 'Reply.', parent: 'c1' })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.comments.list('my-post') })
  })

  it('useUpdateComment PATCHes the comment url with the body only', async () => {
    const fetchMock = stubFetch(() => jsonResponse({ ...comment, body: 'Edited.' }))
    const { wrapper } = makeWrapper()

    const { result } = renderHook(() => useUpdateComment('my-post'), { wrapper })
    result.current.mutate({ id: 'c1', body: 'Edited.' })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('/api/v1/posts/my-post/comments/c1')
    expect(init.method).toBe('PATCH')
    // The id identifies the comment in the URL; it must not ride in the body too.
    expect(JSON.parse(init.body as string)).toEqual({ body: 'Edited.' })
  })

  it('useDeleteComment DELETEs the comment url and invalidates the list', async () => {
    const fetchMock = stubFetch(() => new Response(null, { status: 204 }))
    const { client, wrapper } = makeWrapper()
    const invalidate = vi.spyOn(client, 'invalidateQueries')

    const { result } = renderHook(() => useDeleteComment('my-post'), { wrapper })
    result.current.mutate('c1')

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('/api/v1/posts/my-post/comments/c1')
    expect(init.method).toBe('DELETE')
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.comments.list('my-post') })
  })

  it('surfaces a server error instead of swallowing it', async () => {
    stubFetch(() => jsonResponse({ error: { message: 'nope' } }, 400))
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useCreateComment('my-post'), { wrapper })
    result.current.mutate({ body: 'x' })
    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})

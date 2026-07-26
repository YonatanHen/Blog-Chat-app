import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useLikePost } from './use-likes.js'
import { queryKeys } from '../lib/query-client.js'
import type { Post } from '../api/posts.js'

const post: Post = {
  id: '1',
  title: 't',
  slug: 's',
  body: 'b',
  gated: false,
  author: { id: 'u1', username: 'demo' },
  tags: [],
  likeCount: 2,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  client.setQueryData(queryKeys.posts.detail('s'), post)
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return { client, wrapper }
}

describe('useLikePost', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('increments likeCount immediately, before the request resolves', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {}))) // never resolves
    const { client, wrapper } = makeWrapper()
    const { result } = renderHook(() => useLikePost('s'), { wrapper })
    result.current.mutate()
    await waitFor(() =>
      expect(client.getQueryData<Post>(queryKeys.posts.detail('s'))?.likeCount).toBe(3),
    )
  })

  it('rolls back likeCount if the request fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ error: { message: 'nope' } }), { status: 500 }),
        ),
    )
    const { client, wrapper } = makeWrapper()
    const { result } = renderHook(() => useLikePost('s'), { wrapper })
    result.current.mutate()
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(client.getQueryData<Post>(queryKeys.posts.detail('s'))?.likeCount).toBe(2)
  })
})

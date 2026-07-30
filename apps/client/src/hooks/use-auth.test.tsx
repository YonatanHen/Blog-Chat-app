import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useMe } from './use-auth.js'

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

describe('useMe', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('resolves to null on a 401 rather than throwing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { message: 'Unauthorized.' } }), { status: 401 }),
      ),
    )
    const { result } = renderHook(() => useMe(), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toBeNull()
  })

  it('resolves to the user on 200', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: '1', username: 'demo' }), { status: 200 })),
    )
    const { result } = renderHook(() => useMe(), { wrapper })
    await waitFor(() => expect(result.current.data).toEqual({ id: '1', username: 'demo' }))
  })
})

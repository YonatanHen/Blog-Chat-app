import '@testing-library/jest-dom/vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import type { ChatMessage } from '@blog/zod-shared'
import { afterEach, describe, expect, it, vi } from 'vitest'

const handlers = new Map<string, (payload: unknown) => void>()
const socket = {
  connected: false,
  connect: vi.fn(),
  disconnect: vi.fn(),
  emit: vi.fn(),
  on: vi.fn((event: string, fn: (payload: unknown) => void) => {
    handlers.set(event, fn)
    return socket
  }),
  off: vi.fn((event: string) => {
    handlers.delete(event)
    return socket
  }),
}

vi.mock('socket.io-client', () => ({ io: vi.fn(() => socket) }))

const { useChat } = await import('./use-chat.js')

const message = (id: string, body: string): ChatMessage => ({
  id,
  body,
  author: { id: 'u1', username: 'demo' },
  sentAt: '2026-07-29T00:00:00.000Z',
})

const jsonResponse = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })

function stubFetch(response: () => Response) {
  const fetchMock = vi.fn(() => Promise.resolve(response()))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return wrapper
}

describe('useChat', () => {
  afterEach(() => {
    handlers.clear()
    vi.clearAllMocks()
    vi.unstubAllGlobals()
    cleanup()
  })

  it('appends a broadcast message', async () => {
    stubFetch(() => jsonResponse([]))
    const { result } = renderHook(() => useChat(), { wrapper: makeWrapper() })
    act(() => {
      handlers.get('message')?.({
        id: '1',
        body: 'hello',
        author: { id: 'u1', username: 'demo' },
        sentAt: '2026-07-29T00:00:00.000Z',
      })
    })
    await waitFor(() => expect(result.current.messages).toHaveLength(1))
    expect(result.current.messages[0]?.body).toBe('hello')
  })

  // Legacy chat.jsx:51 registered a listener per message received, so every
  // message was handled N times and the count grew with the conversation.
  it('removes every listener it registered on unmount', () => {
    stubFetch(() => jsonResponse([]))
    const { unmount } = renderHook(() => useChat(), { wrapper: makeWrapper() })
    const registered = socket.on.mock.calls.map(([event]) => event)

    unmount()

    const removed = socket.off.mock.calls.map(([event]) => event)
    for (const event of registered) expect(removed).toContain(event)
    expect(handlers.size).toBe(0)
  })

  // Legacy chat.jsx:57 emitted disconnect on every render.
  it('does not reconnect or disconnect on re-render', () => {
    stubFetch(() => jsonResponse([]))
    const { rerender } = renderHook(() => useChat(), { wrapper: makeWrapper() })
    const connectsAfterMount = socket.connect.mock.calls.length

    rerender()
    rerender()

    expect(socket.connect).toHaveBeenCalledTimes(connectsAfterMount)
    expect(socket.disconnect).not.toHaveBeenCalled()
  })

  it('sends the body only — the server stamps the author', () => {
    stubFetch(() => jsonResponse([]))
    const { result } = renderHook(() => useChat(), { wrapper: makeWrapper() })
    act(() => result.current.send('  hi  '))
    expect(socket.emit).toHaveBeenCalledWith('message', { body: 'hi' })
  })

  // The design's explicit ordering: load the buffer over REST, then subscribe.
  // Buffered history must render oldest-first, ahead of anything arriving live.
  it('loads the buffer on mount, oldest-first, ahead of live messages', async () => {
    stubFetch(() => jsonResponse([message('1', 'first'), message('2', 'second')]))
    const { result } = renderHook(() => useChat(), { wrapper: makeWrapper() })

    await waitFor(() => expect(result.current.messages).toHaveLength(2))
    expect(result.current.messages.map((m) => m.id)).toEqual(['1', '2'])

    act(() => {
      handlers.get('message')?.(message('3', 'live'))
    })

    await waitFor(() => expect(result.current.messages).toHaveLength(3))
    expect(result.current.messages.map((m) => m.id)).toEqual(['1', '2', '3'])
  })

  // The fetch and the socket connect race. A message can plausibly arrive
  // live while the buffer fetch is still in flight and also be present in
  // the fetched buffer once it resolves — that message must appear exactly
  // once, not twice.
  it('deduplicates a message present in both the buffer and a live event', async () => {
    let resolveFetch!: (response: Response) => void
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve
        }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const { result } = renderHook(() => useChat(), { wrapper: makeWrapper() })

    // Live message arrives while the buffer fetch is still pending.
    act(() => {
      handlers.get('message')?.(message('dup', 'collides'))
    })
    await waitFor(() => expect(result.current.messages).toHaveLength(1))

    // The buffer resolves afterward and also contains that same id, in its
    // own (server-authoritative) oldest-first order.
    act(() => {
      resolveFetch(jsonResponse([message('older', 'before it'), message('dup', 'collides')]))
    })

    await waitFor(() => expect(result.current.messages).toHaveLength(2))
    const ids = result.current.messages.map((m) => m.id)
    expect(ids.filter((id) => id === 'dup')).toHaveLength(1)
    expect(ids).toEqual(['older', 'dup'])
  })

  // A broken history endpoint must not take the room down with it: the
  // socket still connects and live messages still arrive.
  it('stays usable when the buffer fetch fails', async () => {
    stubFetch(() => jsonResponse({ error: { message: 'boom' } }, 500))
    const { result } = renderHook(() => useChat(), { wrapper: makeWrapper() })

    act(() => {
      handlers.get('message')?.(message('1', 'still works'))
    })

    await waitFor(() => expect(result.current.messages).toHaveLength(1))
    expect(result.current.messages[0]?.body).toBe('still works')
    expect(socket.connect).toHaveBeenCalled()
  })
})

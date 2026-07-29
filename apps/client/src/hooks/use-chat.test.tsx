import '@testing-library/jest-dom/vitest'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
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

describe('useChat', () => {
  afterEach(() => {
    handlers.clear()
    vi.clearAllMocks()
    cleanup()
  })

  it('appends a broadcast message', async () => {
    const { result } = renderHook(() => useChat())
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
    const { unmount } = renderHook(() => useChat())
    const registered = socket.on.mock.calls.map(([event]) => event)

    unmount()

    const removed = socket.off.mock.calls.map(([event]) => event)
    for (const event of registered) expect(removed).toContain(event)
    expect(handlers.size).toBe(0)
  })

  // Legacy chat.jsx:57 emitted disconnect on every render.
  it('does not reconnect or disconnect on re-render', () => {
    const { rerender } = renderHook(() => useChat())
    const connectsAfterMount = socket.connect.mock.calls.length

    rerender()
    rerender()

    expect(socket.connect).toHaveBeenCalledTimes(connectsAfterMount)
    expect(socket.disconnect).not.toHaveBeenCalled()
  })

  it('sends the body only — the server stamps the author', () => {
    const { result } = renderHook(() => useChat())
    act(() => result.current.send('  hi  '))
    expect(socket.emit).toHaveBeenCalledWith('message', { body: 'hi' })
  })
})

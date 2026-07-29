// The root vitest.config.ts declares no setupFiles, so apps/client/src/test/setup.ts
// never runs — every client test file wires jest-dom and cleanup itself, as
// apps/client/src/components/patterns/CommentForm.test.tsx does.
import '@testing-library/jest-dom/vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { queryKeys } from '../lib/query-client.js'

// Mocked as a spy, not stubbed with real state, because the property under
// test is whether this hook gets CALLED at all — useChat() connects a socket
// on mount, so calling it for an anonymous visitor opens (and the server
// immediately rejects) a socket for nothing, waking the realtime service's
// free-tier instance on every anonymous hit to /chat. This is the regression
// the ChatPage/ChatRoom split exists to prevent.
vi.mock('../hooks/use-chat.js', () => ({ useChat: vi.fn() }))

const { useChat } = await import('../hooks/use-chat.js')
const { ChatPage } = await import('./ChatPage.js')

function renderChatPage(me: { id: string; username: string } | null) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(queryKeys.me, me)
  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <ChatPage />
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

describe('ChatPage guard', () => {
  afterEach(() => cleanup())

  it('never calls useChat — and so never opens a socket — for an unauthenticated visitor', () => {
    renderChatPage(null)
    expect(useChat).not.toHaveBeenCalled()
  })

  it('calls useChat once RequireAuth has let a signed-in viewer through', () => {
    vi.mocked(useChat).mockReturnValue({
      messages: [],
      online: [],
      typingUsers: [],
      status: 'connected',
      send: vi.fn(),
      setTyping: vi.fn(),
    })
    renderChatPage({ id: 'u1', username: 'reader' })
    expect(useChat).toHaveBeenCalled()
  })
})

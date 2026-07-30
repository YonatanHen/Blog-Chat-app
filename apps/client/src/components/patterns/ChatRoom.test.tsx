// The root vitest.config.ts declares no setupFiles, so apps/client/src/test/setup.ts
// never runs — every client test file wires jest-dom and cleanup itself, as
// apps/client/src/components/patterns/CommentForm.test.tsx does.
import '@testing-library/jest-dom/vitest'
import type { ChatMessage } from '@blog/zod-shared'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ChatStatus, ChatUser } from '../../hooks/use-chat.js'

// Mocked so each test can drive ChatRoom through a specific hook state
// directly, instead of exercising the real socket.
vi.mock('../../hooks/use-chat.js', () => ({ useChat: vi.fn() }))

const { useChat } = await import('../../hooks/use-chat.js')
const { ChatRoom } = await import('./ChatRoom.js')

type ChatState = {
  messages: ChatMessage[]
  online: ChatUser[]
  typingUsers: string[]
  status: ChatStatus
  send: ReturnType<typeof vi.fn>
  setTyping: ReturnType<typeof vi.fn>
  sendError: string | null
}

function mockChat(overrides: Partial<ChatState> = {}): ChatState {
  const state: ChatState = {
    messages: [],
    online: [],
    typingUsers: [],
    status: 'connected',
    // Defaults to a successful send — ChatRoom only clears the draft when
    // send() reports true, so a test exercising that path must opt in.
    send: vi.fn(() => true),
    setTyping: vi.fn(),
    sendError: null,
    ...overrides,
  }
  vi.mocked(useChat).mockReturnValue(state)
  return state
}

describe('ChatRoom status line', () => {
  afterEach(() => cleanup())

  // The status line is the entire mitigation for the ~60s cold start — a
  // silent page during that window is indistinguishable from a broken one.
  it('tells the reader the socket is connecting', () => {
    mockChat({ status: 'connecting' })
    render(<ChatRoom />)
    expect(screen.getByText('Connecting…')).toBeInTheDocument()
  })

  it('tells the reader the socket dropped and is retrying', () => {
    mockChat({ status: 'reconnecting' })
    render(<ChatRoom />)
    expect(screen.getByText('Reconnecting…')).toBeInTheDocument()
  })

  it('tells the reader the connection failed and how to recover', () => {
    mockChat({ status: 'failed' })
    render(<ChatRoom />)
    expect(screen.getByText('Could not connect. Reload to try again.')).toBeInTheDocument()
  })

  it('shows no status line once connected', () => {
    mockChat({ status: 'connected' })
    render(<ChatRoom />)
    expect(screen.queryByText('Connecting…')).not.toBeInTheDocument()
    expect(screen.queryByText('Reconnecting…')).not.toBeInTheDocument()
    expect(screen.queryByText('Could not connect. Reload to try again.')).not.toBeInTheDocument()
  })
})

describe('ChatRoom send flow', () => {
  afterEach(() => cleanup())

  it('sends the typed body, then clears the draft and stops the typing signal', () => {
    const state = mockChat({ status: 'connected' })
    render(<ChatRoom />)

    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'hello room' } })
    fireEvent.click(screen.getByText('Send'))

    expect(state.send).toHaveBeenCalledWith('hello room')
    expect(screen.getByLabelText('Message')).toHaveValue('')
    expect(state.setTyping).toHaveBeenCalledWith(false)
  })

  // send() returns false for a locally-rejected message (over the length
  // limit) — the draft must survive so the reader can fix it, not vanish.
  it('keeps the draft when send() rejects the message', () => {
    const state = mockChat({ status: 'connected', send: vi.fn(() => false) })
    render(<ChatRoom />)

    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'too long' } })
    fireEvent.click(screen.getByText('Send'))

    expect(state.send).toHaveBeenCalledWith('too long')
    expect(screen.getByLabelText('Message')).toHaveValue('too long')
    expect(state.setTyping).not.toHaveBeenCalledWith(false)
  })

  // A rejected message must not vanish silently — see design §7.
  it('renders sendError near the composer', () => {
    mockChat({ status: 'connected', sendError: 'Message must be at most 1,000 characters' })
    render(<ChatRoom />)
    expect(screen.getByText('Message must be at most 1,000 characters')).toBeInTheDocument()
  })

  it('renders nothing extra when there is no sendError', () => {
    mockChat({ status: 'connected', sendError: null })
    render(<ChatRoom />)
    expect(screen.queryByText(/characters/)).not.toBeInTheDocument()
  })
})

describe('ChatRoom send button gating', () => {
  afterEach(() => cleanup())

  it('disables Send when the draft is empty', () => {
    mockChat({ status: 'connected' })
    render(<ChatRoom />)
    expect(screen.getByText('Send')).toBeDisabled()
  })

  it('disables Send when the draft is only whitespace', () => {
    mockChat({ status: 'connected' })
    render(<ChatRoom />)
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: '   ' } })
    expect(screen.getByText('Send')).toBeDisabled()
  })

  it('disables Send while not connected, even with a non-empty draft', () => {
    mockChat({ status: 'reconnecting' })
    render(<ChatRoom />)
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'hello' } })
    expect(screen.getByText('Send')).toBeDisabled()
  })

  it('enables Send once there is a non-empty draft and the socket is connected', () => {
    mockChat({ status: 'connected' })
    render(<ChatRoom />)
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'hello' } })
    expect(screen.getByText('Send')).not.toBeDisabled()
  })
})

describe('ChatRoom message input gating', () => {
  afterEach(() => cleanup())

  it('disables the input once the connection has failed', () => {
    mockChat({ status: 'failed' })
    render(<ChatRoom />)
    expect(screen.getByLabelText('Message')).toBeDisabled()
  })

  it('leaves the input enabled while connected', () => {
    mockChat({ status: 'connected' })
    render(<ChatRoom />)
    expect(screen.getByLabelText('Message')).not.toBeDisabled()
  })
})

describe('ChatRoom messages and presence', () => {
  afterEach(() => cleanup())

  it('renders a message with its author and body', () => {
    mockChat({
      messages: [
        {
          id: 'm1',
          body: 'hello room',
          author: { id: 'u2', username: 'abe' },
          sentAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    })
    render(<ChatRoom />)
    expect(screen.getByText('abe')).toBeInTheDocument()
    expect(screen.getByText(/hello room/)).toBeInTheDocument()
  })

  // No fallback name: a username-less author omits the author span and its
  // separator, rather than an empty span plus a stray leading space.
  it('renders a message from a username-less author with no leading space', () => {
    mockChat({
      messages: [
        {
          id: 'm2',
          body: 'anonymous-ish message',
          author: { id: 'u3' },
          sentAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    })
    render(<ChatRoom />)
    expect(screen.getByText('anonymous-ish message')).toBeInTheDocument()
  })

  it('reflects the online roster size', () => {
    mockChat({
      online: [
        { id: 'u1', username: 'reader' },
        { id: 'u2', username: 'abe' },
      ],
    })
    render(<ChatRoom />)
    expect(screen.getByText('2 online')).toBeInTheDocument()
  })
})

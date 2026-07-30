import { useState } from 'react'
import { Button } from '../ui/button.js'
import { Input } from '../ui/input.js'
import { useChat } from '../../hooks/use-chat.js'

const STATUS_LABEL = {
  connecting: 'Connecting…',
  connected: '',
  reconnecting: 'Reconnecting…',
  failed: 'Could not connect. Reload to try again.',
} as const

// Split out of ChatPage on purpose: useChat() connects a socket on mount, so
// this component must only ever render inside ChatPage's <RequireAuth> —
// never beside it. Rendering it for an anonymous visitor would open (and the
// server would immediately reject) a socket for nothing, waking the realtime
// service's free-tier instance on every anonymous hit to /chat.
export function ChatRoom() {
  const { messages, online, typingUsers, status, send, setTyping, sendError } = useChat()
  const [draft, setDraft] = useState('')

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    // Only clear the draft once send() actually accepts it, so a rejected message isn't lost.
    if (send(draft)) {
      setDraft('')
      setTyping(false)
    }
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 p-4">
      <header className="flex items-baseline justify-between">
        <h1 className="text-2xl font-bold">Chat</h1>
        <p className="text-xs text-[var(--muted-foreground)]">{online.length} online</p>
      </header>

      {/* The service sleeps when idle and cold-starts in ~60s, so a silent
          page is indistinguishable from a broken one. Say what is happening. */}
      {STATUS_LABEL[status] && (
        <p className="text-xs text-[var(--muted-foreground)]">{STATUS_LABEL[status]}</p>
      )}

      <ul className="flex flex-col gap-2">
        {messages.map((m) => (
          <li key={m.id} className="text-sm">
            {m.author.username ? (
              <>
                <span className="font-semibold">{m.author.username}</span> {m.body}
              </>
            ) : (
              m.body
            )}
          </li>
        ))}
      </ul>

      <p className="h-4 text-xs text-[var(--muted-foreground)]">
        {typingUsers.length > 0 && `${typingUsers.join(', ')} typing…`}
      </p>

      {sendError && <p className="text-sm text-[var(--destructive)]">{sendError}</p>}

      <form onSubmit={submit} className="flex gap-2">
        <Input
          aria-label="Message"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value)
            setTyping(e.target.value.length > 0)
          }}
          disabled={status === 'failed'}
        />
        <Button type="submit" disabled={draft.trim().length === 0 || status !== 'connected'}>
          Send
        </Button>
      </form>
    </div>
  )
}

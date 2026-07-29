import { useState } from 'react'
import { Button } from '../components/ui/button.js'
import { Input } from '../components/ui/input.js'
import { RequireAuth } from '../components/patterns/RequireAuth.js'
import { useChat } from '../hooks/use-chat.js'

const STATUS_LABEL = {
  connecting: 'Connecting…',
  connected: '',
  reconnecting: 'Reconnecting…',
  failed: 'Could not connect. Reload to try again.',
} as const

export function ChatPage() {
  const { messages, online, typingUsers, status, send, setTyping } = useChat()
  const [draft, setDraft] = useState('')

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    send(draft)
    setDraft('')
    setTyping(false)
  }

  // `RequireAuth` is UX only here too — it just redirects an anonymous visitor
  // to /login before they see the room. The actual gate is server-side: the
  // socket handshake in apps/server/src/realtime/index.ts rejects a connection
  // that has no session, so there is nothing this component enforces.
  return (
    <RequireAuth>
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
              {/* Plain text, not Markdown: a fast room does not need tables, and
                  it removes the question of what a link in chat should do. */}
              <span className="font-semibold">{m.author.username}</span> {m.body}
            </li>
          ))}
        </ul>

        <p className="h-4 text-xs text-[var(--muted-foreground)]">
          {typingUsers.length > 0 && `${typingUsers.join(', ')} typing…`}
        </p>

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
    </RequireAuth>
  )
}

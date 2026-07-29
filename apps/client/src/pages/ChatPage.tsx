import { ChatRoom } from '../components/patterns/ChatRoom.js'
import { RequireAuth } from '../components/patterns/RequireAuth.js'

// `RequireAuth` is UX only — it redirects an anonymous visitor to /login
// before they see the room; the actual gate is server-side, the socket
// handshake in apps/server/src/realtime/index.ts, which rejects a connection
// with no session.
//
// This component does nothing else on purpose: `ChatRoom` calls useChat(),
// which opens a socket the moment it mounts, so `ChatRoom` must sit inside
// this guard rather than beside it. If ChatPage called useChat() itself (or
// any other hook), that hook would run before RequireAuth had a chance to
// redirect, and an anonymous hit to /chat would open — and get rejected by —
// a socket for nothing. Keep this file a guard shell only; anything that
// "simplifies" it back into one component reintroduces that regression.
export function ChatPage() {
  return (
    <RequireAuth>
      <ChatRoom />
    </RequireAuth>
  )
}

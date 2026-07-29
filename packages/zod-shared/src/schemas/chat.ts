import { z } from 'zod'

/**
 * The socket payload a client may send. `body` and nothing else: the author and
 * timestamp are stamped by the server from the session, so there is no author
 * field here to spoof. Zod objects strip unknown keys, which is the second
 * reason a client-supplied author cannot reach a handler.
 */
export const ChatMessageSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, 'Message cannot be empty')
    .max(1000, 'Message must be at most 1,000 characters'),
})

export type ChatMessageInput = z.infer<typeof ChatMessageSchema>

/** What the server broadcasts. Every field beyond `body` is server-derived. */
export type ChatMessage = {
  id: string
  body: string
  author: { id: string; username: string }
  /** ISO 8601, server clock. */
  sentAt: string
}

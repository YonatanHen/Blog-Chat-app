import { Router } from 'express'
import type { ChatService } from '../../lib/services/chat.js'
import { requireAuth } from '../../middleware/require-auth.js'

/**
 * Takes the service rather than importing it: the Redis client is created at
 * the entry point, so the service cannot be a module-level singleton the way
 * the Mongoose-backed ones are.
 */
export function createChatRouter(chatService: ChatService): Router {
  const chatRouter = Router()

  // requireAuth, not optional: the wall covers the room itself, not just
  // posting into it (design §5).
  chatRouter.get('/messages', requireAuth, async (_req, res) => {
    res.json(await chatService.list())
  })

  return chatRouter
}

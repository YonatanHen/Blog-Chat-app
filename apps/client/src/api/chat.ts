import { request } from './client.js'
import type { ChatMessage } from '@blog/zod-shared'

export const chatApi = {
  /** The last 50 messages, oldest-first (see apps/server/src/lib/services/chat.ts). */
  messages: () => request<ChatMessage[]>('/api/v1/chat/messages'),
}

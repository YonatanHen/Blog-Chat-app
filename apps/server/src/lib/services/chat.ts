import type { ChatMessage } from '@blog/zod-shared'

export const CHAT_KEY = 'chat:messages'
/** Enough for arriving context, small enough to stay trivial in a 25 MB store. */
export const CHAT_BUFFER_SIZE = 50
export const CHAT_TTL_SECONDS = 60 * 60 * 24

/** The four commands this service uses — narrow so tests need no live Redis. */
export type ChatRedis = {
  lPush(key: string, value: string): Promise<number>
  lTrim(key: string, start: number, stop: number): Promise<unknown>
  lRange(key: string, start: number, stop: number): Promise<string[]>
  expire(key: string, seconds: number): Promise<unknown>
}

export type ChatService = {
  append(message: ChatMessage): Promise<void>
  list(): Promise<ChatMessage[]>
}

export function createChatService(redis: ChatRedis): ChatService {
  return {
    async append(message) {
      await redis.lPush(CHAT_KEY, JSON.stringify(message))
      // Trim on every write rather than periodically: the list can never
      // exceed the cap even briefly, so a burst cannot spike memory.
      await redis.lTrim(CHAT_KEY, 0, CHAT_BUFFER_SIZE - 1)
      // Refreshed on each write, so an idle room expires but a busy one never does.
      await redis.expire(CHAT_KEY, CHAT_TTL_SECONDS)
      if (process.env.DEBUG) console.log('[CHAT_SERVICE] append', { id: message.id })
    },

    async list() {
      const raw = await redis.lRange(CHAT_KEY, 0, -1)
      // LPUSH writes newest-to-head; a conversation reads oldest-first.
      return raw.reverse().map((entry) => JSON.parse(entry) as ChatMessage)
    },
  }
}

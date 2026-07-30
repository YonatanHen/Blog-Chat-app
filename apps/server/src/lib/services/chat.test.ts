import type { ChatMessage } from '@blog/zod-shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CHAT_BUFFER_SIZE, CHAT_KEY, CHAT_TTL_SECONDS, createChatService } from './chat.js'

/** A list-shaped fake: LPUSH prepends, LTRIM slices, LRANGE reads. */
function fakeRedis() {
  const store: string[] = []
  return {
    store,
    lPush: vi.fn(async (_k: string, v: string) => store.unshift(v)),
    lTrim: vi.fn(async (_k: string, s: number, e: number) => {
      store.splice(0, store.length, ...store.slice(s, e + 1))
    }),
    lRange: vi.fn(async (_k: string, s: number, e: number) =>
      e === -1 ? store.slice(s) : store.slice(s, e + 1),
    ),
    expire: vi.fn(async () => undefined),
  }
}

const message = (body: string): ChatMessage => ({
  id: `id-${body}`,
  body,
  author: { id: 'u1', username: 'demo' },
  sentAt: '2026-07-29T00:00:00.000Z',
})

describe('chatService', () => {
  let redis: ReturnType<typeof fakeRedis>

  beforeEach(() => {
    redis = fakeRedis()
  })

  it('writes to the capped key and refreshes its TTL', async () => {
    await createChatService(redis).append(message('hello'))

    expect(redis.lPush).toHaveBeenCalledWith(CHAT_KEY, expect.stringContaining('hello'))
    expect(redis.lTrim).toHaveBeenCalledWith(CHAT_KEY, 0, CHAT_BUFFER_SIZE - 1)
    expect(redis.expire).toHaveBeenCalledWith(CHAT_KEY, CHAT_TTL_SECONDS)
  })

  it('keeps only the newest CHAT_BUFFER_SIZE messages', async () => {
    const service = createChatService(redis)
    for (let i = 0; i < CHAT_BUFFER_SIZE + 10; i++) await service.append(message(`m${i}`))

    expect(redis.store).toHaveLength(CHAT_BUFFER_SIZE)
    const bodies = (await service.list()).map((m) => m.body)
    expect(bodies).toContain(`m${CHAT_BUFFER_SIZE + 9}`)
    expect(bodies).not.toContain('m0')
  })

  // LPUSH puts newest at the head; a chat reads oldest-first.
  it('lists oldest first', async () => {
    const service = createChatService(redis)
    await service.append(message('first'))
    await service.append(message('second'))

    expect((await service.list()).map((m) => m.body)).toEqual(['first', 'second'])
  })

  it('returns an empty array when the buffer is empty', async () => {
    expect(await createChatService(redis).list()).toEqual([])
  })

  // The key can be shared with another Render project on the free tier, so a
  // foreign write is a real possibility. It must not 500 the whole feed.
  it('skips entries that fail to parse rather than failing the whole call', async () => {
    const service = createChatService(redis)
    await service.append(message('good one'))
    redis.store.unshift('not json{{{')
    await service.append(message('good two'))

    const result = await service.list()
    expect(result.map((m) => m.body)).toEqual(['good one', 'good two'])
  })
})

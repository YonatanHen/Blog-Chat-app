import type { ChatMessage } from '@blog/zod-shared'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import type { ChatService } from '../../lib/services/chat.js'
import { buildTestApp } from '../../test/helpers.js'

const stored: ChatMessage[] = [
  { id: '1', body: 'first', author: { id: 'u1', username: 'demo' }, sentAt: '2026-07-29T00:00:00.000Z' },
]

const stubService: ChatService = {
  append: async () => undefined,
  list: async () => stored,
}

describe('GET /api/v1/chat/messages', () => {
  it('401s for an anonymous reader — chat is signed-in only', async () => {
    const app = buildTestApp({ chatService: stubService })
    const res = await request(app).get('/api/v1/chat/messages')
    expect(res.status).toBe(401)
  })

  it('returns the buffer for a signed-in reader', async () => {
    const app = buildTestApp({ chatService: stubService })
    const agent = request.agent(app)
    await agent.post('/api/v1/session-test/login').send({})

    const res = await agent.get('/api/v1/chat/messages')
    expect(res.status).toBe(200)
    expect(res.body).toEqual(stored)
  })
})

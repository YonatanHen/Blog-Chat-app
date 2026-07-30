import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { buildTestApp, useTestDb } from '../../test/helpers.js'

useTestDb()

const app = () => buildTestApp()

async function signedInAgent(app: ReturnType<typeof buildTestApp>, username: string) {
  const agent = request.agent(app)
  await agent
    .post('/api/v1/auth/signup')
    .send({ username, email: `${username}@example.com`, password: 'correct-horse' })
  return agent
}

async function withPost() {
  const a = app()
  const author = await signedInAgent(a, 'author')
  await author.post('/api/v1/posts').send({ title: 'A Fine Title', body: 'Body.' })
  return { a, author }
}

describe('PUT /api/v1/posts/:slug/likes', () => {
  it('likes the post and returns the count', async () => {
    const { author } = await withPost()
    const res = await author.put('/api/v1/posts/a-fine-title/likes')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ likeCount: 1 })
  })

  it('REGRESSION: requires authentication (legacy liked as whoever the body said)', async () => {
    const { a } = await withPost()
    expect((await request(a).put('/api/v1/posts/a-fine-title/likes')).status).toBe(401)
  })

  it('ignores a user field in the body — identity comes from the session', async () => {
    const { a, author } = await withPost()
    const attacker = await signedInAgent(a, 'attacker')
    await attacker.put('/api/v1/posts/a-fine-title/likes').send({ user: 'someone-else' })
    // Exactly one like, attributed to the attacker's own session.
    expect((await author.put('/api/v1/posts/a-fine-title/likes')).body.likeCount).toBe(2)
  })

  it('is idempotent over HTTP — a double click cannot double-like', async () => {
    const { author } = await withPost()
    await author.put('/api/v1/posts/a-fine-title/likes')
    expect((await author.put('/api/v1/posts/a-fine-title/likes')).body).toEqual({ likeCount: 1 })
  })

  it('returns 404 for an unknown slug', async () => {
    const { author } = await withPost()
    expect((await author.put('/api/v1/posts/nope/likes')).status).toBe(404)
  })
})

describe('DELETE /api/v1/posts/:slug/likes', () => {
  it('unlikes and returns the count', async () => {
    const { author } = await withPost()
    await author.put('/api/v1/posts/a-fine-title/likes')
    const res = await author.delete('/api/v1/posts/a-fine-title/likes')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ likeCount: 0 })
  })

  it('requires authentication', async () => {
    const { a } = await withPost()
    expect((await request(a).delete('/api/v1/posts/a-fine-title/likes')).status).toBe(401)
  })

  it('is idempotent — the count never goes below zero', async () => {
    const { author } = await withPost()
    await author.delete('/api/v1/posts/a-fine-title/likes')
    expect((await author.delete('/api/v1/posts/a-fine-title/likes')).body).toEqual({ likeCount: 0 })
  })
})

describe('like route semantics', () => {
  it('has no POST /toggle — a toggle is not idempotent', async () => {
    const { author } = await withPost()
    expect((await author.post('/api/v1/posts/a-fine-title/likes/toggle')).status).toBe(404)
  })
})

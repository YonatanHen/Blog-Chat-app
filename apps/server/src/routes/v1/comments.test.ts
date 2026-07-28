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

const COMMENTS = '/api/v1/posts/a-fine-title/comments'

async function withPost() {
  const a = app()
  const author = await signedInAgent(a, 'author')
  await author.post('/api/v1/posts').send({ title: 'A Fine Title', body: 'Body.' })
  return { a, author }
}

describe('GET /api/v1/posts/:slug/comments', () => {
  it('is reachable — the mount sits ahead of the bare /:slug handlers', async () => {
    const { a } = await withPost()
    expect((await request(a).get(COMMENTS)).status).toBe(200)
  })

  it('returns full comment bodies to an ANONYMOUS reader — comments are never gated', async () => {
    const { a, author } = await withPost()
    const long = 'Para one.\n\nPara two.\n\nPara three — comments are not walled.'
    await author.post(COMMENTS).send({ body: long })

    const res = await request(a).get(COMMENTS)
    expect(res.status).toBe(200)
    expect(res.body[0].body).toBe(long)
    // The post body IS teased for this reader; the comment must not be.
    expect((await request(a).get('/api/v1/posts/a-fine-title')).body.gated).toBe(true)
  })

  it('returns 404 for an unknown post slug', async () => {
    const { a } = await withPost()
    expect((await request(a).get('/api/v1/posts/nope/comments')).status).toBe(404)
  })
})

describe('POST /api/v1/posts/:slug/comments', () => {
  it('creates a comment attributed to the session user', async () => {
    const { author } = await withPost()
    const res = await author.post(COMMENTS).send({ body: 'Nice post.' })
    expect(res.status).toBe(201)
    expect(res.body.author.username).toBe('author')
    expect(res.body.parent).toBeNull()
  })

  it('requires authentication', async () => {
    const { a } = await withPost()
    expect((await request(a).post(COMMENTS).send({ body: 'Anonymous.' })).status).toBe(401)
  })

  it('ignores an author field in the body — identity comes from the session', async () => {
    const { a, author } = await withPost()
    const reader = await signedInAgent(a, 'reader')
    const res = await reader.post(COMMENTS).send({ body: 'Mine.', author: 'someone-else' })
    expect(res.body.author.username).toBe('reader')
    expect((await author.get(COMMENTS)).body).toHaveLength(1)
  })

  it('nests a reply under its parent', async () => {
    const { author } = await withPost()
    const root = await author.post(COMMENTS).send({ body: 'Root.' })
    const reply = await author.post(COMMENTS).send({ body: 'Reply.', parent: root.body.id })
    expect(reply.status).toBe(201)
    expect(reply.body.parent).toBe(root.body.id)
  })

  it('rejects an empty body with a 400 naming the field', async () => {
    const { author } = await withPost()
    const res = await author.post(COMMENTS).send({ body: '   ' })
    expect(res.status).toBe(400)
    expect(res.body.error.fields.body).toBeDefined()
  })

  it('rejects a parent from a DIFFERENT post with a 400 naming the field', async () => {
    const { author } = await withPost()
    await author.post('/api/v1/posts').send({ title: 'Another Title', body: 'Body.' })
    const foreign = await author
      .post('/api/v1/posts/another-title/comments')
      .send({ body: 'Elsewhere.' })

    const res = await author.post(COMMENTS).send({ body: 'Reply.', parent: foreign.body.id })
    expect(res.status).toBe(400)
    expect(res.body.error.fields.parent).toBeDefined()
  })

  it('rejects a malformed parent id with a 400, not a 500', async () => {
    const { author } = await withPost()
    expect((await author.post(COMMENTS).send({ body: 'x', parent: 'not-an-id' })).status).toBe(400)
  })
})

describe('PATCH /api/v1/posts/:slug/comments/:commentId', () => {
  it('lets the author edit their own comment', async () => {
    const { author } = await withPost()
    const created = await author.post(COMMENTS).send({ body: 'Typo.' })
    const res = await author.patch(`${COMMENTS}/${created.body.id}`).send({ body: 'Fixed.' })
    expect(res.status).toBe(200)
    expect(res.body.body).toBe('Fixed.')
  })

  it('REGRESSION: 403 for a signed-in NON-author', async () => {
    const { a, author } = await withPost()
    const created = await author.post(COMMENTS).send({ body: 'Mine.' })
    const attacker = await signedInAgent(a, 'attacker')
    const res = await attacker.patch(`${COMMENTS}/${created.body.id}`).send({ body: 'Yours now.' })
    expect(res.status).toBe(403)
  })

  it('401 for an anonymous caller', async () => {
    const { a, author } = await withPost()
    const created = await author.post(COMMENTS).send({ body: 'Mine.' })
    const res = await request(a).patch(`${COMMENTS}/${created.body.id}`).send({ body: 'Yours.' })
    expect(res.status).toBe(401)
  })

  it('404 for a malformed comment id, not a 500', async () => {
    const { author } = await withPost()
    expect((await author.patch(`${COMMENTS}/not-an-id`).send({ body: 'x' })).status).toBe(404)
  })
})

describe('DELETE /api/v1/posts/:slug/comments/:commentId', () => {
  it('deletes the comment and its replies', async () => {
    const { a, author } = await withPost()
    const root = await author.post(COMMENTS).send({ body: 'Root.' })
    await author.post(COMMENTS).send({ body: 'Reply.', parent: root.body.id })

    expect((await author.delete(`${COMMENTS}/${root.body.id}`)).status).toBe(204)

    const remaining = (await request(a).get(COMMENTS)).body
    expect(remaining).toEqual([])
  })

  it('REGRESSION: 403 for a signed-in NON-author', async () => {
    const { a, author } = await withPost()
    const created = await author.post(COMMENTS).send({ body: 'Mine.' })
    const attacker = await signedInAgent(a, 'attacker')
    expect((await attacker.delete(`${COMMENTS}/${created.body.id}`)).status).toBe(403)
  })

  it('401 for an anonymous caller', async () => {
    const { a, author } = await withPost()
    const created = await author.post(COMMENTS).send({ body: 'Mine.' })
    expect((await request(a).delete(`${COMMENTS}/${created.body.id}`)).status).toBe(401)
  })
})

describe('deleting a post', () => {
  it('takes its comments with it', async () => {
    const { a, author } = await withPost()
    const root = await author.post(COMMENTS).send({ body: 'Root.' })
    await author.post(COMMENTS).send({ body: 'Reply.', parent: root.body.id })

    expect((await author.delete('/api/v1/posts/a-fine-title')).status).toBe(204)
    // The thread is gone with the post: the endpoint 404s rather than serving orphans.
    expect((await request(a).get(COMMENTS)).status).toBe(404)
  })
})

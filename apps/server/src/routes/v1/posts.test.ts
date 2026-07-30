import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { buildTestApp, useTestDb } from '../../test/helpers.js'

useTestDb()

const app = () => buildTestApp()
const BODY = 'Para one.\n\nPara two.\n\nPara three — the gated bytes.'

/** Signs up a fresh user and returns an agent carrying their session cookie. */
async function signedInAgent(app: ReturnType<typeof buildTestApp>, username: string) {
  const agent = request.agent(app)
  await agent
    .post('/api/v1/auth/signup')
    .send({ username, email: `${username}@example.com`, password: 'correct-horse' })
  return agent
}

describe('GET /api/v1/posts', () => {
  it('is public and returns teaser bodies only', async () => {
    const a = app()
    const author = await signedInAgent(a, 'author')
    await author.post('/api/v1/posts').send({ title: 'A Fine Title', body: BODY })

    const res = await request(a).get('/api/v1/posts')
    expect(res.status).toBe(200)
    expect(res.body[0].body).not.toContain('Para three')
  })

  it('flags the feed gated for an anonymous reader and ungated for a signed-in one', async () => {
    const a = app()
    const author = await signedInAgent(a, 'author')
    await author.post('/api/v1/posts').send({ title: 'A Fine Title', body: BODY })

    expect((await request(a).get('/api/v1/posts')).body[0].gated).toBe(true)

    // The session cookie is the only difference — this is what proves the
    // router actually forwards the viewer, not just that the service can.
    const reader = await signedInAgent(a, 'reader')
    const signedIn = await reader.get('/api/v1/posts')
    expect(signedIn.body[0].gated).toBe(false)
    // Ungated still does not mean unabridged: the feed is teasers for everyone.
    expect(signedIn.text).not.toContain('Para three')
  })
})

describe('GET /api/v1/posts?q= — search over the text index', () => {
  /** Two posts, distinguishable by title and by tag. */
  async function seed(a: ReturnType<typeof buildTestApp>) {
    const author = await signedInAgent(a, 'author')
    await author.post('/api/v1/posts').send({ title: 'Indexing Mongo Text', body: BODY, tags: ['db'] })
    await author.post('/api/v1/posts').send({ title: 'An Unrelated Essay', body: BODY, tags: ['prose'] })
  }

  it('returns only the matching posts', async () => {
    const a = app()
    await seed(a)
    const res = await request(a).get('/api/v1/posts').query({ q: 'Mongo' })
    expect(res.status).toBe(200)
    expect(res.body.map((p: { title: string }) => p.title)).toEqual(['Indexing Mongo Text'])
  })

  it('returns 200 with an empty array when nothing matches', async () => {
    const a = app()
    await seed(a)
    const res = await request(a).get('/api/v1/posts').query({ q: 'zzzznotaword' })
    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
  })

  // Mongo rejects `$text: { $search: '' }` — an empty box must not 500 the feed.
  it('treats ?q= as no filter at all rather than erroring', async () => {
    const a = app()
    await seed(a)
    const res = await request(a).get('/api/v1/posts?q=')
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(2)
  })

  it('filters by ?tag=, and combines it with ?q=', async () => {
    const a = app()
    await seed(a)
    expect((await request(a).get('/api/v1/posts').query({ tag: 'db' })).body).toHaveLength(1)
    expect((await request(a).get('/api/v1/posts').query({ q: 'Mongo', tag: 'prose' })).body).toEqual([])
  })

  it('keeps search results teased and gated exactly as the unfiltered feed is', async () => {
    const a = app()
    await seed(a)

    const anon = await request(a).get('/api/v1/posts').query({ q: 'Mongo' })
    expect(anon.body[0].gated).toBe(true)
    expect(anon.text).not.toContain('Para three')

    const reader = await signedInAgent(a, 'reader')
    const signedIn = await reader.get('/api/v1/posts').query({ q: 'Mongo' })
    expect(signedIn.body[0].gated).toBe(false)
    expect(signedIn.text).not.toContain('Para three')
  })
})

describe('POST /api/v1/posts', () => {
  it('creates a post for a signed-in user', async () => {
    const author = await signedInAgent(app(), 'author')
    const res = await author.post('/api/v1/posts').send({ title: 'A Fine Title', body: BODY })
    expect(res.status).toBe(201)
    expect(res.body.slug).toBe('a-fine-title')
  })

  it('returns 401 — not a redirect — for an anonymous caller', async () => {
    const res = await request(app()).post('/api/v1/posts').send({ title: 'A Fine Title', body: BODY })
    expect(res.status).toBe(401)
  })

  it('returns 400 with field errors for an invalid body', async () => {
    const author = await signedInAgent(app(), 'author')
    const res = await author.post('/api/v1/posts').send({ title: 'no', body: '' })
    expect(res.status).toBe(400)
    expect(res.body.error.fields.title).toBeDefined()
  })

  it('ignores an author field in the body — identity comes from the session', async () => {
    const a = app()
    const victim = await signedInAgent(a, 'victim')
    const victimId = (await victim.get('/api/v1/auth/me')).body.id
    const attacker = await signedInAgent(a, 'attacker')

    const res = await attacker
      .post('/api/v1/posts')
      .send({ title: 'A Fine Title', body: BODY, author: victimId })
    expect(res.status).toBe(201)
    expect(res.body.author.username).toBe('attacker') // NOT victim
  })
})

describe('GET /api/v1/posts/:slug — gating over real HTTP (spec §6, §14)', () => {
  it('leaves the gated bytes ABSENT from the RAW response for an anonymous reader', async () => {
    const a = app()
    const author = await signedInAgent(a, 'author')
    await author.post('/api/v1/posts').send({ title: 'A Fine Title', body: BODY })

    const res = await request(a).get('/api/v1/posts/a-fine-title')
    // Still 200 with a real page — title, author and teaser are public. Only
    // the rest of the body is withheld.
    expect(res.status).toBe(200)
    expect(res.body.title).toBe('A Fine Title')
    expect(res.body.gated).toBe(true)
    // Assert on the raw payload, not the parsed field: the bytes must not be
    // anywhere in the response, under any key.
    expect(res.text).not.toContain('Para three')
  })

  it('returns the full body to a signed-in reader', async () => {
    const a = app()
    const author = await signedInAgent(a, 'author')
    await author.post('/api/v1/posts').send({ title: 'A Fine Title', body: BODY })
    const reader = await signedInAgent(a, 'reader')

    const res = await reader.get('/api/v1/posts/a-fine-title')
    expect(res.body.body).toContain('Para three')
    expect(res.body.gated).toBe(false)
  })

  it('returns 404 for an unknown slug', async () => {
    expect((await request(app()).get('/api/v1/posts/nope')).status).toBe(404)
  })
})

describe('PATCH /api/v1/posts/:slug', () => {
  it('lets the owner edit', async () => {
    const author = await signedInAgent(app(), 'author')
    await author.post('/api/v1/posts').send({ title: 'A Fine Title', body: BODY })
    const res = await author.patch('/api/v1/posts/a-fine-title').send({ title: 'An Edited Title' })
    expect(res.status).toBe(200)
    expect(res.body.title).toBe('An Edited Title')
  })

  it('REGRESSION: a non-owner gets 403 (legacy post.js:34 let anyone edit)', async () => {
    const a = app()
    const author = await signedInAgent(a, 'author')
    await author.post('/api/v1/posts').send({ title: 'A Fine Title', body: BODY })
    const attacker = await signedInAgent(a, 'attacker')

    const res = await attacker.patch('/api/v1/posts/a-fine-title').send({ title: 'Pwned Title' })
    expect(res.status).toBe(403)
  })

  it('returns 401 for an anonymous editor', async () => {
    const a = app()
    const author = await signedInAgent(a, 'author')
    await author.post('/api/v1/posts').send({ title: 'A Fine Title', body: BODY })
    expect((await request(a).patch('/api/v1/posts/a-fine-title').send({ title: 'Nope Title' })).status).toBe(401)
  })
})

describe('DELETE /api/v1/posts/:slug', () => {
  it('lets the owner delete', async () => {
    const author = await signedInAgent(app(), 'author')
    await author.post('/api/v1/posts').send({ title: 'A Fine Title', body: BODY })
    expect((await author.delete('/api/v1/posts/a-fine-title')).status).toBe(204)
  })

  it('REGRESSION: a non-owner gets 403 (legacy post.js:42 deleted any post)', async () => {
    const a = app()
    const author = await signedInAgent(a, 'author')
    await author.post('/api/v1/posts').send({ title: 'A Fine Title', body: BODY })
    const attacker = await signedInAgent(a, 'attacker')

    const res = await attacker.delete('/api/v1/posts/a-fine-title')
    expect(res.status).toBe(403)
    // And it is still there.
    expect((await request(a).get('/api/v1/posts/a-fine-title')).status).toBe(200)
  })

  it('returns 404 for an unknown slug', async () => {
    const author = await signedInAgent(app(), 'author')
    expect((await author.delete('/api/v1/posts/nope')).status).toBe(404)
  })
})

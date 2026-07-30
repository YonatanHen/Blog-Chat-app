import request from 'supertest'
import { afterEach, describe, expect, it } from 'vitest'
import { buildTestApp, useTestDb } from '../../test/helpers.js'

useTestDb()

const KEYS = ['DEMO_MAX_USERS', 'DEMO_MAX_POSTS_PER_USER', 'DEMO_MAX_COMMENTS_PER_POST'] as const
// Saved and restored, never deleted: vitest runs this suite with singleFork, so
// every test file shares one process, and deleting these would drop the raised
// limits vitest.config.ts sets for all the other fixtures.
const ORIGINAL = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]))
afterEach(() => {
  for (const k of KEYS) {
    if (ORIGINAL[k] === undefined) delete process.env[k]
    else process.env[k] = ORIGINAL[k]
  }
})

async function signUp(app: ReturnType<typeof buildTestApp>, username: string) {
  const agent = request.agent(app)
  const res = await agent
    .post('/api/v1/auth/signup')
    .send({ username, email: `${username}@example.com`, password: 'correct-horse' })
  return { agent, res }
}

describe('global user cap', () => {
  it('refuses the signup that would exceed it, with 403 and the full-demo message', async () => {
    process.env.DEMO_MAX_USERS = '2'
    const app = buildTestApp()

    expect((await signUp(app, 'first')).res.status).toBe(201)
    expect((await signUp(app, 'second')).res.status).toBe(201)

    const third = await signUp(app, 'third')
    expect(third.res.status).toBe(403)
    expect(third.res.body.error.message).toMatch(/reached its visitor limit/)
    // 403, not 503: this is a policy refusal of a well-formed request, and 503
    // reads as broken to a visitor and trips uptime monitoring.
    expect(third.res.status).not.toBe(503)
    // `fields` is 400-only in this project's error shape.
    expect(third.res.body.error.fields).toBeUndefined()
  })

  it('still lets existing accounts sign in once the demo is full', async () => {
    process.env.DEMO_MAX_USERS = '1'
    const app = buildTestApp()
    await signUp(app, 'only')

    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: 'only', password: 'correct-horse' })
    expect(login.status).toBe(200)
  })
})

describe('per-author post cap', () => {
  it('refuses the post that would exceed it, and says the account is full — not the app', async () => {
    process.env.DEMO_MAX_POSTS_PER_USER = '2'
    const app = buildTestApp()
    const { agent } = await signUp(app, 'author')

    for (const title of ['First Post Here', 'Second Post Here']) {
      expect((await agent.post('/api/v1/posts').send({ title, body: 'Body.' })).status).toBe(201)
    }

    const third = await agent.post('/api/v1/posts').send({ title: 'Third Post Here', body: 'B.' })
    expect(third.status).toBe(403)
    expect(third.body.error.message).toMatch(/caps each account at 2 posts/)
    expect(third.body.error.message).not.toMatch(/visitor limit/)
  })

  // The whole point of per-owner scoping: one enthusiastic visitor cannot spend
  // the pool on everyone else's behalf.
  it('does not let one author exhaust another author allowance', async () => {
    process.env.DEMO_MAX_POSTS_PER_USER = '1'
    const app = buildTestApp()
    const alice = await signUp(app, 'alice')
    const bob = await signUp(app, 'bob')

    expect((await alice.agent.post('/api/v1/posts').send({ title: 'Alice One', body: 'B.' })).status).toBe(201)
    expect((await alice.agent.post('/api/v1/posts').send({ title: 'Alice Two', body: 'B.' })).status).toBe(403)
    // Bob's allowance is untouched by Alice hitting hers.
    expect((await bob.agent.post('/api/v1/posts').send({ title: 'Bob One', body: 'B.' })).status).toBe(201)
  })

  it('frees a slot when the author deletes one — the suggested remedy is real', async () => {
    process.env.DEMO_MAX_POSTS_PER_USER = '1'
    const app = buildTestApp()
    const { agent } = await signUp(app, 'deleter')

    await agent.post('/api/v1/posts').send({ title: 'Only Post Here', body: 'B.' })
    expect((await agent.post('/api/v1/posts').send({ title: 'Blocked Post', body: 'B.' })).status).toBe(403)

    expect((await agent.delete('/api/v1/posts/only-post-here')).status).toBe(204)
    expect((await agent.post('/api/v1/posts').send({ title: 'Now Allowed', body: 'B.' })).status).toBe(201)
  })
})

describe('per-post comment cap', () => {
  it('refuses the comment that would exceed it', async () => {
    process.env.DEMO_MAX_COMMENTS_PER_POST = '2'
    const app = buildTestApp()
    const { agent } = await signUp(app, 'commenter')
    await agent.post('/api/v1/posts').send({ title: 'Commented Post', body: 'B.' })

    for (const body of ['one', 'two']) {
      const res = await agent.post('/api/v1/posts/commented-post/comments').send({ body })
      expect(res.status).toBe(201)
    }

    const third = await agent.post('/api/v1/posts/commented-post/comments').send({ body: 'three' })
    expect(third.status).toBe(403)
    expect(third.body.error.message).toMatch(/each post at 2 comments/)
  })

  // Scoped per post, so a busy post must not silence a quiet one.
  it('does not let one post exhaust another post allowance', async () => {
    process.env.DEMO_MAX_COMMENTS_PER_POST = '1'
    const app = buildTestApp()
    const { agent } = await signUp(app, 'multi')
    await agent.post('/api/v1/posts').send({ title: 'Busy Post', body: 'B.' })
    await agent.post('/api/v1/posts').send({ title: 'Quiet Post', body: 'B.' })

    expect((await agent.post('/api/v1/posts/busy-post/comments').send({ body: 'a' })).status).toBe(201)
    expect((await agent.post('/api/v1/posts/busy-post/comments').send({ body: 'b' })).status).toBe(403)
    expect((await agent.post('/api/v1/posts/quiet-post/comments').send({ body: 'a' })).status).toBe(201)
  })
})

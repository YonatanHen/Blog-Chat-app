import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { buildTestApp, useTestDb } from '../../test/helpers.js'

useTestDb()

async function signedInAgent(app: ReturnType<typeof buildTestApp>, username = 'uploader') {
  const agent = request.agent(app)
  await agent
    .post('/api/v1/auth/signup')
    .send({ username, email: `${username}@example.com`, password: 'correct-horse' })
  return agent
}

// The test env sets no CLOUDINARY_URL, so the endpoint is unconfigured here.
// That is the point of these two: the API must boot and authorize normally
// without any Cloudinary account, and degrade only at the last step.
describe('POST /api/v1/uploads/signature', () => {
  it('requires authentication before it reveals anything about configuration', async () => {
    const res = await request(buildTestApp()).post('/api/v1/uploads/signature')
    expect(res.status).toBe(401)
  })

  it('reports 503 when uploads are not configured on this deployment', async () => {
    const agent = await signedInAgent(buildTestApp())
    const res = await agent.post('/api/v1/uploads/signature')
    expect(res.status).toBe(503)
    expect(res.body.error.message).toMatch(/not configured/i)
  })
})

describe('cover images on posts', () => {
  it('accepts a post with no cover — the cover is optional', async () => {
    const agent = await signedInAgent(buildTestApp())
    const res = await agent.post('/api/v1/posts').send({ title: 'No Cover Here', body: 'Body.' })
    expect(res.status).toBe(201)
    expect(res.body.coverImage).toBeUndefined()
  })

  it('persists a public ID under one of our folders', async () => {
    const agent = await signedInAgent(buildTestApp())
    const res = await agent
      .post('/api/v1/posts')
      .send({ title: 'With A Cover', body: 'Body.', coverImage: 'blogchat/covers/ab12cd' })
    expect(res.status).toBe(201)
    expect(res.body.coverImage).toBe('blogchat/covers/ab12cd')
  })

  it('rejects a public ID pointing outside our folders', async () => {
    const agent = await signedInAgent(buildTestApp())
    const res = await agent
      .post('/api/v1/posts')
      .send({ title: 'Hostile Cover', body: 'Body.', coverImage: 'someone-elses/folder/x' })
    expect(res.status).toBe(400)
  })

  it('rejects a full URL — we persist public IDs, not delivery URLs', async () => {
    const agent = await signedInAgent(buildTestApp())
    const res = await agent.post('/api/v1/posts').send({
      title: 'Url Cover',
      body: 'Body.',
      coverImage: 'https://res.cloudinary.com/demo/image/upload/x.png',
    })
    expect(res.status).toBe(400)
  })

  it('clears the cover on PATCH null, and leaves it alone when the key is absent', async () => {
    const app = buildTestApp()
    const agent = await signedInAgent(app)
    await agent
      .post('/api/v1/posts')
      .send({ title: 'Editable Cover', body: 'Body.', coverImage: 'blogchat/covers/ab12cd' })

    // Absent key: an unrelated edit must not wipe the cover.
    const untouched = await agent.patch('/api/v1/posts/editable-cover').send({ title: 'Renamed' })
    expect(untouched.body.coverImage).toBe('blogchat/covers/ab12cd')

    const cleared = await agent.patch('/api/v1/posts/renamed').send({ coverImage: null })
    expect(cleared.status).toBe(200)
    expect(cleared.body.coverImage).toBeUndefined()
  })
})

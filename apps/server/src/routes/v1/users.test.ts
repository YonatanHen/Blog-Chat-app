import { UserModel } from '../../models/user.js'
import bcrypt from 'bcryptjs'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { buildTestApp, useTestDb } from '../../test/helpers.js'

useTestDb()

const app = () => buildTestApp()

async function signedInAgent(app: ReturnType<typeof buildTestApp>, username: string) {
  const agent = request.agent(app)
  const res = await agent
    .post('/api/v1/auth/signup')
    .send({ username, email: `${username}@example.com`, password: 'correct-horse' })
  return { agent, id: res.body.id as string }
}

describe('GET /api/v1/users/:id', () => {
  it('is public and returns the profile', async () => {
    const a = app()
    const { id } = await signedInAgent(a, 'author')
    const res = await request(a).get(`/api/v1/users/${id}`)
    expect(res.status).toBe(200)
    expect(res.body.username).toBe('author')
  })

  it('never exposes the password hash or the email to a non-owner viewer', async () => {
    const a = app()
    const { id } = await signedInAgent(a, 'author')
    const res = await request(a).get(`/api/v1/users/${id}`)
    expect(res.text).not.toContain('$2a$')
    expect(res.text).not.toContain('@example.com')
  })

  it('includes email and hasPassword when the viewer is the owner', async () => {
    const { agent, id } = await signedInAgent(app(), 'author')
    const res = await agent.get(`/api/v1/users/${id}`)
    expect(res.body.email).toBe('author@example.com')
    expect(res.body.hasPassword).toBe(true)
    expect(res.body.oauthProvider).toBeNull()
  })

  it('returns 404 for an unknown id', async () => {
    expect((await request(app()).get('/api/v1/users/507f1f77bcf86cd799439011')).status).toBe(404)
  })

  it('returns 404 — not 500 — for a malformed id', async () => {
    expect((await request(app()).get('/api/v1/users/not-an-objectid')).status).toBe(404)
  })
})

describe('PATCH /api/v1/users/:id', () => {
  it('lets a user update their own profile', async () => {
    const { agent, id } = await signedInAgent(app(), 'author')
    const res = await agent.patch(`/api/v1/users/${id}`).send({ bio: 'I write things.' })
    expect(res.status).toBe(200)
    expect(res.body.bio).toBe('I write things.')
  })

  it('REGRESSION: ACCOUNT TAKEOVER — a user cannot modify another user (legacy user.js:73)', async () => {
    const a = app()
    const { id: victimId } = await signedInAgent(a, 'victim')
    const { agent: attacker } = await signedInAgent(a, 'attacker')

    const res = await attacker.patch(`/api/v1/users/${victimId}`).send({ password: 'attacker-owns-you' })
    expect(res.status).toBe(403)

    // And the victim's password is untouched — they can still sign in.
    const check = request.agent(a)
    expect(
      (await check.post('/api/v1/auth/login').send({ username: 'victim', password: 'correct-horse' })).status,
    ).toBe(200)
  })

  it('returns 401 for an anonymous update', async () => {
    const a = app()
    const { id } = await signedInAgent(a, 'author')
    expect((await request(a).patch(`/api/v1/users/${id}`).send({ bio: 'x' })).status).toBe(401)
  })

  it('REGRESSION: does not reset the password when the field is absent (legacy user.js:79)', async () => {
    // The legacy handler compared plaintext to a hash, so every profile save
    // silently re-hashed and replaced the password.
    const { agent, id } = await signedInAgent(app(), 'author')
    const before = (await UserModel.findById(id))!.password
    await agent.patch(`/api/v1/users/${id}`).send({ bio: 'Just a bio.' })
    expect((await UserModel.findById(id))!.password).toBe(before)
  })

  it('hashes a new password rather than storing it plaintext', async () => {
    const { agent, id } = await signedInAgent(app(), 'author')
    await agent
      .patch(`/api/v1/users/${id}`)
      .send({ currentPassword: 'correct-horse', password: 'a-brand-new-password' })
    const stored = (await UserModel.findById(id))!.password!
    expect(stored).not.toBe('a-brand-new-password')
    expect(await bcrypt.compare('a-brand-new-password', stored)).toBe(true)
  })

  it('rejects a password change with a wrong current password', async () => {
    const { agent, id } = await signedInAgent(app(), 'author')
    const res = await agent
      .patch(`/api/v1/users/${id}`)
      .send({ currentPassword: 'wrong', password: 'a-brand-new-password' })
    expect(res.status).toBe(401)
  })

  it('lets a user change their own username', async () => {
    const { agent, id } = await signedInAgent(app(), 'author')
    const res = await agent.patch(`/api/v1/users/${id}`).send({ username: 'renamed' })
    expect(res.status).toBe(200)
    expect(res.body.username).toBe('renamed')
    expect((await UserModel.findById(id))!.username).toBe('renamed')
  })

  it('returns 409 for a username that is already taken', async () => {
    const a = app()
    await signedInAgent(a, 'taken')
    const { agent, id } = await signedInAgent(a, 'author')
    const res = await agent.patch(`/api/v1/users/${id}`).send({ username: 'taken' })
    expect(res.status).toBe(409)
  })

  it('updates the session so GET /auth/me reflects a new username without re-login', async () => {
    const { agent, id } = await signedInAgent(app(), 'author')
    await agent.patch(`/api/v1/users/${id}`).send({ username: 'renamed' })
    const me = await agent.get('/api/v1/auth/me')
    expect(me.body.username).toBe('renamed')
  })
})

describe('DELETE /api/v1/users/:id', () => {
  it('lets a user delete their own account with the correct current password', async () => {
    const { agent, id } = await signedInAgent(app(), 'author')
    const res = await agent.delete(`/api/v1/users/${id}`).send({ currentPassword: 'correct-horse' })
    expect(res.status).toBe(204)
    expect(await UserModel.findById(id)).toBeNull()
  })

  it('rejects deletion with a wrong current password and keeps the account', async () => {
    const { agent, id } = await signedInAgent(app(), 'author')
    const res = await agent.delete(`/api/v1/users/${id}`).send({ currentPassword: 'wrong' })
    expect(res.status).toBe(401)
    expect(await UserModel.findById(id)).not.toBeNull()
  })

  it('REGRESSION: a user cannot delete another user (legacy user.js:60)', async () => {
    const a = app()
    const { id: victimId } = await signedInAgent(a, 'victim')
    const { agent: attacker } = await signedInAgent(a, 'attacker')

    expect(
      (await attacker.delete(`/api/v1/users/${victimId}`).send({ currentPassword: 'correct-horse' }))
        .status,
    ).toBe(403)
    expect(await UserModel.findById(victimId)).not.toBeNull()
  })

  it('returns 401 for an anonymous delete', async () => {
    const a = app()
    const { id } = await signedInAgent(a, 'author')
    expect((await request(a).delete(`/api/v1/users/${id}`)).status).toBe(401)
  })
})

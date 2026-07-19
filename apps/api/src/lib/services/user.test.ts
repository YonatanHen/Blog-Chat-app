import { ConflictError, NotFoundError, UserModel } from '@blog/shared'
import { describe, expect, it } from 'vitest'
import { useTestDb } from '../../test/helpers.js'
import { userService } from './user.js'

useTestDb()

const signup = (over: Partial<{ username: string; email: string; password: string }> = {}) =>
  userService.signup({
    username: 'yonatan',
    email: 'y@example.com',
    password: 'correct-horse',
    ...over,
  })

describe('userService.signup', () => {
  it('hashes the password — never stores plaintext', async () => {
    await signup()
    const user = await UserModel.findOne({ username: 'yonatan' })
    expect(user!.password).not.toBe('correct-horse')
    expect(user!.password).toMatch(/^\$2[aby]\$/) // bcrypt
  })

  it('uses bcrypt cost 12, not the legacy 8', async () => {
    await signup()
    const user = await UserModel.findOne({ username: 'yonatan' })
    expect(user!.password).toMatch(/^\$2[aby]\$12\$/)
  })

  it('throws ConflictError for a duplicate username', async () => {
    await signup()
    await expect(signup({ email: 'other@example.com' })).rejects.toThrow(ConflictError)
  })

  it('throws ConflictError for a duplicate email', async () => {
    await signup()
    await expect(signup({ username: 'someone-else' })).rejects.toThrow(ConflictError)
  })

  it('turns a duplicate-key race into ConflictError, not an unhandled 500', async () => {
    // Two concurrent signups both pass the findOne pre-check; one loses at the
    // unique index. That E11000 must surface as a 409, not a crash. The index is
    // the real guard — the pre-check only buys a nicer message.
    const results = await Promise.allSettled([signup(), signup()])
    const rejected = results.filter((r) => r.status === 'rejected')
    expect(rejected).toHaveLength(1)
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(ConflictError)
  })

  it('returns the new id and username', async () => {
    const result = await signup()
    expect(result.username).toBe('yonatan')
    expect(result.id).toMatch(/^[a-f0-9]{24}$/)
  })
})

describe('userService.verifyCredentials', () => {
  it('returns the user for a correct password', async () => {
    await signup()
    expect((await userService.verifyCredentials('yonatan', 'correct-horse'))?.username).toBe('yonatan')
  })

  it('returns null for a wrong password', async () => {
    await signup()
    expect(await userService.verifyCredentials('yonatan', 'wrong')).toBeNull()
  })

  it('returns null — not a distinguishable error — for an unknown username', async () => {
    // The legacy app threw "Unable to find user: <name>", leaking which usernames
    // exist. Both failure modes must be indistinguishable to the caller.
    expect(await userService.verifyCredentials('nobody', 'correct-horse')).toBeNull()
  })

  it('returns null for an OAuth user who has no password', async () => {
    await UserModel.create({ username: 'oauth', email: 'o@example.com' })
    expect(await userService.verifyCredentials('oauth', 'anything')).toBeNull()
  })
})

describe('userService.getPublicProfile', () => {
  it('never exposes the password hash or the email', async () => {
    const { id } = await signup()
    const profile = await userService.getPublicProfile(id)
    expect(profile).not.toHaveProperty('password')
    expect(profile).not.toHaveProperty('email')
    expect(profile.username).toBe('yonatan')
  })

  it('throws NotFoundError for an unknown id', async () => {
    await expect(userService.getPublicProfile('507f1f77bcf86cd799439011')).rejects.toThrow(NotFoundError)
  })

  it('throws NotFoundError for a malformed id rather than a cast error', async () => {
    await expect(userService.getPublicProfile('not-an-objectid')).rejects.toThrow(NotFoundError)
  })
})

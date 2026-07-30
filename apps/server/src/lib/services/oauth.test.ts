import { describe, expect, it } from 'vitest'
import { ConflictError } from '../errors.js'
import { useTestDb } from '../../test/helpers.js'
import { UserModel } from '../../models/user.js'
import { userService } from './user.js'
import { oauthService, type OAuthProfile } from './oauth.js'

useTestDb()

const googleProfile = (over: Partial<OAuthProfile> = {}): OAuthProfile => ({
  provider: 'google',
  providerId: 'g-1',
  email: 'ada@example.com',
  emailVerified: true,
  displayName: 'Ada Lovelace',
  ...over,
})

describe('oauthService.findOrCreate', () => {
  it('creates a passwordless account on first sign-in', async () => {
    const user = await oauthService.findOrCreate(googleProfile())
    const doc = await UserModel.findById(user.id)
    expect(doc?.email).toBe('ada@example.com')
    expect(doc?.googleId).toBe('g-1')
    // No password at all — there is no weak credential to guess on this account.
    expect(doc?.password).toBeUndefined()
  })

  it('derives a username from the display name', async () => {
    const user = await oauthService.findOrCreate(googleProfile())
    expect(user.username).toBe('ada-lovelace')
  })

  it('suffixes the username when it is taken', async () => {
    await userService.signup({
      username: 'ada-lovelace',
      email: 'someone@example.com',
      password: 'correct-horse',
    })
    const user = await oauthService.findOrCreate(googleProfile())
    expect(user.username).toBe('ada-lovelace-2')
  })

  it('returns the same account on the second sign-in, not a duplicate', async () => {
    const first = await oauthService.findOrCreate(googleProfile())
    const second = await oauthService.findOrCreate(googleProfile())
    expect(second.id).toBe(first.id)
    expect(await UserModel.countDocuments()).toBe(1)
  })

  it('keeps google and facebook identities on separate accounts when emails differ', async () => {
    const g = await oauthService.findOrCreate(googleProfile())
    const f = await oauthService.findOrCreate({
      provider: 'facebook',
      providerId: 'f-1',
      email: 'grace@example.com',
      emailVerified: false,
      displayName: 'Grace Hopper',
    })
    expect(f.id).not.toBe(g.id)
  })

  describe('account linking', () => {
    it('links to an existing account when the provider verified the email', async () => {
      const existing = await userService.signup({
        username: 'ada',
        email: 'ada@example.com',
        password: 'correct-horse',
      })
      const linked = await oauthService.findOrCreate(googleProfile({ emailVerified: true }))

      expect(linked.id).toBe(existing.id)
      expect(linked.username).toBe('ada')
      expect((await UserModel.findById(existing.id))?.googleId).toBe('g-1')
      expect(await UserModel.countDocuments()).toBe(1)
    })

    // The takeover this project exists to prevent: an unverified address is
    // attacker-controlled, so matching on it must never grant the account.
    it('REFUSES to link when the provider did not verify the email', async () => {
      await userService.signup({
        username: 'ada',
        email: 'ada@example.com',
        password: 'correct-horse',
      })
      await expect(
        oauthService.findOrCreate(googleProfile({ emailVerified: false })),
      ).rejects.toThrow(ConflictError)
      // And nothing was attached to the victim's account.
      expect((await UserModel.findOne({ email: 'ada@example.com' }))?.googleId).toBeUndefined()
    })

    it('links a second provider onto an already-linked account', async () => {
      const first = await oauthService.findOrCreate(googleProfile())
      const second = await oauthService.findOrCreate({
        provider: 'facebook',
        providerId: 'f-9',
        email: 'ada@example.com',
        emailVerified: true,
        displayName: 'Ada',
      })
      expect(second.id).toBe(first.id)
      const doc = await UserModel.findById(first.id)
      expect(doc?.googleId).toBe('g-1')
      expect(doc?.facebookId).toBe('f-9')
    })
  })

  // Facebook lets a user deny the email scope. Without an address we can neither
  // dedupe nor ever reach them, so a half-account must not be created.
  it('refuses a profile that shared no email', async () => {
    await expect(
      oauthService.findOrCreate({
        provider: 'facebook',
        providerId: 'f-2',
        emailVerified: false,
        displayName: 'No Email',
      }),
    ).rejects.toThrow(ConflictError)
    expect(await UserModel.countDocuments()).toBe(0)
  })
})

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

  describe('account linking — always refused on email match', () => {
    // SECURITY REGRESSION TEST. This app's local signup has no email-verification
    // step, so nothing stops an attacker from registering a victim's real email
    // address locally with a password only the attacker knows. findOrCreate used
    // to auto-link a federated identity onto that pre-existing account whenever
    // the OAuth PROVIDER claimed the email was verified — which every real Google
    // sign-in does. That let an attacker pre-register `victim@gmail.com`, then
    // silently inherit the account the moment the real victim signed in with
    // Google, while the attacker's original password kept working. There must be
    // no code path that links to a pre-existing account by email match, ever,
    // regardless of what the provider claims.
    it('refuses to link, and does not touch the pre-existing password, even though this looks like a legitimate provider profile', async () => {
      const existing = await userService.signup({
        username: 'ada',
        email: 'ada@example.com',
        password: 'attacker-chosen-password',
      })

      await expect(oauthService.findOrCreate(googleProfile())).rejects.toThrow(ConflictError)

      const doc = await UserModel.findById(existing.id)
      expect(doc?.googleId).toBeUndefined()
      expect(await UserModel.countDocuments()).toBe(1)
      // The attacker's original credentials must still be the only way in —
      // proving no takeover path was opened by the attempted OAuth sign-in.
      const stillLogsIn = await userService.verifyCredentials('ada', 'attacker-chosen-password')
      expect(stillLogsIn?.id).toBe(existing.id)
    })

    it('refuses to link a second identity onto an account already created via OAuth', async () => {
      const first = await oauthService.findOrCreate(googleProfile())

      await expect(
        oauthService.findOrCreate(googleProfile({ providerId: 'g-9', displayName: 'Ada' })),
      ).rejects.toThrow(ConflictError)

      const doc = await UserModel.findById(first.id)
      expect(doc?.googleId).toBe('g-1')
      expect(await UserModel.countDocuments()).toBe(1)
    })
  })

  // Google can withhold email when the user denies the scope. Without an
  // address we can neither dedupe nor ever reach them, so a half-account must
  // not be created.
  it('refuses a profile that shared no email', async () => {
    await expect(
      oauthService.findOrCreate({
        provider: 'google',
        providerId: 'g-2',
        displayName: 'No Email',
      }),
    ).rejects.toThrow(ConflictError)
    expect(await UserModel.countDocuments()).toBe(0)
  })
})

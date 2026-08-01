import { slugify } from '@blog/zod-shared'
import { ConflictError } from '../errors.js'
import { UserModel } from '../../models/user.js'

/**
 * Find-or-create for a federated identity (spec §13, P6).
 *
 * The whole point of this project is that the legacy app trusted identity it
 * should not have, so the linking rules here are deliberately strict — see
 * `linkableByEmail` below.
 */

export type OAuthProvider = 'google'

export type OAuthProfile = {
  provider: OAuthProvider
  providerId: string
  email?: string
  displayName?: string
}

const ID_FIELD: Record<OAuthProvider, 'googleId'> = {
  google: 'googleId',
}

/**
 * Turns a display name or email local-part into a free username. OAuth gives us
 * no username, and ours are unique, so one has to be derived.
 */
async function uniqueUsername(seed: string): Promise<string> {
  const base = (slugify(seed) || 'user').slice(0, 24)
  for (let n = 1; ; n++) {
    const candidate = n === 1 ? base : `${base}-${n}`
    if (!(await UserModel.findOne({ username: candidate }))) return candidate
  }
}

export const oauthService = {
  /**
   * Resolves a provider profile to a local account, creating one if needed.
   *
   * Three cases, in order:
   * 1. We already know this provider id — that is the account, full stop.
   * 2. An account exists with the same email — REFUSED, always. This project's
   *    local signup has no email-verification step, so a "provider verified
   *    this email" claim proves nothing about whether the pre-existing local
   *    account genuinely belongs to that person. Auto-linking on that basis let
   *    an attacker pre-register a victim's email locally with an
   *    attacker-chosen password, then silently inherit the account the moment
   *    the real victim signed in with that same email via Google — a
   *    persistent account takeover requiring no further action from the
   *    victim. There is no email-verification system in this app to make
   *    linking safe, so it is never attempted; the visitor is told to sign in
   *    with their password instead.
   * 3. Otherwise create a fresh passwordless account.
   */
  async findOrCreate(profile: OAuthProfile): Promise<{ id: string; username: string }> {
    const idField = ID_FIELD[profile.provider]
    const email = profile.email?.toLowerCase().trim()

    const known = await UserModel.findOne({ [idField]: profile.providerId })
    if (known) {
      return { id: known._id.toString(), username: known.username }
    }

    if (!email) {
      // Google can withhold email when the user denies the scope. Without one
      // we cannot dedupe or ever contact them, so this is a dead end, not a
      // silent half-account.
      throw new ConflictError(
        'That account did not share an email address, which this site needs to sign you in.',
      )
    }

    if (await UserModel.findOne({ email })) {
      throw new ConflictError(
        'An account with that email already exists. Sign in with your password instead.',
      )
    }

    const username = await uniqueUsername(profile.displayName || email.split('@')[0] || 'user')
    // No password field at all — this account can only ever be reached through
    // the provider, so there is no weak credential to guess.
    const created = await UserModel.create({
      username,
      email,
      [idField]: profile.providerId,
    })
    return { id: created._id.toString(), username: created.username }
  },
}

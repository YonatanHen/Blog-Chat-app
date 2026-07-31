import passport from 'passport'
import { Strategy as GoogleStrategy } from 'passport-google-oauth20'
import { oauthService, type OAuthProfile, type OAuthProvider } from './services/oauth.js'

/**
 * Passport strategies for the optional OAuth providers (spec §13, P6).
 *
 * Passport is used for the handshake ONLY — every strategy is registered with
 * `session: false` at the route, so Passport never serializes a user or touches
 * the session. Identity is written to `req.session.userId` by the callback route,
 * exactly as password login does, so there is one session model rather than two.
 */

export type ConfiguredProviders = Record<OAuthProvider, boolean>

export function callbackPath(provider: OAuthProvider): string {
  return `/api/v1/auth/${provider}/callback`
}

/**
 * oauthService never auto-links an OAuth identity to a pre-existing local
 * account by email match (see its findOrCreate) — this project's local signup
 * has no email-verification step, so no provider's "verified" claim can prove
 * the local account belongs to the same person. A provider-asserted
 * verification flag is therefore not read or plumbed through at all.
 */
type PassportEmail = { value: string }

function firstEmail(emails: PassportEmail[] | undefined): { email?: string } {
  return { email: emails?.[0]?.value }
}

export function registerOAuthStrategies(env: {
  GOOGLE_CLIENT_ID?: string
  GOOGLE_CLIENT_SECRET?: string
  PUBLIC_ORIGIN: string
}): ConfiguredProviders {
  const configured: ConfiguredProviders = { google: false }

  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
    passport.use(
      new GoogleStrategy(
        {
          clientID: env.GOOGLE_CLIENT_ID,
          clientSecret: env.GOOGLE_CLIENT_SECRET,
          callbackURL: `${env.PUBLIC_ORIGIN}${callbackPath('google')}`,
        },
        async (_accessToken, _refreshToken, profile, done) => {
          try {
            const { email } = firstEmail(profile.emails)
            const resolved: OAuthProfile = {
              provider: 'google',
              providerId: profile.id,
              email,
              displayName: profile.displayName,
            }
            done(null, await oauthService.findOrCreate(resolved))
          } catch (err) {
            done(err as Error)
          }
        },
      ),
    )
    configured.google = true
  }

  return configured
}

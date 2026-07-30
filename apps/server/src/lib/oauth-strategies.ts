import passport from 'passport'
import { Strategy as FacebookStrategy } from 'passport-facebook'
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
 * Google marks each address with whether it verified it. passport exposes that
 * per-email, and it is the input to the account-linking decision in oauthService
 * — so it is read here rather than assumed true.
 */
type PassportEmail = { value: string; verified?: boolean | string }

function firstEmail(emails: PassportEmail[] | undefined): {
  email?: string
  emailVerified: boolean
} {
  const first = emails?.[0]
  if (!first) return { emailVerified: false }
  // The field arrives as a boolean from some providers and the string 'true'
  // from others; anything else must count as unverified.
  const verified = first.verified === true || first.verified === 'true'
  return { email: first.value, emailVerified: verified }
}

export function registerOAuthStrategies(env: {
  GOOGLE_CLIENT_ID?: string
  GOOGLE_CLIENT_SECRET?: string
  FACEBOOK_APP_ID?: string
  FACEBOOK_APP_SECRET?: string
  PUBLIC_ORIGIN: string
}): ConfiguredProviders {
  const configured: ConfiguredProviders = { google: false, facebook: false }

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
            const { email, emailVerified } = firstEmail(profile.emails)
            const resolved: OAuthProfile = {
              provider: 'google',
              providerId: profile.id,
              email,
              emailVerified,
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

  if (env.FACEBOOK_APP_ID && env.FACEBOOK_APP_SECRET) {
    passport.use(
      new FacebookStrategy(
        {
          clientID: env.FACEBOOK_APP_ID,
          clientSecret: env.FACEBOOK_APP_SECRET,
          callbackURL: `${env.PUBLIC_ORIGIN}${callbackPath('facebook')}`,
          // Facebook returns no email unless it is asked for by name.
          profileFields: ['id', 'displayName', 'emails'],
        },
        async (_accessToken, _refreshToken, profile, done) => {
          try {
            const { email } = firstEmail(profile.emails as PassportEmail[] | undefined)
            const resolved: OAuthProfile = {
              provider: 'facebook',
              providerId: profile.id,
              email,
              // Facebook's Graph API exposes no per-address verification flag,
              // so we never treat its email as verified. That means it can
              // create an account but can never silently link to an existing
              // one — see oauthService.findOrCreate.
              emailVerified: false,
              displayName: profile.displayName,
            }
            done(null, await oauthService.findOrCreate(resolved))
          } catch (err) {
            done(err as Error)
          }
        },
      ),
    )
    configured.facebook = true
  }

  return configured
}

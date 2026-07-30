import { LoginSchema, SignupSchema } from '@blog/zod-shared'
import { ServiceUnavailableError, UnauthorizedError } from '../../lib/errors.js'
import { Router } from 'express'
import passport from 'passport'
import {
  registerOAuthStrategies,
  type ConfiguredProviders,
} from '../../lib/oauth-strategies.js'
import { destroySession, regenerateSession } from '../../lib/session.js'
import { userService } from '../../lib/services/user.js'
import { requireAuth } from '../../middleware/require-auth.js'
import { validate } from '../../middleware/validate.js'

export const authRouter = Router()

// Lazily registered so the strategies are built after loadEnv has validated the
// credential pairs, and so a deployment with no OAuth apps pays nothing.
let providers: ConfiguredProviders | undefined
function configuredProviders(): ConfiguredProviders {
  providers ??= registerOAuthStrategies({
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    FACEBOOK_APP_ID: process.env.FACEBOOK_APP_ID,
    FACEBOOK_APP_SECRET: process.env.FACEBOOK_APP_SECRET,
    PUBLIC_ORIGIN: process.env.PUBLIC_ORIGIN ?? 'http://localhost:5173',
  })
  return providers
}

/**
 * Which providers this deployment can actually offer. The sign-in page renders
 * a button per enabled provider, so a missing credential pair means the button
 * is absent rather than present and broken.
 */
authRouter.get('/providers', (_req, res) => {
  res.json(configuredProviders())
})

for (const provider of ['google', 'facebook'] as const) {
  const scope = provider === 'google' ? ['profile', 'email'] : ['email']

  authRouter.get(`/${provider}`, (req, res, next) => {
    if (!configuredProviders()[provider]) {
      throw new ServiceUnavailableError(`Signing in with ${provider} is not enabled here.`)
    }
    // session: false — Passport does the handshake, we own the session.
    passport.authenticate(provider, { scope, session: false })(req, res, next)
  })

  authRouter.get(`/${provider}/callback`, (req, res, next) => {
    if (!configuredProviders()[provider]) {
      throw new ServiceUnavailableError(`Signing in with ${provider} is not enabled here.`)
    }
    passport.authenticate(
      provider,
      { session: false, failureRedirect: '/login?error=oauth' },
      async (err: unknown, user?: { id: string; username: string }) => {
        // The provider bounced us, or findOrCreate refused to link — send the
        // reader back to the form with a message instead of a raw 500.
        if (err || !user) {
          const message = err instanceof Error ? err.message : 'Could not sign you in.'
          console.warn(`[AUTH] ${provider} sign-in failed:`, message)
          return res.redirect(`/login?error=${encodeURIComponent(message)}`)
        }
        try {
          // Same order as password login: regenerate BEFORE writing identity, so
          // a planted session id cannot end up authenticated.
          await regenerateSession(req)
          req.session.userId = user.id
          req.session.username = user.username
          console.info(`[AUTH] ${provider} sign-in successful:`, { id: user.id })
          res.redirect('/')
        } catch (sessionErr) {
          next(sessionErr)
        }
      },
    )(req, res, next)
  })
}

authRouter.post('/signup', validate(SignupSchema), async (req, res) => {
  console.log('[AUTH] POST /signup', { username: req.body.username, email: req.body.email })
  const user = await userService.signup(req.body)
  console.info('[AUTH] User created:', { id: user.id, username: user.username })
  // Regenerate BEFORE writing identity: an attacker who planted a session id
  // must not end up holding a session that is now authenticated.
  await regenerateSession(req)
  console.log('[AUTH] Session regenerated')
  req.session.userId = user.id
  req.session.username = user.username
  console.log('[AUTH] Session identity set', { userId: user.id })
  res.status(201).json(user)
})

authRouter.post('/login', validate(LoginSchema), async (req, res) => {
  console.log('[AUTH] POST /login', { username: req.body.username })
  const user = await userService.verifyCredentials(req.body.username, req.body.password)
  // One generic message for every failure mode. verifyCredentials already
  // returns null identically for "no such user" and "wrong password"; this
  // keeps the HTTP response identical too.
  if (!user) {
    console.warn('[AUTH] Login failed - invalid credentials for user:', req.body.username)
    throw new UnauthorizedError('Invalid username or password.')
  }

  console.info('[AUTH] Login successful:', { id: user.id, username: user.username })
  await regenerateSession(req)
  console.log('[AUTH] Session regenerated')
  req.session.userId = user.id
  req.session.username = user.username
  console.log('[AUTH] Session identity set', { userId: user.id })
  res.json(user)
})

// POST, never GET: the legacy GET logout meant any <img src="/logout"> on any
// page logged the visitor out. requireAuth makes an anonymous logout a 401.
authRouter.post('/logout', requireAuth, async (req, res) => {
  const userId = req.session.userId
  await destroySession(req)
  res.clearCookie('sid')
  // The session is gone, but a socket opened before now still holds its
  // identity in memory. Without this, logout leaves a live authenticated
  // socket behind.
  const disconnectUser = req.app.get('disconnectUser') as ((id: string) => void) | undefined
  if (userId && disconnectUser) disconnectUser(userId)
  res.status(204).end()
})

authRouter.get('/me', requireAuth, (req, res) => {
  res.json({ id: req.session.userId, username: req.session.username })
})

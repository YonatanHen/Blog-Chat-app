import { LoginSchema, SignupSchema } from '@blog/zod-shared'
import { UnauthorizedError } from '../../lib/errors.js'
import { Router } from 'express'
import { destroySession, regenerateSession } from '../../lib/session.js'
import { userService } from '../../lib/services/user.js'
import { requireAuth } from '../../middleware/require-auth.js'
import { validate } from '../../middleware/validate.js'

export const authRouter = Router()

authRouter.post('/signup', validate(SignupSchema), async (req, res) => {
  const user = await userService.signup(req.body)
  // Regenerate BEFORE writing identity: an attacker who planted a session id
  // must not end up holding a session that is now authenticated.
  await regenerateSession(req)
  req.session.userId = user.id
  req.session.username = user.username
  res.status(201).json(user)
})

authRouter.post('/login', validate(LoginSchema), async (req, res) => {
  const user = await userService.verifyCredentials(req.body.username, req.body.password)
  // One generic message for every failure mode. verifyCredentials already
  // returns null identically for "no such user" and "wrong password"; this
  // keeps the HTTP response identical too.
  if (!user) throw new UnauthorizedError('Invalid username or password.')

  await regenerateSession(req)
  req.session.userId = user.id
  req.session.username = user.username
  res.json(user)
})

// POST, never GET: the legacy GET logout meant any <img src="/logout"> on any
// page logged the visitor out. requireAuth makes an anonymous logout a 401.
authRouter.post('/logout', requireAuth, async (req, res) => {
  await destroySession(req)
  res.clearCookie('sid')
  res.status(204).end()
})

authRouter.get('/me', requireAuth, (req, res) => {
  res.json({ id: req.session.userId, username: req.session.username })
})

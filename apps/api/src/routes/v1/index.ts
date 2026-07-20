import { Router } from 'express'
import { ForbiddenError, NotFoundError, ValidationError } from '@blog/shared'
import { authRouter } from './auth.js'

export const v1Router = Router()

// Liveness probe. Used by the Compose healthcheck and the CI smoke test.
v1Router.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})

v1Router.use('/auth', authRouter)

// Routes that exist only to let app.test.ts assert the middleware chain from the
// outside. Registered only outside production so they can never ship.
if (process.env.NODE_ENV !== 'production') {
  v1Router.post('/echo-test', (req, res) => {
    res.json(req.body)
  })
  v1Router.get('/throw-test/not-found', () => {
    throw new NotFoundError('Nothing here.')
  })
  v1Router.get('/throw-test/validation', () => {
    throw new ValidationError('Invalid input.', { title: ['Too short'] })
  })
  v1Router.get('/throw-test/async-forbidden', async () => {
    await Promise.resolve()
    throw new ForbiddenError()
  })
  v1Router.get('/throw-test/boom', () => {
    throw new Error('db password rejected')
  })
  v1Router.post('/session-test/login', (req, res) => {
    req.session.userId = 'user-123'
    res.json({ ok: true })
  })
  v1Router.get('/session-test/whoami', (req, res) => {
    res.json({ userId: req.session?.userId ?? null })
  })
}

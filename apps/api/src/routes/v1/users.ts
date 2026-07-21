import { ForbiddenError, UpdateUserSchema } from '@blog/shared'
import { Router, type RequestHandler } from 'express'
import { userService } from '../../lib/services/user.js'
import { requireAuth } from '../../middleware/require-auth.js'
import { validate } from '../../middleware/validate.js'

export const usersRouter = Router()

/**
 * A User has no `author` field — the user IS the resource — so requireOwner's
 * shape does not fit. Same rule, compared directly: the session identity must
 * match the id in the URL.
 *
 * This is THE account-takeover fix. The legacy /update-user read the target id
 * AND the new password from the request body, so anyone could rewrite anyone.
 */
const requireSelf: RequestHandler<{ id: string }> = (req, _res, next) => {
  if (req.session.userId !== req.params.id) {
    next(new ForbiddenError('You can only modify your own account.'))
    return
  }
  next()
}

usersRouter.get('/:id', async (req, res) => {
  res.json(await userService.getPublicProfile(req.params.id))
})

usersRouter.patch(
  '/:id',
  requireAuth,
  requireSelf,
  validate(UpdateUserSchema),
  async (req, res) => {
    res.json(await userService.updateProfile(req.params.id, req.body))
  },
)

usersRouter.delete('/:id', requireAuth, requireSelf, async (req, res) => {
  await userService.remove(req.params.id)
  req.session.destroy(() => {})
  res.status(204).end()
})

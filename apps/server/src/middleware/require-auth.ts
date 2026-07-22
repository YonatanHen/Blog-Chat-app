import type { RequestHandler } from 'express'
import { UnauthorizedError } from '../lib/errors.js'

/**
 * 401 for anonymous callers. Mount on protected routers.
 *
 * Layer 1 of the three-layer authorization model (spec §5). It proves only that
 * SOMEONE is signed in — never that they may touch a particular resource. That
 * is requireOwner's job, and both are required.
 */
export const requireAuth: RequestHandler = (req, _res, next) => {
  if (!req.session?.userId) {
    next(new UnauthorizedError())
    return
  }
  next()
}

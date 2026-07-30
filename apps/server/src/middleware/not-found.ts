  import type { RequestHandler } from 'express'
import { NotFoundError } from '../lib/errors.js'

/**
 * Registered after every router and before the error handler: any request that
 * matched no route lands here and is converted into the standard error shape.
 */
export const notFound: RequestHandler = (req, _res, next) => {
  next(new NotFoundError(`Route not found: ${req.method} ${req.originalUrl}`))
}

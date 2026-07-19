import type { ErrorRequestHandler } from 'express'
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '@blog/shared'

/**
 * The ONE place a thrown error becomes an HTTP response. Services throw typed
 * errors; handlers never build an error response ad hoc. Must be registered
 * LAST, and must keep all four parameters — Express identifies an error handler
 * by arity, so dropping `_next` silently turns this into a normal middleware.
 */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof ValidationError) {
    res.status(400).json({ error: { message: err.message, fields: err.fields } })
    return
  }
  if (err instanceof UnauthorizedError) {
    res.status(401).json({ error: { message: err.message } })
    return
  }
  if (err instanceof ForbiddenError) {
    res.status(403).json({ error: { message: err.message } })
    return
  }
  if (err instanceof NotFoundError) {
    res.status(404).json({ error: { message: err.message } })
    return
  }
  if (err instanceof ConflictError) {
    res.status(409).json({ error: { message: err.message } })
    return
  }

  // express.json() rejects a malformed body with a SyntaxError carrying status 400.
  if (err instanceof SyntaxError && 'body' in err) {
    res.status(400).json({ error: { message: 'Malformed JSON body.' } })
    return
  }

  // Anything reaching here is a bug, not an expected outcome. Log it server-side
  // and return an opaque message: internal messages can carry connection strings.
  console.error(`Unhandled error on ${req.method} ${req.originalUrl}:`, err)
  res.status(500).json({ error: { message: 'Internal server error.' } })
}

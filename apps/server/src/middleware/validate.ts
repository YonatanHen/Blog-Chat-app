import type { RequestHandler } from 'express'
import { ValidationError } from '../lib/errors.js'
import type { ZodTypeAny } from 'zod'

/**
 * Validates req.body against a Zod schema and REPLACES it with the parsed
 * result, so handlers always see defaults applied, values coerced, and unknown
 * keys stripped (Zod objects are strip-by-default — a client cannot smuggle an
 * `author` field through to a service).
 *
 * The same schema validates the client form (spec §2), so the two cannot drift.
 */
export const validate =
  (schema: ZodTypeAny): RequestHandler =>
  (req, _res, next) => {
    const result = schema.safeParse(req.body ?? {})
    if (!result.success) {
      const fields = result.error.flatten().fieldErrors as Record<string, string[]>
      next(new ValidationError('Invalid input.', fields))
      return
    }
    req.body = result.data
    next()
  }

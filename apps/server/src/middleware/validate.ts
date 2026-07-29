import type { RequestHandler } from 'express'
import { ValidationError } from '../lib/errors.js'
import { redactSecrets } from '../lib/redact.js'
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
    // Gated AND redacted. This middleware wraps /auth/signup and /auth/login, so
    // an ungated body trace writes plaintext passwords into the platform's
    // production logs on every auth request.
    if (process.env.DEBUG) {
      console.log(`[VALIDATE] Validating ${req.method} ${req.path}`, redactSecrets(req.body ?? {}))
    }
    const result = schema.safeParse(req.body ?? {})
    if (!result.success) {
      // fieldErrors carries Zod's messages, never the submitted values — the
      // full flatten() is not logged, because formErrors can echo input.
      if (process.env.DEBUG) {
        console.error(`[VALIDATE] Validation failed:`, result.error.flatten().fieldErrors)
      }
      const fields = result.error.flatten().fieldErrors as Record<string, string[]>
      next(new ValidationError('Invalid input.', fields))
      return
    }
    if (process.env.DEBUG) console.log(`[VALIDATE] Validation passed`)
    req.body = result.data
    next()
  }

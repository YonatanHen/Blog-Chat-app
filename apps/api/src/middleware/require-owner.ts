import type { Request, RequestHandler } from 'express'
import type { Types } from 'mongoose'
import { ForbiddenError, NotFoundError, UnauthorizedError } from '@blog/shared'

export type OwnedResource = { author: Types.ObjectId }

/**
 * 403 unless the session identity matches the resource's author.
 *
 * Layer 2 of the three-layer model (spec §5). `load` fetches the resource from
 * the request (usually by req.params.slug). The comparison is ALWAYS against
 * req.session.userId and NEVER against a body field — the legacy app trusted
 * body fields, which is exactly how /update-user became an account takeover.
 */
export const requireOwner =
  <P>(load: (req: Request<P>) => Promise<OwnedResource | null>): RequestHandler<P> =>
  async (req, _res, next) => {
    const userId = req.session?.userId
    // Check identity before touching the database: an anonymous request is
    // already rejected, so loading the resource would be a wasted query.
    if (!userId) {
      next(new UnauthorizedError())
      return
    }

    try {
      const resource = await load(req)
      if (!resource) {
        next(new NotFoundError())
        return
      }
      if (!resource.author.equals(userId)) {
        next(new ForbiddenError())
        return
      }
      next()
    } catch (err) {
      // A loader failure is a real error; it must not masquerade as a 403.
      next(err)
    }
  }

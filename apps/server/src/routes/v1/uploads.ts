import { Router } from 'express'
import { createUploadService, type UploadService } from '../../lib/services/upload.js'
import { requireAuth } from '../../middleware/require-auth.js'

// Built once from the validated env. Parsing the URL per request would be
// wasted work, and constructing at import time would make a malformed
// CLOUDINARY_URL throw during module load rather than at boot validation.
let cached: UploadService | undefined
function defaultService(): UploadService {
  cached ??= createUploadService(process.env.CLOUDINARY_URL)
  return cached
}

/**
 * Hands the browser a short-lived signature so it can upload straight to
 * Cloudinary (spec §12). The bytes never transit this container.
 *
 * `folder` comes from the query as a key, never as a path — see signUpload.
 */
export function createUploadsRouter(injected?: UploadService): Router {
  const router = Router()

  router.post('/signature', requireAuth, (req, res) => {
    // Resolved per request, not at construction: a malformed CLOUDINARY_URL
    // must surface at boot validation, never as an import-time crash.
    const service = injected ?? defaultService()
    const folder = typeof req.query.folder === 'string' ? req.query.folder : 'covers'
    // Seconds, and Cloudinary rejects a signature more than an hour old — that
    // expiry is the whole reason this is safe to hand to a browser.
    const timestamp = Math.floor(Date.now() / 1000)
    res.json(service.signUpload(folder, timestamp))
  })

  return router
}

export const uploadsRouter = createUploadsRouter()

import { createHash } from 'node:crypto'
import { ServiceUnavailableError, ValidationError } from '../errors.js'

/**
 * Signed direct-to-Cloudinary uploads (spec §12). The API only ever hands out a
 * short-lived signature scoped to a folder and a format allowlist; the bytes go
 * browser → Cloudinary and never transit this container, which is what keeps
 * Render's egress allowance intact.
 *
 * No SDK: the signature is a documented SHA-1 over the signable params, so a
 * dependency would buy nothing and add a supply-chain surface.
 */

/** The only folders a signature may be issued for. */
const FOLDERS = { covers: 'blogchat/covers', avatars: 'blogchat/avatars' } as const
export type UploadFolder = keyof typeof FOLDERS

/** Cloudinary rejects the upload itself if the file is not one of these. */
const ALLOWED_FORMATS = 'jpg,jpeg,png,webp,avif'

export type SignedUpload = {
  cloudName: string
  apiKey: string
  folder: string
  timestamp: number
  allowedFormats: string
  signature: string
}

type Credentials = { cloudName: string; apiKey: string; apiSecret: string }

// cloudinary://<api_key>:<api_secret>@<cloud_name>
function parseCloudinaryUrl(raw: string): Credentials {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new Error('CLOUDINARY_URL is not a valid URL')
  }
  const cloudName = url.hostname
  const apiKey = decodeURIComponent(url.username)
  const apiSecret = decodeURIComponent(url.password)
  if (url.protocol !== 'cloudinary:' || !cloudName || !apiKey || !apiSecret) {
    throw new Error('CLOUDINARY_URL must look like cloudinary://<api_key>:<api_secret>@<cloud_name>')
  }
  return { cloudName, apiKey, apiSecret }
}

export function createUploadService(cloudinaryUrl: string | undefined) {
  // `?.trim()` guard: Compose renders an unset variable as '', and an empty
  // string must mean "no Cloudinary", not "malformed URL".
  const creds = cloudinaryUrl?.trim() ? parseCloudinaryUrl(cloudinaryUrl) : undefined

  function require(): Credentials {
    if (!creds) throw new ServiceUnavailableError('Image uploads are not configured on this server.')
    return creds
  }

  return {
    get isConfigured(): boolean {
      return creds !== undefined
    },

    /**
     * `folder` is a key into FOLDERS, never a path from the request — accepting a
     * caller-supplied path would let any signed-in user write anywhere in the account.
     */
    signUpload(folder: string, timestamp: number): SignedUpload {
      const { cloudName, apiKey, apiSecret } = require()
      const target = FOLDERS[folder as UploadFolder]
      if (!target) {
        throw new ValidationError('Unknown upload folder.', {
          folder: [`Must be one of: ${Object.keys(FOLDERS).join(', ')}`],
        })
      }

      // Sorted by key, joined k=v with &, secret appended, SHA-1 — Cloudinary's
      // documented scheme. Params not listed here are not signed, so Cloudinary
      // rejects the upload if the browser adds any of its own.
      const signable = `allowed_formats=${ALLOWED_FORMATS}&folder=${target}&timestamp=${timestamp}`
      const signature = createHash('sha1').update(`${signable}${apiSecret}`).digest('hex')

      return {
        cloudName,
        apiKey,
        folder: target,
        timestamp,
        allowedFormats: ALLOWED_FORMATS,
        signature,
      }
    },

    publicIdFrom,
  }
}

/**
 * Validates a public ID coming back from the browser before it is persisted.
 * The browser reports what Cloudinary returned, and a client can lie — so a
 * value that is not under one of our folders never reaches the database.
 *
 * Needs no credentials, so it is exported standalone: the post and user
 * services call it directly without constructing an upload service.
 */
export function publicIdFrom(publicId: string, field = 'coverImage'): string {
  const clean = publicId.trim()
  const allowed = Object.values(FOLDERS).some((f) => clean.startsWith(`${f}/`))
  if (!allowed || clean.includes('..') || clean.length > 200) {
    throw new ValidationError('Invalid image reference.', {
      [field]: ['Must be an image uploaded through this site.'],
    })
  }
  return clean
}

/**
 * Turns a stored public ID into a delivery URL at the serialization boundary,
 * so the client never needs the cloud name and the stored document stays
 * host-independent — changing delivery host is a config change, not a migration.
 *
 * `f_auto,q_auto` lets Cloudinary pick format and quality per browser, which is
 * most of the bandwidth saving on the free tier.
 */
export function deliveryUrl(publicId: string, width = 1200): string | undefined {
  const raw = process.env.CLOUDINARY_URL
  if (!raw?.trim()) return undefined
  try {
    const cloudName = new URL(raw).hostname
    return `https://res.cloudinary.com/${cloudName}/image/upload/f_auto,q_auto,w_${width}/${publicId}`
  } catch {
    return undefined
  }
}

export type UploadService = ReturnType<typeof createUploadService>

import { v2 as cloudinary } from 'cloudinary'
import { ServiceUnavailableError, ValidationError } from '../errors.js'

/**
 * Signed direct-to-Cloudinary uploads (spec §12). The API only ever hands out a
 * short-lived signature scoped to a folder and a format allowlist; the bytes go
 * browser → Cloudinary and never transit this container, which is what keeps
 * Render's egress allowance intact.
 *
 * Signing and URL building are the SDK's (`api_sign_request`, `url`) — the
 * signature algorithm is theirs to change, not ours to reimplement.
 */

/** The only folders a signature may be issued for. */
const FOLDERS = { covers: 'blogchat/covers', avatars: 'blogchat/avatars' } as const
export type UploadFolder = keyof typeof FOLDERS

/** Cloudinary rejects the upload itself if the file is not one of these. */
const ALLOWED_FORMATS = 'jpg,jpeg,png,webp,avif'

export type CloudinaryCredentials = {
  cloudName: string
  apiKey: string
  apiSecret: string
}

export type SignedUpload = {
  cloudName: string
  apiKey: string
  folder: string
  timestamp: number
  allowedFormats: string
  signature: string
}

/**
 * Reads credentials from the environment. All three or none — `loadEnv` rejects
 * a partial set at boot, and this mirrors that so a direct caller cannot get a
 * half-configured service.
 */
export function credentialsFromEnv(
  source: NodeJS.ProcessEnv = process.env,
): CloudinaryCredentials | undefined {
  const cloudName = source.CLOUDINARY_CLOUD_NAME?.trim()
  const apiKey = source.CLOUDINARY_API_KEY?.trim()
  const apiSecret = source.CLOUDINARY_API_SECRET?.trim()
  if (!cloudName || !apiKey || !apiSecret) return undefined
  return { cloudName, apiKey, apiSecret }
}

export function createUploadService(creds: CloudinaryCredentials | undefined) {
  if (creds) {
    // The SDK's own config, per its Node integration guide. Values come from the
    // gitignored .env via loadEnv — never a literal in source.
    cloudinary.config({
      cloud_name: creds.cloudName,
      api_key: creds.apiKey,
      api_secret: creds.apiSecret,
      secure: true,
    })
  }

  function required(): CloudinaryCredentials {
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
      const { cloudName, apiKey, apiSecret } = required()
      const target = FOLDERS[folder as UploadFolder]
      if (!target) {
        throw new ValidationError('Unknown upload folder.', {
          folder: [`Must be one of: ${Object.keys(FOLDERS).join(', ')}`],
        })
      }

      // Only these params are signed, so Cloudinary rejects the upload if the
      // browser adds any of its own.
      const signature = cloudinary.utils.api_sign_request(
        { allowed_formats: ALLOWED_FORMATS, folder: target, timestamp },
        apiSecret,
      )

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
 * `fetch_format`/`quality` auto let Cloudinary pick per browser, which is most
 * of the bandwidth saving on the free tier.
 */
export function deliveryUrl(publicId: string, width = 1200): string | undefined {
  const creds = credentialsFromEnv()
  if (!creds) return undefined
  return cloudinary.url(publicId, {
    cloud_name: creds.cloudName,
    secure: true,
    transformation: [{ fetch_format: 'auto', quality: 'auto', width, crop: 'limit' }],
  })
}

export type UploadService = ReturnType<typeof createUploadService>

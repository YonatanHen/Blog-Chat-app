import { ApiError, request } from './client.js'

export type UploadFolder = 'covers' | 'avatars'

export type UploadSignature = {
  cloudName: string
  apiKey: string
  folder: string
  timestamp: number
  allowedFormats: string
  signature: string
}

/**
 * The signature only constrains folder and format — Cloudinary has no signable
 * size parameter — so the byte limit is enforced here, before we ask for one.
 */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024

export class UploadsUnavailableError extends Error {
  constructor() {
    super('Image uploads are not set up on this server.')
    this.name = 'UploadsUnavailableError'
  }
}

export const uploadsApi = {
  signature: (folder: UploadFolder) =>
    request<UploadSignature>(`/api/v1/uploads/signature?folder=${folder}`, { method: 'POST' }),
}

/**
 * Signature from our API, bytes straight to Cloudinary. Resolves to the public
 * ID, which is what gets persisted — never the delivery URL, so the host can
 * change without rewriting documents.
 *
 * This is the one place the client talks to a third-party origin, which is why
 * it uses `fetch` directly instead of the same-origin `request` wrapper.
 */
export async function uploadImage(file: File, folder: UploadFolder): Promise<string> {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(`That image is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 5 MB.`)
  }

  let signed: UploadSignature
  try {
    // `request` resolves undefined on a 204; a signature route never sends one.
    const issued = await uploadsApi.signature(folder)
    if (!issued) throw new Error('The server issued no upload signature.')
    signed = issued
  } catch (err) {
    // 503 is the deployment saying it has no Cloudinary account, not a failure
    // the reader can retry — the caller shows a different message for it.
    if (err instanceof ApiError && err.status === 503) throw new UploadsUnavailableError()
    throw err
  }

  const form = new FormData()
  form.append('file', file)
  form.append('api_key', signed.apiKey)
  form.append('timestamp', String(signed.timestamp))
  form.append('folder', signed.folder)
  form.append('allowed_formats', signed.allowedFormats)
  form.append('signature', signed.signature)

  // No credentials: this is a third-party origin and our session cookie has no
  // business being sent to it.
  const res = await fetch(`https://api.cloudinary.com/v1_1/${signed.cloudName}/image/upload`, {
    method: 'POST',
    body: form,
  })

  const payload: unknown = await res.json().catch(() => null)
  if (!res.ok) {
    const message =
      typeof payload === 'object' && payload !== null && 'error' in payload
        ? String((payload as { error: { message?: string } }).error?.message ?? '')
        : ''
    throw new Error(message || 'Cloudinary rejected the upload.')
  }

  const publicId =
    typeof payload === 'object' && payload !== null && 'public_id' in payload
      ? (payload as { public_id?: unknown }).public_id
      : undefined
  if (typeof publicId !== 'string') throw new Error('Cloudinary returned no public ID.')
  return publicId
}

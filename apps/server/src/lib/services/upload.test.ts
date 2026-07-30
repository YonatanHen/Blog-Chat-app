import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { ServiceUnavailableError, ValidationError } from '../errors.js'
import { createUploadService, publicIdFrom } from './upload.js'

const URL_ = 'cloudinary://123456789:test-api-secret@demo-cloud'

describe('uploadService.signUpload', () => {
  const service = createUploadService(URL_)

  it('signs only the parameters Cloudinary signs, sorted and secret-suffixed', () => {
    const signed = service.signUpload('covers', 1_700_000_000)

    // Cloudinary's documented algorithm: the signable params sorted by key,
    // joined k=v with &, the api_secret appended, SHA-1 hex.
    const expected = createHash('sha1')
      .update(
        `allowed_formats=jpg,jpeg,png,webp,avif&folder=blogchat/covers&timestamp=1700000000test-api-secret`,
      )
      .digest('hex')

    expect(signed.signature).toBe(expected)
  })

  it('returns the public parameters the browser needs, and never the secret', () => {
    const signed = service.signUpload('covers', 1_700_000_000)

    expect(signed).toMatchObject({
      cloudName: 'demo-cloud',
      apiKey: '123456789',
      folder: 'blogchat/covers',
      timestamp: 1_700_000_000,
      allowedFormats: 'jpg,jpeg,png,webp,avif',
    })
    expect(JSON.stringify(signed)).not.toContain('test-api-secret')
  })

  // The folder is what scopes an upload. Accepting it from the request body
  // would let any signed-in user write anywhere in the account.
  it('rejects a folder outside the known set', () => {
    expect(() => service.signUpload('..\\/etc', 1_700_000_000)).toThrow(ValidationError)
    expect(() => service.signUpload('anything-else', 1_700_000_000)).toThrow(ValidationError)
  })

  it('scopes avatars and covers to separate folders', () => {
    expect(service.signUpload('avatars', 1).folder).toBe('blogchat/avatars')
    expect(service.signUpload('covers', 1).folder).toBe('blogchat/covers')
  })

  // Uploads are optional: the API must boot and serve every other route with no
  // Cloudinary credentials at all, and fail only when someone asks to upload.
  it('reports unavailable rather than throwing at construction when unconfigured', () => {
    const unconfigured = createUploadService(undefined)
    expect(unconfigured.isConfigured).toBe(false)
    expect(() => unconfigured.signUpload('covers', 1)).toThrow(ServiceUnavailableError)
  })

  it('rejects a malformed CLOUDINARY_URL loudly at construction', () => {
    expect(() => createUploadService('https://not-cloudinary')).toThrow(/CLOUDINARY_URL/)
    expect(() => createUploadService('cloudinary://missing-secret@cloud')).toThrow(/CLOUDINARY_URL/)
  })
})

describe('publicIdFrom', () => {
  // Cloudinary's response carries a full URL too, but we persist the public ID
  // so the delivery host can change without rewriting every document.
  it('accepts a public ID under one of our folders', () => {
    expect(publicIdFrom('blogchat/covers/ab12cd')).toBe('blogchat/covers/ab12cd')
    expect(publicIdFrom('blogchat/avatars/ab12cd')).toBe('blogchat/avatars/ab12cd')
  })

  it('rejects a public ID outside our folders', () => {
    expect(() => publicIdFrom('someone-elses/folder/x')).toThrow(ValidationError)
    expect(() => publicIdFrom('blogchat/../secrets/x')).toThrow(ValidationError)
  })

  // Needs no credentials — the post and user services call it directly.
  it('works without any Cloudinary configuration', () => {
    expect(publicIdFrom('blogchat/covers/ok')).toBe('blogchat/covers/ok')
  })
})

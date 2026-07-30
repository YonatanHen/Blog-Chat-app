import { v2 as cloudinary } from 'cloudinary'
import { describe, expect, it } from 'vitest'
import { ServiceUnavailableError, ValidationError } from '../errors.js'
import { createUploadService, credentialsFromEnv, deliveryUrl, publicIdFrom } from './upload.js'

const CREDS = { cloudName: 'demo-cloud', apiKey: '123456789', apiSecret: 'test-api-secret' }

describe('uploadService.signUpload', () => {
  const service = createUploadService(CREDS)

  it('signs exactly the parameters it declares, per the SDK', () => {
    const signed = service.signUpload('covers', 1_700_000_000)

    // Cross-checked against the SDK's own signer rather than a hand-rolled
    // digest: the algorithm is Cloudinary's to change, not ours to reimplement.
    const expected = cloudinary.utils.api_sign_request(
      {
        allowed_formats: 'jpg,jpeg,png,webp,avif',
        folder: 'blogchat/covers',
        timestamp: 1_700_000_000,
      },
      CREDS.apiSecret,
    )
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
    expect(JSON.stringify(signed)).not.toContain(CREDS.apiSecret)
  })

  // The folder is what scopes an upload. Accepting it from the request body
  // would let any signed-in user write anywhere in the account.
  it('rejects a folder outside the known set', () => {
    expect(() => service.signUpload('../etc', 1_700_000_000)).toThrow(ValidationError)
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
})

describe('credentialsFromEnv', () => {
  it('reads all three variables', () => {
    expect(
      credentialsFromEnv({
        CLOUDINARY_CLOUD_NAME: 'c',
        CLOUDINARY_API_KEY: 'k',
        CLOUDINARY_API_SECRET: 's',
      }),
    ).toEqual({ cloudName: 'c', apiKey: 'k', apiSecret: 's' })
  })

  // A partial set is the worst outcome — the app looks configured, then every
  // upload fails at Cloudinary with an opaque error. loadEnv rejects it at boot;
  // this mirrors that so a direct caller cannot get a half-configured service.
  it('treats a partial or blank set as unconfigured', () => {
    expect(credentialsFromEnv({ CLOUDINARY_CLOUD_NAME: 'c' })).toBeUndefined()
    expect(
      credentialsFromEnv({
        CLOUDINARY_CLOUD_NAME: 'c',
        CLOUDINARY_API_KEY: 'k',
        CLOUDINARY_API_SECRET: '   ',
      }),
    ).toBeUndefined()
    expect(credentialsFromEnv({})).toBeUndefined()
  })
})

describe('deliveryUrl', () => {
  it('returns undefined when Cloudinary is not configured', () => {
    const saved = process.env.CLOUDINARY_CLOUD_NAME
    delete process.env.CLOUDINARY_CLOUD_NAME
    expect(deliveryUrl('blogchat/covers/ab12cd')).toBeUndefined()
    if (saved !== undefined) process.env.CLOUDINARY_CLOUD_NAME = saved
  })

  it('builds a secure, auto-format delivery URL from the public ID', () => {
    process.env.CLOUDINARY_CLOUD_NAME = 'demo-cloud'
    process.env.CLOUDINARY_API_KEY = '123456789'
    process.env.CLOUDINARY_API_SECRET = 'test-api-secret'
    try {
      const url = deliveryUrl('blogchat/covers/ab12cd')
      expect(url).toContain('https://res.cloudinary.com/demo-cloud/')
      expect(url).toContain('f_auto')
      expect(url).toContain('q_auto')
      expect(url).toContain('blogchat/covers/ab12cd')
    } finally {
      delete process.env.CLOUDINARY_CLOUD_NAME
      delete process.env.CLOUDINARY_API_KEY
      delete process.env.CLOUDINARY_API_SECRET
    }
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

  it('works without any Cloudinary configuration', () => {
    expect(publicIdFrom('blogchat/covers/ok')).toBe('blogchat/covers/ok')
  })
})

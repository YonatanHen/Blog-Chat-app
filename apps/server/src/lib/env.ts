import { readFileSync } from 'node:fs'
import { z } from 'zod'

// Validated once at boot so a bad value stops the process. Never default a
// secret: a fallback SESSION_SECRET makes every production session forgeable.
/** Optional, where '' counts as unset — Compose and Render both emit ''. */
const optionalSecret = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
  z.string().min(1).optional(),
)

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters'),
  CLIENT_DIST: z.string().optional(),
  // Unset is fine: only the upload-signature endpoint reports 503.
  CLOUDINARY_CLOUD_NAME: optionalSecret,
  CLOUDINARY_API_KEY: optionalSecret,
  CLOUDINARY_API_SECRET: optionalSecret,
  // Independently optional — no credentials means no button, not a broken one.
  GOOGLE_CLIENT_ID: optionalSecret,
  GOOGLE_CLIENT_SECRET: optionalSecret,
  /** Origin the OAuth callback URLs are built from. */
  PUBLIC_ORIGIN: z.string().url().default('http://localhost:5173'),
  // Demo capacity caps (spec §3). Defaulted, so an unconfigured deploy is
  // still capped rather than wide open. Env-driven so tests can raise them.
  DEMO_MAX_USERS: z.coerce.number().int().nonnegative().default(20),
  DEMO_MAX_POSTS_PER_USER: z.coerce.number().int().nonnegative().default(3),
  DEMO_MAX_COMMENTS_PER_POST: z.coerce.number().int().nonnegative().default(10),
})
  // All-or-nothing per pair: a half-configured app looks fine, then fails at
  // the provider with an opaque error.
  .superRefine((env, ctx) => {
    const groups = [
      ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'],
      ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
    ] as const
    for (const keys of groups) {
      const present = keys.filter((k) => env[k] !== undefined)
      if (present.length > 0 && present.length < keys.length) {
        for (const key of keys.filter((k) => env[k] === undefined)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: `Set all of ${keys.join(', ')}, or none of them`,
          })
        }
      }
    }
  })

export type Env = z.infer<typeof EnvSchema>

const FILE_BACKED_KEYS = ['SESSION_SECRET', 'CLOUDINARY_API_SECRET'] as const

/**
 * Standalone on purpose: callers that need PUBLIC_ORIGIN alone (the OAuth
 * strategy setup in routes/v1/auth.ts) must not have to satisfy the full
 * EnvSchema — e.g. MONGODB_URI/SESSION_SECRET — just to resolve one field.
 * loadEnv() below is one caller of this, not the only path to it.
 */
export function resolvePublicOrigin(source: NodeJS.ProcessEnv = process.env): string {
  const explicit = source.PUBLIC_ORIGIN?.trim()
  if (explicit) return explicit
  // Render injects RENDER_EXTERNAL_URL. Without this fallback a deploy keeps
  // building localhost callbacks and breaks sign-in, with nothing failing loudly.
  const renderUrl = source.RENDER_EXTERNAL_URL?.trim()
  if (renderUrl) return renderUrl
  return 'http://localhost:5173'
}

function resolveFileBackedSecrets(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const resolved = { ...source }
  for (const key of FILE_BACKED_KEYS) {
    const filePath = source[`${key}_FILE`]
    if (filePath) {
      resolved[key] = readFileSync(filePath, 'utf-8').trim()
    }
  }
  resolved.PUBLIC_ORIGIN = resolvePublicOrigin(resolved)
  return resolved
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = EnvSchema.safeParse(resolveFileBackedSecrets(source))
  if (!result.success) {
    const details = Object.entries(result.error.flatten().fieldErrors)
      .map(([key, messages]) => `  ${key}: ${messages?.join(', ')}`)
      .join('\n')
    throw new Error(`Invalid environment:\n${details}`)
  }
  return result.data
}

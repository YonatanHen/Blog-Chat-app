import { readFileSync } from 'node:fs'
import { z } from 'zod'

// Validate the environment once, at boot, and fail loudly. A missing
// SESSION_SECRET must stop the process — never fall back to a default, because
// a hardcoded fallback silently makes every production session forgeable.
/** An optional value where '' means unset — see the CLOUDINARY_* note below. */
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
  // Optional: with no Cloudinary the API still boots and every other route
  // works — only the upload-signature endpoint reports 503. Empty strings are
  // treated as unset, because Compose and Render both render an absent variable
  // as '' rather than dropping it — without this the API refuses to boot.
  CLOUDINARY_CLOUD_NAME: optionalSecret,
  CLOUDINARY_API_KEY: optionalSecret,
  CLOUDINARY_API_SECRET: optionalSecret,
  // OAuth providers, each independently optional. A provider with no
  // credentials simply does not appear on the sign-in page.
  GOOGLE_CLIENT_ID: optionalSecret,
  GOOGLE_CLIENT_SECRET: optionalSecret,
  FACEBOOK_APP_ID: optionalSecret,
  FACEBOOK_APP_SECRET: optionalSecret,
  /** Absolute origin used to build OAuth callback URLs. **/
  PUBLIC_ORIGIN: z.string().url().default('http://localhost:5173'),
})
  // Each credential pair is all-or-nothing. A partial config is the worst
  // outcome: the app looks configured, then fails at the provider with an
  // opaque error.
  .superRefine((env, ctx) => {
    const groups = [
      ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'],
      ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
      ['FACEBOOK_APP_ID', 'FACEBOOK_APP_SECRET'],
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

function resolveFileBackedSecrets(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const resolved = { ...source }
  for (const key of FILE_BACKED_KEYS) {
    const filePath = source[`${key}_FILE`]
    if (filePath) {
      resolved[key] = readFileSync(filePath, 'utf-8').trim()
    }
  }
  // Render injects RENDER_EXTERNAL_URL (e.g. https://blogchat.onrender.com) into
  // every web service. Falling back to it means a deploy cannot silently keep
  // building localhost OAuth callbacks, which would break sign-in for everyone.
  if (!resolved.PUBLIC_ORIGIN?.trim() && resolved.RENDER_EXTERNAL_URL?.trim()) {
    resolved.PUBLIC_ORIGIN = resolved.RENDER_EXTERNAL_URL.trim()
  }
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

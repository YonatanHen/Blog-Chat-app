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
})
  // All three or none. A partial config is the worst outcome: the app looks
  // configured, then every upload fails at Cloudinary with an opaque error.
  .superRefine((env, ctx) => {
    const keys = ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'] as const
    const present = keys.filter((k) => env[k] !== undefined)
    if (present.length > 0 && present.length < keys.length) {
      for (const key of keys.filter((k) => env[k] === undefined)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: 'Set all three CLOUDINARY_* variables, or none of them',
        })
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

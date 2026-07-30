import { readFileSync } from 'node:fs'
import { z } from 'zod'

// Validate the environment once, at boot, and fail loudly. A missing
// SESSION_SECRET must stop the process — never fall back to a default, because
// a hardcoded fallback silently makes every production session forgeable.
const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters'),
  CLIENT_DIST: z.string().optional(),
  // Optional: with no Cloudinary the API still boots and every other route
  // works — only the upload-signature endpoint reports 503. An empty string is
  // treated as unset, because Compose and Render both render an absent variable
  // as '' rather than dropping it — without this the API refuses to boot.
  CLOUDINARY_URL: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z
      .string()
      .startsWith('cloudinary://', 'CLOUDINARY_URL must start with cloudinary://')
      .optional(),
  ),
})

export type Env = z.infer<typeof EnvSchema>

const FILE_BACKED_KEYS = ['SESSION_SECRET', 'CLOUDINARY_URL'] as const

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

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
})

export type Env = z.infer<typeof EnvSchema>

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = EnvSchema.safeParse(source)
  if (!result.success) {
    const details = Object.entries(result.error.flatten().fieldErrors)
      .map(([key, messages]) => `  ${key}: ${messages?.join(', ')}`)
      .join('\n')
    throw new Error(`Invalid environment:\n${details}`)
  }
  return result.data
}

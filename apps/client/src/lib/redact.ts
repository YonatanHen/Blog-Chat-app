/**
 * Masks credential-bearing keys before a value reaches a log sink.
 *
 * NOTE: a deliberate copy of apps/server/src/lib/redact.ts. packages/zod-shared
 * is Zod-schemas-only by design, so there is nowhere shared for a plain utility
 * to live yet. The two must change together. A second non-Zod util wanting to be
 * shared (the P4 JWT verifier is the other candidate, flagged open in the design
 * spec) is the signal to create a real shared package and delete both copies.
 */
const SENSITIVE_KEY =
  /^(password|confirmPassword|currentPassword|newPassword|token|secret|apiKey|authorization|cookie)$/i

/**
 * Recurses through plain objects and arrays. Inputs come from JSON.parse'd
 * request bodies, which cannot contain cycles, so no seen-set is needed.
 */
export function redactSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSecrets)
  if (value === null || typeof value !== 'object') return value

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, nested]) =>
      SENSITIVE_KEY.test(key) ? [key, '[redacted]'] : [key, redactSecrets(nested)],
    ),
  )
}

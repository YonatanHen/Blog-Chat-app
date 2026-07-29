import { SignupSchema } from '@blog/zod-shared'
import { z } from 'zod'

/**
 * Client-only, and deliberately NOT in packages/zod-shared.
 *
 * Confirmation is a typo guard for the person typing, not a security control:
 * the server gains nothing from a second copy of a password it already has, and
 * publishing a `confirmPassword` field in the shared schema would imply the API
 * validates something it has no reason to see. So the shared schema stays the
 * wire contract and this extends it for the form only — `handleSubmit` parses
 * with this, then sends the shared schema's fields.
 *
 * Extended from SignupSchema rather than redeclared, so the username, email and
 * password rules cannot drift from the ones the server enforces.
 */
export const SignupFormSchema = SignupSchema.extend({
  confirmPassword: z.string().min(1, 'Re-enter your password'),
}).refine((values) => values.password === values.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
})

export type SignupForm = z.infer<typeof SignupFormSchema>

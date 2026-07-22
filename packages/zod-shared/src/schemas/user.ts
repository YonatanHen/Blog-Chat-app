import { z } from 'zod'

export const SignupSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, 'Username must be at least 3 characters')
    .max(30, 'Username must be at most 30 characters')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Letters, numbers, hyphens and underscores only'),
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(200),
})

export const LoginSchema = z.object({
  username: z.string().trim().min(1, 'Enter your username'),
  password: z.string().min(1, 'Enter your password'),
})

export type Signup = z.infer<typeof SignupSchema>
export type Login = z.infer<typeof LoginSchema>

// PATCH /api/v1/users/:id — the id in the URL identifies the user and the
// session proves who is asking. The body carries NO id and NO username:
// the legacy /update-user took both from the body, which is exactly how it
// became an account takeover.
export const UpdateUserSchema = z.object({
  bio: z.string().trim().max(500, 'Bio must be at most 500 characters').optional(),
  image: z.string().trim().max(200).optional(),
  password: z.string().min(8, 'Password must be at least 8 characters').max(200).optional(),
})

export type UpdateUser = z.infer<typeof UpdateUserSchema>

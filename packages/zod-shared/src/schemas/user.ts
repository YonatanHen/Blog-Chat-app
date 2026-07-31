import { z } from 'zod'
import { PublicIdSchema } from './post.js'

const UsernameSchema = z
  .string()
  .trim()
  .min(3, 'Username must be at least 3 characters')
  .max(30, 'Username must be at most 30 characters')
  .regex(/^[a-zA-Z0-9_-]+$/, 'Letters, numbers, hyphens and underscores only')

const EmailSchema = z.string().trim().toLowerCase().email('Enter a valid email address')

const PasswordSchema = z.string().min(8, 'Password must be at least 8 characters').max(200)

export const SignupSchema = z.object({
  username: UsernameSchema,
  email: EmailSchema,
  password: PasswordSchema,
})

export const LoginSchema = z.object({
  username: z.string().trim().min(1, 'Enter your username'),
  password: z.string().min(1, 'Enter your password'),
})

export type Signup = z.infer<typeof SignupSchema>
export type Login = z.infer<typeof LoginSchema>

// PATCH /api/v1/users/:id — the id in the URL identifies the user and the
// session proves who is asking. The body carries NO id: the legacy
// /update-user took the id from the body, which is exactly how it became an
// account takeover. `username`/`email` below are values being SET, never used
// to select which account is modified — that selection stays exclusively the
// URL id vs. the session, enforced by requireSelf.
export const UpdateUserSchema = z.object({
  username: UsernameSchema.optional(),
  email: EmailSchema.optional(),
  bio: z.string().trim().max(500, 'Bio must be at most 500 characters').optional(),
  // Same PublicIdSchema coverImage uses — a Cloudinary public ID under one of
  // our own folders, never an arbitrary string. Re-checked server-side by
  // publicIdFrom() before persisting, same as coverImage.
  image: PublicIdSchema.nullish(),
  // Required only when the account already has a password; userService
  // enforces that conditionally since it depends on DB state the schema
  // can't see. Absent entirely for an OAuth account setting its first one.
  currentPassword: z.string().optional(),
  password: PasswordSchema.optional(),
})

export type UpdateUser = z.infer<typeof UpdateUserSchema>

// DELETE /api/v1/users/:id — same non-negotiable as above, the id always
// comes from the URL/session. This body only carries the confirmation proof:
// current password for an account that has one, else the typed-out username.
export const DeleteUserSchema = z.object({
  currentPassword: z.string().optional(),
  usernameConfirmation: z.string().optional(),
})

export type DeleteUser = z.infer<typeof DeleteUserSchema>

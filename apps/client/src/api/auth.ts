import { request } from './client.js'
import type { z } from 'zod'
import { SignupSchema, LoginSchema } from '@blog/zod-shared'
import { DEBUG } from '../lib/constants.js'

export type User = { id: string; username: string; email: string }

/** Which federated sign-in options this deployment can actually offer. */
export type AuthProviders = { google: boolean; facebook: boolean }

export const authApi = {
  signup: (input: z.infer<typeof SignupSchema>) => {
    // Never spread `input` into a log: it carries the plaintext password, and
    // the hardening pass forbids a credential reaching any log sink. Trace the
    // identifying fields only.
    if (DEBUG) console.log('[AUTH_API] signup called for:', input.username, input.email)
    return request<User>('/api/v1/auth/signup', { method: 'POST', body: JSON.stringify(input) })
  },

  login: (input: z.infer<typeof LoginSchema>) =>
    request<User>('/api/v1/auth/login', { method: 'POST', body: JSON.stringify(input) }),

  logout: () => request<void>('/api/v1/auth/logout', { method: 'POST' }),

  me: () => request<User>('/api/v1/auth/me'),

  providers: () => request<AuthProviders>('/api/v1/auth/providers'),
}

import { request } from './client.js'
import type { z } from 'zod'
import { SignupSchema, LoginSchema } from '@blog/zod-shared'

export type User = { id: string; username: string; email: string }

export const authApi = {
  signup: (input: z.infer<typeof SignupSchema>) =>
    request<User>('/api/v1/auth/signup', { method: 'POST', body: JSON.stringify(input) }),

  login: (input: z.infer<typeof LoginSchema>) =>
    request<User>('/api/v1/auth/login', { method: 'POST', body: JSON.stringify(input) }),

  logout: () => request<void>('/api/v1/auth/logout', { method: 'POST' }),

  me: () => request<User>('/api/v1/auth/me'),
}

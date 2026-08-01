import { request } from './client.js'
import type { z } from 'zod'
import { DeleteUserSchema, UpdateUserSchema } from '@blog/zod-shared'

/**
 * `email`/`hasPassword`/`oauthProvider` are only ever present when the
 * requester is viewing their own account — see userService.getPublicProfile's
 * viewerId gate. Anyone else's profile arrives without them.
 */
export type UserProfile = {
  id: string
  username: string
  bio?: string
  image?: string
  createdAt: string
  email?: string
  hasPassword?: boolean
  oauthProvider?: 'google' | 'facebook' | null
}

export const usersApi = {
  get: (id: string) => request<UserProfile>(`/api/v1/users/${id}`),

  update: (id: string, input: z.infer<typeof UpdateUserSchema>) =>
    request<UserProfile>(`/api/v1/users/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),

  remove: (id: string, confirmation: z.infer<typeof DeleteUserSchema>) =>
    request<void>(`/api/v1/users/${id}`, { method: 'DELETE', body: JSON.stringify(confirmation) }),
}

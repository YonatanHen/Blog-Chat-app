import { request } from './client.js'
import type { z } from 'zod'
import { UpdateUserSchema } from '@blog/zod-shared'

export type UserProfile = { id: string; username: string; bio?: string; avatar?: string }

export const usersApi = {
  get: (id: string) => request<UserProfile>(`/api/v1/users/${id}`),

  update: (id: string, input: z.infer<typeof UpdateUserSchema>) =>
    request<UserProfile>(`/api/v1/users/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),

  remove: (id: string) => request<void>(`/api/v1/users/${id}`, { method: 'DELETE' }),
}

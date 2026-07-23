import { request } from './client.js'
import type { z } from 'zod'
import { CreatePostSchema, UpdatePostSchema } from '@blog/zod-shared'

export type Post = {
  id: string
  title: string
  slug: string
  body: string
  premium: boolean
  gated: boolean
  author: { id: string; username: string }
  tags: string[]
  likeCount: number
  coverImage?: string
  createdAt: string
  updatedAt: string
}

export const postsApi = {
  list: () => request<Post[]>('/api/v1/posts'),

  get: (slug: string) => request<Post>(`/api/v1/posts/${slug}`),

  create: (input: z.infer<typeof CreatePostSchema>) =>
    request<Post>('/api/v1/posts', { method: 'POST', body: JSON.stringify(input) }),

  update: (slug: string, input: z.infer<typeof UpdatePostSchema>) =>
    request<Post>(`/api/v1/posts/${slug}`, { method: 'PATCH', body: JSON.stringify(input) }),

  remove: (slug: string) => request<void>(`/api/v1/posts/${slug}`, { method: 'DELETE' }),

  like: (slug: string) =>
    request<{ likeCount: number }>(`/api/v1/posts/${slug}/likes`, { method: 'PUT' }),

  unlike: (slug: string) =>
    request<{ likeCount: number }>(`/api/v1/posts/${slug}/likes`, { method: 'DELETE' }),
}

import { request } from './client.js'
import type { z } from 'zod'
import { CreatePostSchema, UpdatePostSchema } from '@blog/zod-shared'

export type Post = {
  id: string
  title: string
  slug: string
  body: string
  /** Server's verdict: this reader is anonymous, so `body` is only the teaser. */
  gated: boolean
  author: { id: string; username: string }
  tags: string[]
  likeCount: number
  coverImage?: string
  createdAt: string
  updatedAt: string
}

/** Feed filters, mirroring the server's `?q=` / `?tag=` query params. */
export type PostListParams = { q?: string; tag?: string }

/**
 * Builds `/api/v1/posts` with only the filters that carry a value. A
 * whitespace-only term is dropped rather than sent: an empty box is not a
 * search, and `$text: { $search: '' }` is an error on the server side.
 */
function listPath({ q, tag }: PostListParams): string {
  const search = new URLSearchParams()
  if (q?.trim()) search.set('q', q.trim())
  if (tag?.trim()) search.set('tag', tag.trim())
  const query = search.toString()
  return query ? `/api/v1/posts?${query}` : '/api/v1/posts'
}

export const postsApi = {
  list: (params: PostListParams = {}) => request<Post[]>(listPath(params)),

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

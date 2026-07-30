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
  /** Delivery URL derived server-side from coverImage. Absent when there is no cover. */
  coverUrl?: string
  createdAt: string
  updatedAt: string
}

/** Feed filters, mirroring the server's `?q=` / `?tag=` query params. */
export type PostListParams = { q?: string; tag?: string }

/**
 * Drops the filters that carry no value and trims the rest. A whitespace-only
 * term is not a search — and `$text: { $search: '' }` is an error on the server.
 *
 * Exported because the cache key has to be built from the SAME normalized
 * object the URL is. Normalizing in only one of the two places would cache
 * `{ q: 'mongo ' }`, `{ q: 'mongo' }` and `{}` vs `{ q: '' }` as distinct
 * entries that all fetch one identical URL.
 */
export function normalizeListParams({ q, tag }: PostListParams): PostListParams {
  const normalized: PostListParams = {}
  if (q?.trim()) normalized.q = q.trim()
  if (tag?.trim()) normalized.tag = tag.trim()
  return normalized
}

function listPath(params: PostListParams): string {
  const { q, tag } = normalizeListParams(params)
  const search = new URLSearchParams()
  if (q) search.set('q', q)
  if (tag) search.set('tag', tag)
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

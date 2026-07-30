import { request } from './client.js'
import type { CreateComment, UpdateComment } from '@blog/zod-shared'

export type Comment = {
  id: string
  body: string
  author: { id: string; username: string }
  /** null for a root comment, the parent comment's id for a reply. */
  parent: string | null
  createdAt: string
  updatedAt: string
}

const base = (slug: string) => `/api/v1/posts/${slug}/comments`

export const commentsApi = {
  // No `gated` here and none expected: the wall is on post bodies only, so this
  // returns the same payload signed in or not.
  list: (slug: string) => request<Comment[]>(base(slug)),

  create: (slug: string, input: CreateComment) =>
    request<Comment>(base(slug), { method: 'POST', body: JSON.stringify(input) }),

  update: (slug: string, commentId: string, input: UpdateComment) =>
    request<Comment>(`${base(slug)}/${commentId}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),

  remove: (slug: string, commentId: string) =>
    request<void>(`${base(slug)}/${commentId}`, { method: 'DELETE' }),
}

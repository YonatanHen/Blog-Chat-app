import { QueryClient } from '@tanstack/react-query'
import type { PostListParams } from '../api/posts.js'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 5 * 60 * 1000 },
    mutations: { retry: 1 },
  },
})

export const queryKeys = {
  me: ['auth', 'me'] as const,
  posts: {
    /**
     * The invalidation target, never a query key of its own: every posts key
     * below starts with `['posts']`, and TanStack matches by prefix, so
     * invalidating this reaches the feed under every set of filters plus every
     * detail. Filtered feeds must cache separately — hence `list(params)` — but
     * they must all still be dropped together when a post changes.
     */
    all: ['posts'] as const,
    list: (params: PostListParams = {}) => ['posts', 'list', params] as const,
    detail: (slug: string) => ['posts', slug] as const,
    likes: {
      detail: (slug: string) => ['posts', slug, 'likes'] as const,
    },
  },
  users: {
    detail: (id: string) => ['users', id] as const,
  },
}

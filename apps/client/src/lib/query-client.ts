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
  providers: ['auth', 'providers'] as const,
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
    /**
     * Namespaced under 'detail' rather than sitting directly on the slug: with
     * `['posts', slug]`, a post slugged "list" produces `['posts', 'list']`,
     * which prefix-matches — and so invalidates — every filtered feed.
     */
    detail: (slug: string) => ['posts', 'detail', slug] as const,
    likes: {
      detail: (slug: string) => ['posts', 'detail', slug, 'likes'] as const,
    },
  },
  // Deliberately NOT nested under ['posts', slug]: a comment payload does not
  // depend on the viewer the way a post body does, so the auth transitions that
  // invalidate ['posts'] have no reason to drop the thread as well.
  comments: {
    list: (slug: string) => ['comments', slug] as const,
  },
  users: {
    detail: (id: string) => ['users', id] as const,
  },
  chat: {
    messages: ['chat', 'messages'] as const,
  },
}

import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 5 * 60 * 1000 },
    mutations: { retry: 1 },
  },
})

export const queryKeys = {
  me: ['auth', 'me'] as const,
  posts: {
    list: ['posts'] as const,
    detail: (slug: string) => ['posts', slug] as const,
    likes: {
      detail: (slug: string) => ['posts', slug, 'likes'] as const,
    },
  },
  users: {
    detail: (id: string) => ['users', id] as const,
  },
}

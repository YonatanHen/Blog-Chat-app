import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { CreatePost, UpdatePost } from '@blog/zod-shared'
import { postsApi } from '../api/posts.js'
import { queryKeys } from '../lib/query-client.js'

/**
 * The feed. Deliberately not keyed by the viewer: the session cookie rides on
 * the request, and `useLogin`/`useLogout` invalidate this key, so signing in
 * refetches and the teasers come back ungated.
 */
export function usePosts() {
  return useQuery({ queryKey: queryKeys.posts.list, queryFn: postsApi.list })
}

export function useCreatePost() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreatePost) => postsApi.create(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.posts.list }),
  })
}

export function useUpdatePost(slug: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: UpdatePost) => postsApi.update(slug, input),
    onSuccess: () => {
      // ['posts'] is a prefix of ['posts', slug], so one invalidation would do —
      // but the slug changes when the title does, and the old detail key is the
      // one the editor is still mounted on.
      queryClient.invalidateQueries({ queryKey: queryKeys.posts.list })
      queryClient.invalidateQueries({ queryKey: queryKeys.posts.detail(slug) })
    },
  })
}

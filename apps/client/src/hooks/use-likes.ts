import { useMutation, useQueryClient } from '@tanstack/react-query'
import { postsApi } from '../api/posts.js'
import { queryKeys } from '../lib/query-client.js'
import type { Post } from '../api/posts.js'

/**
 * Optimistic, unlike `useDeletePost` — a like is cheap and reversible, so the
 * count moves before the server answers and `onError` puts it back. The
 * rollback is the point: the failure path is tested, not just the happy one.
 */
export function useLikePost(slug: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => postsApi.like(slug),
    onMutate: async () => {
      // An in-flight refetch would otherwise land after this and clobber it.
      await queryClient.cancelQueries({ queryKey: queryKeys.posts.detail(slug) })
      const previous = queryClient.getQueryData<Post>(queryKeys.posts.detail(slug))
      if (previous) {
        queryClient.setQueryData<Post>(queryKeys.posts.detail(slug), {
          ...previous,
          likeCount: previous.likeCount + 1,
        })
      }
      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(queryKeys.posts.detail(slug), context.previous)
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.posts.detail(slug) }),
  })
}

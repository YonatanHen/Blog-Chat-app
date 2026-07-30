import { useMutation, useQueryClient } from '@tanstack/react-query'
import { postsApi } from '../api/posts.js'
import { queryKeys } from '../lib/query-client.js'
import type { Post } from '../api/posts.js'

/**
 * Optimistic, unlike `useDeletePost` — a like is cheap and reversible, so the
 * count moves before the server answers and `onError` puts it back. The
 * rollback is the point: the failure path is tested, not just the happy one.
 *
 * Patches both caches that hold a likeCount for this post — the detail query
 * AND every cached feed variant under `posts.lists` — because they are two
 * independent copies of the same number. Bumping only the detail cache left
 * the feed showing the pre-like count until a hard refresh, since the list's
 * 5-minute staleTime meant navigating back never triggered a refetch.
 */
export function useLikePost(slug: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => postsApi.like(slug),
    onMutate: async () => {
      // An in-flight refetch would otherwise land after this and clobber it.
      await queryClient.cancelQueries({ queryKey: queryKeys.posts.all })

      const previousDetail = queryClient.getQueryData<Post>(queryKeys.posts.detail(slug))
      if (previousDetail) {
        queryClient.setQueryData<Post>(queryKeys.posts.detail(slug), {
          ...previousDetail,
          likeCount: previousDetail.likeCount + 1,
        })
      }

      // Snapshotted BEFORE mutating: setQueriesData's return value is the data
      // AFTER the updater runs, not the prior value, so it cannot double as the
      // rollback snapshot — this must be captured separately, first.
      const previousLists = queryClient.getQueriesData<Post[]>({ queryKey: queryKeys.posts.lists })
      queryClient.setQueriesData<Post[]>({ queryKey: queryKeys.posts.lists }, (old) =>
        old?.map((post) => (post.slug === slug ? { ...post, likeCount: post.likeCount + 1 } : post)),
      )

      return { previousDetail, previousLists }
    },
    onError: (_err, _vars, context) => {
      if (context?.previousDetail) {
        queryClient.setQueryData(queryKeys.posts.detail(slug), context.previousDetail)
      }
      context?.previousLists?.forEach(([key, data]) => queryClient.setQueryData(key, data))
    },
    // Every posts query, not just this detail — the feed's cached lists carry
    // their own copy of likeCount and must catch up too.
    onSettled: () => queryClient.invalidateQueries({ queryKey: queryKeys.posts.all }),
  })
}

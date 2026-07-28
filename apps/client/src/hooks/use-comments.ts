import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { CreateComment, UpdateComment } from '@blog/zod-shared'
import { commentsApi } from '../api/comments.js'
import { queryKeys } from '../lib/query-client.js'

export function useComments(slug: string) {
  return useQuery({
    queryKey: queryKeys.comments.list(slug),
    queryFn: () => commentsApi.list(slug),
    enabled: Boolean(slug),
  })
}

/**
 * Every comment mutation invalidates the list and waits for the refetch, rather
 * than patching the cache the way `useLikePost` does.
 *
 * A like moves one scalar, so an optimistic patch is trivially reversible. A
 * comment changes the *shape* of the thread — a create needs a server-assigned
 * id that replies will hang off, and a delete cascades to a subtree whose extent
 * only the server knows. There is no cheap patch that is also correct, which is
 * the same reason `useDeletePost` invalidates instead of guessing.
 */
function useCommentMutation<TInput>(slug: string, mutationFn: (input: TInput) => Promise<unknown>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.comments.list(slug) }),
  })
}

export function useCreateComment(slug: string) {
  return useCommentMutation(slug, (input: CreateComment) => commentsApi.create(slug, input))
}

export function useUpdateComment(slug: string) {
  return useCommentMutation(slug, ({ id, ...input }: UpdateComment & { id: string }) =>
    commentsApi.update(slug, id, input),
  )
}

export function useDeleteComment(slug: string) {
  return useCommentMutation(slug, (id: string) => commentsApi.remove(slug, id))
}

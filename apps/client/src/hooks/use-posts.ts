import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { CreatePost, UpdatePost } from '@blog/zod-shared'
import { normalizeListParams, postsApi, type PostListParams } from '../api/posts.js'
import { queryKeys } from '../lib/query-client.js'

/**
 * The feed, optionally filtered. Keyed by the filters so each search term
 * caches on its own, but deliberately NOT keyed by the viewer: the session
 * cookie rides on the request, and `useLogin`/`useLogout` invalidate `posts.all`
 * — a prefix of every key here — so signing in refetches and the teasers come
 * back ungated.
 *
 * `keepPreviousData` keeps the previous results on screen while the next term
 * loads. Without it every keystroke that survives the debounce is a brand new
 * key, so `isPending` flips back to true and the feed blinks to skeletons.
 *
 * Normalizing before both the key and the request is what keeps them in step:
 * a cleared box (`{ q: '' }`) must hit the same cache entry as no filters at all.
 */
export function usePosts(params: PostListParams = {}) {
  const filters = normalizeListParams(params)
  return useQuery({
    queryKey: queryKeys.posts.list(filters),
    queryFn: () => postsApi.list(filters),
    placeholderData: keepPreviousData,
  })
}

/**
 * A single post. Same reasoning as `usePosts`: the payload is viewer-dependent
 * (`gated` and the full body are decided server-side per session), but
 * the key stays viewer-agnostic because auth transitions invalidate `['posts']`,
 * which is a prefix of this key.
 */
export function usePost(slug: string) {
  return useQuery({
    queryKey: queryKeys.posts.detail(slug),
    queryFn: () => postsApi.get(slug),
    enabled: Boolean(slug),
  })
}

export function useCreatePost() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreatePost) => postsApi.create(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.posts.all }),
  })
}

export function useDeletePost() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (slug: string) => postsApi.remove(slug),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.posts.all }),
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
      queryClient.invalidateQueries({ queryKey: queryKeys.posts.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.posts.detail(slug) })
    },
  })
}

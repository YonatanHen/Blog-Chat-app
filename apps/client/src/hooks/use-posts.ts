import { useQuery } from '@tanstack/react-query'
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

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { authApi } from '../api/auth.js'
import { ApiError } from '../api/client.js'
import { queryKeys } from '../lib/query-client.js'

export type AuthUser = { id: string; username: string }
export type LoginInput = { username: string; password: string }
export type SignupInput = { username: string; email: string; password: string }

export function useMe() {
  return useQuery({
    queryKey: queryKeys.me,
    queryFn: async (): Promise<AuthUser | null> => {
      try {
        const user = await authApi.me()
        return user ?? null
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null
        throw err
      }
    },
  })
}

/**
 * Every auth transition ends the same way, so it is written once here: record
 * the new identity, then drop viewer-scoped data.
 *
 * That second step is not optional. Post payloads depend on who is asking —
 * `gated` and the full body are decided per-viewer (spec §6) — so a change of
 * identity invalidates every cached post. Without it, signing in leaves the feed
 * showing "sign in to read" until staleTime expires.
 *
 * `resolveUser` maps the request's result to the new `me` value: login and
 * signup return the user, logout has none.
 */
function useAuthTransition<TInput, TResult>(
  mutationFn: (input: TInput) => Promise<TResult>,
  resolveUser: (result: TResult) => AuthUser | null,
) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn,
    onSuccess: (result) => {
      queryClient.setQueryData(queryKeys.me, resolveUser(result))
      // ['posts'] is a prefix of ['posts', slug], so detail queries go too.
      return queryClient.invalidateQueries({ queryKey: queryKeys.posts.list })
    },
  })
}

const signedIn = (user: AuthUser | undefined) => user ?? null

export function useLogin() {
  return useAuthTransition((input: LoginInput) => authApi.login(input), signedIn)
}

export function useSignup() {
  return useAuthTransition((input: SignupInput) => authApi.signup(input), signedIn)
}

export function useLogout() {
  // `_: void` keeps TInput inferable, so callers still write logout.mutate().
  return useAuthTransition(
    (_: void) => authApi.logout(),
    () => null,
  )
}

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

export function useLogin() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: LoginInput) => authApi.login(input),
    onSuccess: (user) => queryClient.setQueryData(queryKeys.me, user),
  })
}

export function useSignup() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: SignupInput) => authApi.signup(input),
    onSuccess: (user) => queryClient.setQueryData(queryKeys.me, user),
  })
}

export function useLogout() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => authApi.logout(),
    onSuccess: () => queryClient.setQueryData(queryKeys.me, null),
  })
}

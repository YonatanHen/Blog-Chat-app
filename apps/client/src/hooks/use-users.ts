import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { DeleteUser, UpdateUser } from '@blog/zod-shared'
import { usersApi } from '../api/users.js'
import { queryKeys } from '../lib/query-client.js'

/**
 * Shared by `AccountPage` (self) and `UserProfilePage` (anyone) — the payload
 * just varies by viewer, decided server-side (see userService.getPublicProfile).
 */
export function useUserProfile(id: string) {
  return useQuery({
    queryKey: queryKeys.users.detail(id),
    queryFn: () => usersApi.get(id),
    enabled: Boolean(id),
  })
}

export function useUpdateUser(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: UpdateUser) => usersApi.update(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users.detail(id) })
      // A username change must show up in PageShell's header immediately.
      queryClient.invalidateQueries({ queryKey: queryKeys.me })
    },
  })
}

export function useDeleteUser(id: string) {
  return useMutation({
    mutationFn: (confirmation: DeleteUser) => usersApi.remove(id, confirmation),
  })
}

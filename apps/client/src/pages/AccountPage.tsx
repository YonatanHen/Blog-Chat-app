import { useState } from 'react'
import { UpdateUserSchema } from '@blog/zod-shared'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { ApiError } from '../api/client.js'
import { AutoForm } from '../components/patterns/AutoForm.js'
import { EmptyState } from '../components/patterns/EmptyState.js'
import { RequireAuth } from '../components/patterns/RequireAuth.js'
import { Button } from '../components/ui/button.js'
import { Input } from '../components/ui/input.js'
import { Label } from '../components/ui/label.js'
import { PasswordInput } from '../components/ui/password-input.js'
import { Skeleton } from '../components/ui/skeleton.js'
import { useMe } from '../hooks/use-auth.js'
import { useDeleteUser, useUpdateUser, useUserProfile } from '../hooks/use-users.js'
import { useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '../lib/query-client.js'

function AccountPageContent() {
  // RequireAuth already redirected an anonymous visitor before this renders,
  // so `me` is guaranteed here.
  const { data: me } = useMe()
  const id = me!.id
  const { data: profile, isPending, isError } = useUserProfile(id)
  const updateUser = useUpdateUser(id)
  const deleteUser = useDeleteUser(id)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [confirmValue, setConfirmValue] = useState('')

  if (isPending) return <Skeleton className="h-64" />
  if (isError || !profile || profile.hasPassword === undefined) {
    return <EmptyState message="Could not load your account." />
  }

  // image editing is out of scope for now, and email is locked server-side for
  // an OAuth-linked account — hidden here rather than shown and always 400ing.
  // currentPassword only applies to an account that already has one; an OAuth
  // account setting its first password has nothing to verify against.
  const formSchema = UpdateUserSchema.omit({
    image: true,
    ...(profile.oauthProvider ? { email: true } : {}),
    ...(!profile.hasPassword ? { currentPassword: true } : {}),
  })

  const hasPassword = profile.hasPassword

  return (
    <div className="flex max-w-lg flex-col gap-10">
      <div>
        <h1 className="mb-4 text-xl font-semibold">Account</h1>
        <AutoForm
          schema={formSchema}
          initialValues={profile}
          submitLabel="Save changes"
          onSubmit={(values) =>
            updateUser.mutate(values, {
              onSuccess: () => toast.success('Account updated.'),
              onError: (err) =>
                toast.error(err instanceof ApiError ? err.message : 'Could not save changes.'),
            })
          }
        />
      </div>

      <div className="flex flex-col gap-3 border-t border-[var(--border)] pt-6">
        <h2 className="text-sm font-semibold text-[var(--destructive)]">Danger zone</h2>
        <p className="text-sm text-[var(--muted-foreground)]">
          Deleting your account permanently removes your posts, comments, and likes.
        </p>
        <div className="flex flex-col gap-1">
          <Label htmlFor="delete-confirm">
            {hasPassword ? 'Enter your password to confirm' : 'Type your username to confirm'}
          </Label>
          {hasPassword ? (
            <PasswordInput
              id="delete-confirm"
              value={confirmValue}
              onChange={(e) => setConfirmValue(e.target.value)}
            />
          ) : (
            <Input
              id="delete-confirm"
              type="text"
              value={confirmValue}
              onChange={(e) => setConfirmValue(e.target.value)}
            />
          )}
        </div>
        <Button
          variant="destructive"
          disabled={deleteUser.isPending || !confirmValue}
          onClick={() =>
            deleteUser.mutate(
              hasPassword
                ? { currentPassword: confirmValue }
                : { usernameConfirmation: confirmValue },
              {
                onSuccess: () => {
                  queryClient.setQueryData(queryKeys.me, null)
                  queryClient.invalidateQueries({ queryKey: queryKeys.posts.all })
                  navigate('/')
                },
                onError: (err) =>
                  toast.error(err instanceof ApiError ? err.message : 'Could not delete your account.'),
              },
            )
          }
        >
          Delete account
        </Button>
      </div>
    </div>
  )
}

export function AccountPage() {
  return (
    <RequireAuth>
      <AccountPageContent />
    </RequireAuth>
  )
}

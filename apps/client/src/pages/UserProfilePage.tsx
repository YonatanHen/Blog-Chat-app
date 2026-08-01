import { Link, useParams } from 'react-router'
import { EmptyState } from '../components/patterns/EmptyState.js'
import { Skeleton } from '../components/ui/skeleton.js'
import { useMe } from '../hooks/use-auth.js'
import { useUserProfile } from '../hooks/use-users.js'
import { formatDate } from '../lib/format-date.js'

/**
 * Public, read-only — anyone's username links here. Editing only ever
 * happens on `/account`, reached from this page via "Edit profile" when the
 * viewer is looking at themselves.
 */
export function UserProfilePage() {
  const { id = '' } = useParams<{ id: string }>()
  const { data: me } = useMe()
  const { data: profile, isPending, isError } = useUserProfile(id)

  if (isPending) return <Skeleton className="h-64" />
  if (isError || !profile) return <EmptyState message="Could not find this user." />

  const isSelf = me?.id === id

  return (
    <div className="flex max-w-lg flex-col gap-4">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-xl font-semibold">{profile.username}</h1>
        {isSelf && (
          <Link to="/account" className="text-sm underline">
            Edit profile
          </Link>
        )}
      </div>
      <p className="font-mono text-xs tracking-[0.09em] text-[var(--ink-faint)] uppercase">
        Joined <time dateTime={profile.createdAt}>{formatDate(profile.createdAt)}</time>
      </p>
      {profile.bio && <p className="text-sm leading-relaxed whitespace-pre-wrap">{profile.bio}</p>}
    </div>
  )
}

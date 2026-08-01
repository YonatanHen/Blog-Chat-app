import { Heart } from 'lucide-react'
import { useLikePost, useUnlikePost } from '../../hooks/use-likes.js'
import { Button } from '../ui/button.js'

/**
 * `liked` picks which mutation a click fires and fills the heart when true.
 * Both directions are idempotent server-side, so a double click race is a
 * no-op, not a double count or a stuck toggle.
 */
export function LikeButton({
  slug,
  likeCount,
  liked = false,
}: {
  slug: string
  likeCount: number
  liked?: boolean
}) {
  const like = useLikePost(slug)
  const unlike = useUnlikePost(slug)
  const pending = like.isPending || unlike.isPending

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => (liked ? unlike.mutate() : like.mutate())}
      disabled={pending}
      aria-pressed={liked}
    >
      <Heart
        className={liked ? 'mr-1 size-4 fill-current text-[var(--primary)]' : 'mr-1 size-4'}
      />{' '}
      {likeCount}
    </Button>
  )
}

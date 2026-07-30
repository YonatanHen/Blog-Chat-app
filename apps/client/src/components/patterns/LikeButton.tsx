import { Heart } from 'lucide-react'
import { useLikePost } from '../../hooks/use-likes.js'
import { Button } from '../ui/button.js'

/**
 * No `liked` prop: `PostDto` carries no per-viewer "did I like this" flag, so
 * the button shows the raw count and lets the mutation run either way. Like is
 * idempotent server-side (unique index on `(user, post)`), so a second click is
 * a no-op 200, not a double count.
 */
export function LikeButton({ slug, likeCount }: { slug: string; likeCount: number }) {
  const like = useLikePost(slug)
  return (
    <Button variant="outline" size="sm" onClick={() => like.mutate()} disabled={like.isPending}>
      <Heart className="mr-1 size-4" /> {likeCount}
    </Button>
  )
}

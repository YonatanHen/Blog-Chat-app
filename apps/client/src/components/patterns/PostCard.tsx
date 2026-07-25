import { Link } from 'react-router'
import type { Post } from '../../api/posts.js'
import { Card } from '../ui/card.js'

/**
 * A feed entry. `post.body` is always a teaser here — the list endpoint never
 * ships full bodies — so this renders it verbatim and never truncates.
 * `post.gated` is the server's verdict on whether this reader may open the post;
 * the card only relays it (spec §6), it does not decide it.
 */
export function PostCard({ post }: { post: Post }) {
  return (
    <Card className="flex flex-col gap-2">
      <Link to={`/blog/${post.slug}`} className="text-lg font-semibold hover:underline">
        {post.title}
      </Link>

      <p className="text-sm whitespace-pre-wrap text-[var(--muted-foreground)]">{post.body}</p>

      {post.gated && (
        <p className="text-sm">
          <Link to="/login" className="text-[var(--primary)] hover:underline">
            Sign in to read
          </Link>{' '}
          the full post.
        </p>
      )}

      {post.tags.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {post.tags.map((tag) => (
            <li
              key={tag}
              className="rounded bg-[var(--muted)] px-2 py-0.5 text-xs text-[var(--muted-foreground)]"
            >
              {tag}
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs text-[var(--muted-foreground)]">
        by {post.author.username} · {post.likeCount} {post.likeCount === 1 ? 'like' : 'likes'}
      </p>
    </Card>
  )
}

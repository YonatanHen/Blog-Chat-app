import { Link, useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import { ApiError } from '../api/client.js'
import { usePost, useDeletePost } from '../hooks/use-posts.js'
import { useMe } from '../hooks/use-auth.js'
import { CommentSection } from '../components/patterns/CommentSection.js'
import { EmptyState } from '../components/patterns/EmptyState.js'
import { LikeButton } from '../components/patterns/LikeButton.js'
import { PostTile } from '../components/patterns/PostTile.js'
import { Button } from '../components/ui/button.js'
import { Skeleton } from '../components/ui/skeleton.js'
import { formatDate } from '../lib/format-date.js'

/**
 * The post detail page. `post.gated` is the server's verdict that this reader is
 * locked out, so `post.body` is only a teaser — the full body was never
 * serialized. The page relays that verdict; it never decides it, and
 * there is no second gating rule to apply client-side.
 */
export function PostPage() {
  const { slug } = useParams<{ slug: string }>()
  const { data: post, isPending, isError } = usePost(slug ?? '')
  const { data: me } = useMe()
  const deletePost = useDeletePost()
  const navigate = useNavigate()

  if (isPending) return <Skeleton className="h-64" />
  if (isError) return <EmptyState message="Could not load this post. Please try again." />
  if (!post) return <EmptyState message="Post not found." />

  const isOwner = me?.id === post.author.id

  return (
    <article className="flex max-w-3xl flex-col gap-6">
      <header className="flex flex-col gap-3">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-xs tracking-[0.09em] text-[var(--ink-faint)] uppercase tabular-nums">
          <time dateTime={post.createdAt}>{formatDate(post.createdAt)}</time>
          <span aria-hidden="true">·</span>
          <Link to={`/users/${post.author.id}`} className="hover:text-[var(--foreground)]">
            {post.author.username}
          </Link>
        </p>
        <h1 className="font-display text-[clamp(2rem,5vw,3.25rem)] leading-[0.95] tracking-[-0.04em] text-balance">
          {post.title}
        </h1>
      </header>

      <PostTile slug={post.slug} coverUrl={post.coverUrl} className="aspect-[21/9]" />

      <div className="max-w-[68ch] text-lg leading-relaxed whitespace-pre-wrap">{post.body}</div>

      {post.gated && (
        <p className="rounded bg-[var(--muted)] p-4 text-sm">
          <Link to="/login" className="text-[var(--primary)] underline">
            Sign in
          </Link>{' '}
          to read the rest of this post.
        </p>
      )}

      {post.tags.length > 0 && (
        <ul className="flex flex-wrap gap-1.5 font-mono text-[0.68rem] tracking-[0.09em] uppercase">
          {post.tags.map((tag) => (
            <li key={tag} className="bg-[var(--primary-wash)] px-1.5 py-0.5 text-[var(--primary)]">
              {tag}
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-4 border-t border-[var(--border)] pt-5 text-sm text-[var(--muted-foreground)]">
        <LikeButton slug={post.slug} likeCount={post.likeCount} liked={post.liked} />
        {isOwner && (
          <>
            <Link to={`/blog/${post.slug}/edit`} className="underline">
              Edit
            </Link>
            <Button
              variant="destructive"
              size="sm"
              disabled={deletePost.isPending}
              onClick={() =>
                deletePost.mutate(post.slug, {
                  onSuccess: () => navigate('/'),
                  onError: (err) =>
                    toast.error(err instanceof ApiError ? err.message : 'Could not delete the post.'),
                })
              }
            >
              Delete
            </Button>
          </>
        )}
      </div>

      <CommentSection slug={post.slug} />
    </article>
  )
}
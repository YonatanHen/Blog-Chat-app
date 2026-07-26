import { Link, useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import { ApiError } from '../api/client.js'
import { usePost, useDeletePost } from '../hooks/use-posts.js'
import { useMe } from '../hooks/use-auth.js'
import { EmptyState } from '../components/patterns/EmptyState.js'
import { LikeButton } from '../components/patterns/LikeButton.js'
import { Button } from '../components/ui/button.js'
import { Skeleton } from '../components/ui/skeleton.js'

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
    <article className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{post.title}</h1>
        <p className="text-sm text-[var(--muted-foreground)]">by {post.author.username}</p>
      </header>

      <div className="whitespace-pre-wrap">{post.body}</div>

      {post.gated && (
        <p className="rounded bg-[var(--muted)] p-4 text-sm">
          <Link to="/login" className="text-[var(--primary)] underline">
            Sign in
          </Link>{' '}
          to read the rest of this post.
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

      <div className="flex items-center gap-4 text-sm text-[var(--muted-foreground)]">
        <LikeButton slug={post.slug} likeCount={post.likeCount} />
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
    </article>
  )
}
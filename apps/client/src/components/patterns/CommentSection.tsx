import { Link } from 'react-router'
import { toast } from 'sonner'
import { ApiError } from '../../api/client.js'
import { useMe } from '../../hooks/use-auth.js'
import { useComments, useCreateComment } from '../../hooks/use-comments.js'
import { Skeleton } from '../ui/skeleton.js'
import { CommentForm } from './CommentForm.js'
import { buildCommentTree, CommentThread } from './CommentThread.js'

/**
 * The discussion under a post.
 *
 * Rendered for gated readers too: the post body may be a teaser, but the thread
 * is not walled — the server serves it whole to anyone. What an anonymous
 * reader loses is the ability to *write*, which is a 401 on the API and a
 * sign-in prompt here.
 */
export function CommentSection({ slug }: { slug: string }) {
  const { data: me } = useMe()
  const { data: comments, isPending, isError } = useComments(slug)
  const createComment = useCreateComment(slug)

  return (
    <section className="flex flex-col gap-4 border-t border-[var(--border)] pt-6">
      <h2 className="text-lg font-semibold">
        Comments{comments ? ` (${comments.length})` : ''}
      </h2>

      {me ? (
        <CommentForm
          isPending={createComment.isPending}
          // mutateAsync, not mutate: the form clears its box only when the
          // returned promise resolves, so a failed post keeps the draft.
          onSubmit={(body) =>
            createComment.mutateAsync(
              { body },
              {
                onError: (err) =>
                  toast.error(
                    err instanceof ApiError ? err.message : 'Could not post your comment.',
                  ),
              },
            )
          }
        />
      ) : (
        <p className="rounded bg-[var(--muted)] p-4 text-sm">
          <Link to="/login" className="text-[var(--primary)] underline">
            Sign in
          </Link>{' '}
          to join the discussion.
        </p>
      )}

      {isPending ? (
        <Skeleton className="h-24" />
      ) : isError ? (
        <p className="text-sm text-[var(--muted-foreground)]">Could not load the comments.</p>
      ) : comments && comments.length > 0 ? (
        <CommentThread slug={slug} comments={buildCommentTree(comments)} />
      ) : (
        <p className="text-sm text-[var(--muted-foreground)]">No comments yet.</p>
      )}
    </section>
  )
}

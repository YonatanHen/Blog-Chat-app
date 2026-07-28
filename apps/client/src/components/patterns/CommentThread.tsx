import { useState } from 'react'
import { toast } from 'sonner'
import { ApiError } from '../../api/client.js'
import { useMe } from '../../hooks/use-auth.js'
import { useCreateComment, useDeleteComment, useUpdateComment } from '../../hooks/use-comments.js'
import { Button } from '../ui/button.js'
import { CommentForm } from './CommentForm.js'
import { MarkdownPreview } from './MarkdownPreview.js'
import type { Comment } from '../../api/comments.js'

export type CommentNode = Comment & { replies: CommentNode[] }

/**
 * Turns the flat list the API returns into a tree, in one pass.
 *
 * Two passes over a Map rather than a filter-per-node walk, which would be
 * O(n²) on a busy thread. A comment whose `parent` does not resolve is promoted
 * to a root instead of being dropped: mid-delete the cache can hold a reply
 * whose parent is already gone, and silently swallowing it would make a comment
 * that still exists on the server invisible on the page.
 */
export function buildCommentTree(comments: Comment[]): CommentNode[] {
  const byId = new Map<string, CommentNode>(comments.map((c) => [c.id, { ...c, replies: [] }]))
  const roots: CommentNode[] = []

  for (const comment of comments) {
    const node = byId.get(comment.id)!
    const parent = comment.parent ? byId.get(comment.parent) : undefined
    if (parent) parent.replies.push(node)
    else roots.push(node)
  }

  return roots
}

function errorMessage(err: unknown, fallback: string) {
  return err instanceof ApiError ? err.message : fallback
}

function CommentItem({ slug, node, depth }: { slug: string; node: CommentNode; depth: number }) {
  const { data: me } = useMe()
  const [replying, setReplying] = useState(false)
  const [editing, setEditing] = useState(false)

  const createComment = useCreateComment(slug)
  const updateComment = useUpdateComment(slug)
  const deleteComment = useDeleteComment(slug)

  // Ownership is a UI affordance only. The server re-checks it with
  // requireOwner, so hiding these buttons hides nothing that matters.
  const isOwner = Boolean(me) && me?.id === node.author.id

  return (
    <li className="flex flex-col gap-2">
      <article className="flex flex-col gap-1 rounded-md border border-[var(--border)] p-3">
        <header className="text-xs text-[var(--muted-foreground)]">
          {node.author.username} · {new Date(node.createdAt).toLocaleDateString()}
        </header>

        {editing ? (
          <CommentForm
            initialValue={node.body}
            submitLabel="Save"
            isPending={updateComment.isPending}
            onCancel={() => setEditing(false)}
            onSubmit={(body) =>
              updateComment.mutateAsync(
                { id: node.id, body },
                {
                  onSuccess: () => setEditing(false),
                  onError: (err) => toast.error(errorMessage(err, 'Could not save the comment.')),
                },
              )
            }
          />
        ) : (
          <MarkdownPreview source={node.body} />
        )}

        {!editing && (
          <div className="flex items-center gap-3 text-xs text-[var(--muted-foreground)]">
            {me && (
              <button type="button" className="underline" onClick={() => setReplying((r) => !r)}>
                Reply
              </button>
            )}
            {isOwner && (
              <>
                <button type="button" className="underline" onClick={() => setEditing(true)}>
                  Edit
                </button>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={deleteComment.isPending}
                  onClick={() =>
                    deleteComment.mutate(node.id, {
                      onError: (err) =>
                        toast.error(errorMessage(err, 'Could not delete the comment.')),
                    })
                  }
                >
                  Delete
                </Button>
              </>
            )}
          </div>
        )}
      </article>

      {replying && (
        <CommentForm
          autoFocus
          submitLabel="Reply"
          isPending={createComment.isPending}
          onCancel={() => setReplying(false)}
          // mutateAsync, not mutate: the form keeps the draft unless the promise
          // resolves, so a rejected reply is not silently thrown away.
          onSubmit={(body) =>
            createComment.mutateAsync(
              { body, parent: node.id },
              {
                onSuccess: () => setReplying(false),
                onError: (err) => toast.error(errorMessage(err, 'Could not post the reply.')),
              },
            )
          }
        />
      )}

      {node.replies.length > 0 && (
        <CommentThread slug={slug} comments={node.replies} depth={depth + 1} />
      )}
    </li>
  )
}

/**
 * Renders one level of the thread and recurses. `comments` is already a tree at
 * every level below the first; the top-level caller passes roots from
 * buildCommentTree.
 */
export function CommentThread({
  slug,
  comments,
  depth = 0,
}: {
  slug: string
  comments: CommentNode[]
  depth?: number
}) {
  return (
    <ul className={depth > 0 ? 'flex flex-col gap-3 border-l border-[var(--border)] pl-4' : 'flex flex-col gap-3'}>
      {comments.map((node) => (
        <CommentItem key={node.id} slug={slug} node={node} depth={depth} />
      ))}
    </ul>
  )
}

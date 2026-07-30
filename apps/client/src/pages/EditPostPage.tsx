import { UpdatePostSchema } from '@blog/zod-shared'
import { useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import { ApiError } from '../api/client.js'
import { AutoForm } from '../components/patterns/AutoForm.js'
import { EmptyState } from '../components/patterns/EmptyState.js'
import { RequireAuth } from '../components/patterns/RequireAuth.js'
import { Skeleton } from '../components/ui/skeleton.js'
import { usePost, useUpdatePost } from '../hooks/use-posts.js'

export function EditPostPage() {
  const { slug = '' } = useParams<{ slug: string }>()
  const { data: post, isPending, isError } = usePost(slug)
  const updatePost = useUpdatePost(slug)
  const navigate = useNavigate()

  // `RequireAuth` is UX only; PATCH /api/v1/posts/:slug is what rejects a
  // non-owner, and the editor never sends an author field — identity comes from
  // the session.
  return (
    <RequireAuth>
      <h1 className="mb-4 text-xl font-semibold">Edit post</h1>
      {isPending ? (
        <Skeleton className="h-64" />
      ) : isError || !post ? (
        <EmptyState message="Could not load this post." />
      ) : (
        <AutoForm
          schema={UpdatePostSchema}
          initialValues={post}
          submitLabel="Save changes"
          imagePreviewUrl={post.coverUrl}
          onSubmit={(values) =>
            updatePost.mutate(values, {
              // The slug is derived from the title, so it may have changed —
              // follow the post the server just returned, not the old param.
              onSuccess: (updated) => navigate(`/blog/${updated?.slug ?? post.slug}`),
              onError: (err) =>
                toast.error(err instanceof ApiError ? err.message : 'Could not save changes.'),
            })
          }
        />
      )}
    </RequireAuth>
  )
}

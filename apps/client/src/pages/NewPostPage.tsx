import { CreatePostSchema } from '@blog/zod-shared'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { ApiError } from '../api/client.js'
import { AutoForm } from '../components/patterns/AutoForm.js'
import { RequireAuth } from '../components/patterns/RequireAuth.js'
import { useCreatePost } from '../hooks/use-posts.js'

export function NewPostPage() {
  const createPost = useCreatePost()
  const navigate = useNavigate()

  // `RequireAuth` is UX only — POST /api/v1/posts is what actually enforces
  // authorization.
  return (
    <RequireAuth>
      <h1 className="mb-4 text-xl font-semibold">New post</h1>
      <AutoForm
        schema={CreatePostSchema}
        submitLabel="Publish"
        onSubmit={(values) =>
          createPost.mutate(values, {
            onSuccess: (post) => {
              if (post) navigate(`/blog/${post.slug}`)
            },
            onError: (err) =>
              toast.error(err instanceof ApiError ? err.message : 'Could not create post.'),
          })
        }
      />
    </RequireAuth>
  )
}
import { z } from 'zod'

/** A Mongo ObjectId as it travels over JSON: 24 hex characters. */
const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Not a valid id')

// POST /api/v1/posts/:slug/comments — the slug in the URL identifies the post
// and the session identifies the author, so neither may appear in the body.
export const CreateCommentSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, 'Comment cannot be empty')
    .max(5_000, 'Comment must be at most 5,000 characters'),
  // Absent for a root comment, present for a reply. Only the *shape* is checked
  // here — whether it points at a real comment on THIS post is a database
  // question, so the service answers it.
  parent: objectId.optional(),
})

/**
 * PATCH /api/v1/posts/:slug/comments/:commentId.
 *
 * `body` only, on purpose: a comment is never re-parented, the same way a post
 * never changes its author. Picking the field instead of `.partial()`ing the
 * create schema means `parent` is not merely optional here — it is stripped,
 * so a client cannot move a thread by editing a leaf.
 */
export const UpdateCommentSchema = CreateCommentSchema.pick({ body: true })

export type CreateComment = z.infer<typeof CreateCommentSchema>
export type UpdateComment = z.infer<typeof UpdateCommentSchema>

import { z } from 'zod'

/**
 * A Cloudinary public ID under one of our own folders — never a full URL, so the
 * delivery host can change without rewriting every document. The server checks
 * this again before persisting (`publicIdFrom`); this layer is what lets the
 * form reject a bad value without a round trip.
 */
export const PublicIdSchema = z
  .string()
  .trim()
  .regex(/^blogchat\/(covers|avatars)\/[A-Za-z0-9_-]+$/, 'Must be an image uploaded through this site')
  .max(200)

export const CreatePostSchema = z.object({
  title: z
    .string()
    .trim()
    .min(3, 'Title must be at least 3 characters')
    .max(120, 'Title must be at most 120 characters'),
  body: z
    .string()
    .trim()
    .min(1, 'Body cannot be empty')
    .max(50_000, 'Body must be at most 50,000 characters'),
  tags: z.array(z.string().trim().min(1)).max(5, 'A post can have at most 5 tags').default([]),
  // Optional by design: a post with no cover falls back to art generated from
  // its slug. `null` clears an existing cover on update.
  coverImage: PublicIdSchema.nullish(),
})

// PATCH /api/v1/posts/:slug — the slug identifies the post, so the body carries
// no id, and every field is optional. A body field must never identify a
// resource or its owner (spec §5).
export const UpdatePostSchema = CreatePostSchema.partial()

export type CreatePost = z.infer<typeof CreatePostSchema>
export type UpdatePost = z.infer<typeof UpdatePostSchema>

export function slugify(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * The public preview of a post. Every post is teased for anonymous readers —
 * there is no per-post opt-out, so this runs on the way out of the API for any
 * request without a session (spec §6).
 */
export function deriveTeaser(body: string, paragraphs = 2): string {
  return body.split(/\n{2,}/).slice(0, paragraphs).join('\n\n')
}

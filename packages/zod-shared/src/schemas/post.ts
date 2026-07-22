import { z } from 'zod'

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
  premium: z.coerce.boolean().default(false),
  tags: z.array(z.string().trim().min(1)).max(5, 'A post can have at most 5 tags').default([]),
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

export function deriveTeaser(body: string, paragraphs = 2): string {
  return body.split(/\n{2,}/).slice(0, paragraphs).join('\n\n')
}

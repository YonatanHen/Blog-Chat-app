import { z } from 'zod'

export const CreatePostSchema = z.object({
  title: z.string().trim().min(3, 'Title must be at least 3 characters').max(120),
  body: z.string().trim().min(1, 'Body cannot be empty'),
  premium: z.coerce.boolean().default(false),
  tags: z.array(z.string().trim().min(1)).max(5).default([]),
})

export const UpdatePostSchema = CreatePostSchema.extend({
  postId: z.string().min(1),
})

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

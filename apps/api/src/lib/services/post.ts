import {
  LikeModel,
  NotFoundError,
  PostModel,
  deriveTeaser,
  slugify,
  type CreatePost,
  type Post,
  type UpdatePost,
} from '@blog/shared'
import { Types, type HydratedDocument } from 'mongoose'

export type PostAuthor = { id: string; username: string }

export type PostDto = {
  id: string
  title: string
  slug: string
  body: string
  premium: boolean
  /** true when `body` holds only the teaser because the reader is not signed in. */
  gated: boolean
  author: PostAuthor
  tags: string[]
  likeCount: number
  coverImage?: string
  createdAt: Date
  updatedAt: Date
}

type PopulatedAuthor = { _id: Types.ObjectId; username: string }

function isPopulated(author: unknown): author is PopulatedAuthor {
  return typeof author === 'object' && author !== null && 'username' in author
}

/**
 * THE serialization boundary — the single place a Post document becomes a
 * response object (spec §6).
 *
 * `full: false` means the full body is never copied into the returned object,
 * so it cannot leak: there is nothing to find in DevTools because the API never
 * put it there. Gating in a route handler or a component would be cosmetic.
 */
function toDto(post: HydratedDocument<Post>, likeCount: number, full: boolean): PostDto {
  const author = post.author
  return {
    id: post._id.toString(),
    title: post.title,
    slug: post.slug,
    body: full ? post.body : deriveTeaser(post.body),
    premium: post.premium,
    gated: !full,
    author: isPopulated(author)
      ? { id: author._id.toString(), username: author.username }
      : { id: String(author), username: '' },
    tags: post.tags ?? [],
    likeCount,
    coverImage: post.coverImage ?? undefined,
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
  }
}

/**
 * Finds a free slug, suffixing on collision: my-title, my-title-2, my-title-3.
 * The unique index is still the real guard; this just avoids losing a write to it.
 */
async function uniqueSlug(title: string, excludeId?: Types.ObjectId): Promise<string> {
  const base = slugify(title)
  for (let n = 1; ; n++) {
    const candidate = n === 1 ? base : `${base}-${n}`
    const clash = await PostModel.findOne({ slug: candidate })
    if (!clash || clash._id.equals(excludeId)) return candidate
  }
}

async function countLikes(postId: Types.ObjectId): Promise<number> {
  // Derived, never stored: the legacy `likes: Number` drifted from `likedBy: []`.
  return LikeModel.countDocuments({ post: postId })
}

export const postService = {
  /** The feed. Teaser bodies ALWAYS — a list endpoint never ships full bodies. */
  async list(): Promise<PostDto[]> {
    const posts = await PostModel.find().sort({ createdAt: -1 }).populate('author', 'username')
    return Promise.all(posts.map(async (p) => toDto(p, await countLikes(p._id), false)))
  },

  async getBySlug(slug: string, viewerId?: string): Promise<PostDto> {
    const post = await PostModel.findOne({ slug }).populate('author', 'username')
    if (!post) throw new NotFoundError('Post not found.')

    // The gating rule, stated once: a premium post shows its full body only to
    // a signed-in reader. Everything else about the post stays public.
    const full = !post.premium || Boolean(viewerId)
    return toDto(post, await countLikes(post._id), full)
  },

  async create(input: CreatePost, authorId: string): Promise<PostDto> {
    const post = await PostModel.create({
      ...input,
      slug: await uniqueSlug(input.title),
      // From the session, never from `input` — validate() strips an `author`
      // key anyway, and this is the second reason it cannot be spoofed.
      author: new Types.ObjectId(authorId),
    })
    await post.populate('author', 'username')
    return toDto(post, 0, true)
  },

  async update(slug: string, input: UpdatePost): Promise<PostDto> {
    const post = await PostModel.findOne({ slug })
    if (!post) throw new NotFoundError('Post not found.')

    if (input.title !== undefined && input.title !== post.title) {
      post.title = input.title
      post.slug = await uniqueSlug(input.title, post._id)
    }
    if (input.body !== undefined) post.body = input.body
    if (input.premium !== undefined) post.premium = input.premium
    if (input.tags !== undefined) post.tags = input.tags

    await post.save()
    await post.populate('author', 'username')
    // The owner is the only caller who reaches here, so the full body is correct.
    return toDto(post, await countLikes(post._id), true)
  },

  async remove(slug: string): Promise<void> {
    const post = await PostModel.findOne({ slug })
    if (!post) throw new NotFoundError('Post not found.')
    // Delete the likes first: a like pointing at a missing post is an orphan
    // that would inflate no count but would never be collected either.
    await LikeModel.deleteMany({ post: post._id })
    await post.deleteOne()
  },

  /** Loader for requireOwner. Returns only what the ownership check needs. */
  async findBySlugForOwnerCheck(slug: string): Promise<{ author: Types.ObjectId } | null> {
    const post = await PostModel.findOne({ slug }).select('author')
    return post ? { author: post.author } : null
  },
}

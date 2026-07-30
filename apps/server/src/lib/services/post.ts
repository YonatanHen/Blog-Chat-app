import {
  deriveTeaser,
  slugify,
  type CreatePost,
  type UpdatePost,
} from '@blog/zod-shared'
import { NotFoundError } from '../errors.js'
import { commentService } from './comment.js'
import { LikeModel } from '../../models/like.js'
import { PostModel, type Post } from '../../models/post.js'
import { assertPostSlotFree } from '../demo-limits.js'
import { deliveryUrl, publicIdFrom } from './upload.js'
import { Types, type FilterQuery, type HydratedDocument } from 'mongoose'

export type PostAuthor = { id: string; username: string }

/** Feed filters. Both are optional and combine with AND when both are given. */
export type PostListParams = { q?: string; tag?: string }

export type PostDto = {
  id: string
  title: string
  slug: string
  body: string
  gated: boolean
  author: PostAuthor
  tags: string[]
  likeCount: number
  coverImage?: string
  /** Derived from `coverImage` at serialization time — see deliveryUrl. */
  coverUrl?: string
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
 *
 * `full` and `gated` are deliberately independent. Collapsing them (`gated:
 * !full`) is only correct for a single-post read; the feed always teases, so
 * deriving one from the other there would report every post as locked.
 */
function toDto(
  post: HydratedDocument<Post>,
  likeCount: number,
  { full, gated }: { full: boolean; gated: boolean },
): PostDto {
  const author = post.author
  // REGRESSION GUARD (legacy postsList.jsx:12): `body` is required by the schema,
  // but a document written around the validator still reaches this function, and
  // `deriveTeaser(undefined)` threw a TypeError that took the whole feed down.
  // One bad row must not 500 the list.
  const body = post.body ?? ''
  return {
    id: post._id.toString(),
    title: post.title,
    slug: post.slug,
    body: full ? body : deriveTeaser(body),
    gated,
    author: isPopulated(author)
      ? { id: author._id.toString(), username: author.username }
      : { id: String(author), username: '' },
    tags: post.tags ?? [],
    likeCount,
    coverImage: post.coverImage ?? undefined,
    coverUrl: post.coverImage ? deliveryUrl(post.coverImage) : undefined,
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
  /**
   * The feed. Teaser bodies ALWAYS — a list endpoint never ships full bodies,
   * signed in or not. `viewerId` therefore changes only `gated`, i.e. whether
   * the card invites the reader to sign in, never how much text is sent.
   *
   * Search runs on the `{ title, body }` text index declared on the model, so the
   * database does the matching — the legacy client filtered an already-downloaded
   * array, which only ever searched the page it had.
   *
   * Both filters are trimmed and an empty one is dropped: Mongo rejects `$text:
   * { $search: '' }`, so `?q=` must degrade to an unfiltered feed rather than a
   * 500, and `?tag=` must not match the posts that happen to have no tags.
   *
   * Two consequences of using `$text`, both accepted deliberately:
   *
   * 1. It matches whole stemmed words, NOT substrings — "mongo" does not find
   *    "MongoDB", and a half-typed word finds nothing until it is finished. A
   *    substring search cannot use an index at all, and an unindexed scan of
   *    every body is the thing this change exists to stop doing.
   * 2. The index spans `body`, so an anonymous reader can learn whether a word
   *    occurs in text they cannot read. That is a presence oracle, not a leak —
   *    no gated byte is ever serialized (see `toDto`). It is tolerable here only
   *    because the wall is a free signup rather than a paid tier; narrowing it
   *    would mean a second, title-only index, since a `$text` query cannot pick
   *    a subset of the fields its index covers.
   */
  async list(viewerId?: string, params: PostListParams = {}): Promise<PostDto[]> {
    const term = params.q?.trim()
    const tag = params.tag?.trim()
    const filter: FilterQuery<Post> = {}
    if (term) filter.$text = { $search: term }
    if (tag) filter.tags = tag

    if (process.env.DEBUG) console.log('[postService.list]', { term, tag, viewerId })

    const query = PostModel.find(filter).populate('author', 'username')
    // Relevance when there is a term to be relevant to, newest-first otherwise.
    // `createdAt` breaks relevance ties too, so equally-scoring posts come back
    // in a stable, meaningful order rather than whatever the index yields.
    query.sort(term ? { score: { $meta: 'textScore' }, createdAt: -1 } : { createdAt: -1 })
    const posts = await query

    return Promise.all(
      posts.map(async (p) =>
        toDto(p, await countLikes(p._id), {
          full: false,
          gated: !viewerId,
        }),
      ),
    )
  },

  async getBySlug(slug: string, viewerId?: string): Promise<PostDto> {
    const post = await PostModel.findOne({ slug }).populate('author', 'username')
    if (!post) throw new NotFoundError('Post not found.')

    const full = Boolean(viewerId)
    return toDto(post, await countLikes(post._id), { full, gated: !full })
  },

  async create(input: CreatePost, authorId: string): Promise<PostDto> {
    // Demo capacity (spec §3). A filtered count, not a collection count —
    // `author` is indexed, so this is a lookup rather than a scan. `authorId`
    // comes from the session, never the body: a body-supplied owner would let a
    // caller spend someone else's allowance, or dodge their own.
    assertPostSlotFree(await PostModel.countDocuments({ author: new Types.ObjectId(authorId) }))
    const post = await PostModel.create({
      ...input,
      // Re-checked here, not trusted from the body: the browser reports what
      // Cloudinary returned and a client can lie about it.
      coverImage: input.coverImage ? publicIdFrom(input.coverImage) : undefined,
      slug: await uniqueSlug(input.title),
      // From the session, never from `input` — validate() strips an `author`
      // key anyway, and this is the second reason it cannot be spoofed.
      author: new Types.ObjectId(authorId),
    })
    await post.populate('author', 'username')
    return toDto(post, 0, { full: true, gated: false })
  },

  async update(slug: string, input: UpdatePost): Promise<PostDto> {
    const post = await PostModel.findOne({ slug })
    if (!post) throw new NotFoundError('Post not found.')

    if (input.title !== undefined && input.title !== post.title) {
      post.title = input.title
      post.slug = await uniqueSlug(input.title, post._id)
    }
    if (input.body !== undefined) post.body = input.body
    if (input.tags !== undefined) post.tags = input.tags
    // `null` clears the cover; `undefined` means the field was not in the PATCH
    // and must be left alone. Collapsing the two would wipe a cover on any edit.
    if (input.coverImage !== undefined) {
      post.coverImage = input.coverImage ? publicIdFrom(input.coverImage) : undefined
    }

    await post.save()
    await post.populate('author', 'username')
    // The owner is the only caller who reaches here, so the full body is correct.
    return toDto(post, await countLikes(post._id), { full: true, gated: false })
  },

  async remove(slug: string): Promise<void> {
    const post = await PostModel.findOne({ slug })
    if (!post) throw new NotFoundError('Post not found.')
    // Delete the likes first: a like pointing at a missing post is an orphan
    // that would inflate no count but would never be collected either.
    await LikeModel.deleteMany({ post: post._id })
    // Same reasoning for the thread — and it can be flat here, because every
    // comment on the post goes regardless of where it sat in the tree.
    await commentService.removeAllForPost(post._id)
    await post.deleteOne()
  },

  /** Loader for requireOwner. Returns only what the ownership check needs. */
  async findBySlugForOwnerCheck(slug: string): Promise<{ author: Types.ObjectId } | null> {
    const post = await PostModel.findOne({ slug }).select('author')
    return post ? { author: post.author } : null
  },
}

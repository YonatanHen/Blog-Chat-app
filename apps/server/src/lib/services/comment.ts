import type { CreateComment, UpdateComment } from '@blog/zod-shared'
import { NotFoundError, ValidationError } from '../errors.js'
import { assertCommentSlotFree } from '../demo-limits.js'
import { CommentModel, type Comment } from '../../models/comment.js'
import { PostModel } from '../../models/post.js'
import { Types, type HydratedDocument } from 'mongoose'

export type CommentAuthor = { id: string; username: string }

export type CommentDto = {
  id: string
  body: string
  author: CommentAuthor
  /** null for a root comment, the parent comment's id for a reply. */
  parent: string | null
  createdAt: Date
  updatedAt: Date
}

type PopulatedAuthor = { _id: Types.ObjectId; username: string }

function isPopulated(author: unknown): author is PopulatedAuthor {
  return typeof author === 'object' && author !== null && 'username' in author
}

/**
 * The serialization boundary for a comment.
 *
 * There is no `full`/`gated` pair here, unlike PostDto: the wall is on post
 * bodies only. Comments are public discussion and are served whole to anyone,
 * signed in or not — gating them would be a second, undesigned rule.
 */
function toDto(comment: HydratedDocument<Comment>): CommentDto {
  const author = comment.author
  return {
    id: comment._id.toString(),
    body: comment.body,
    author: isPopulated(author)
      ? { id: author._id.toString(), username: author.username }
      : { id: String(author), username: '' },
    parent: comment.parent ? comment.parent.toString() : null,
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt,
  }
}

async function resolvePostId(slug: string): Promise<Types.ObjectId> {
  const post = await PostModel.findOne({ slug }).select('_id')
  if (!post) throw new NotFoundError('Post not found.')
  return post._id
}

/**
 * Loads a comment by primary key, tolerating a malformed id.
 *
 * The isValid guard is not cosmetic: findById on a non-ObjectId string throws a
 * Mongoose CastError, which no typed error in lib/errors.ts covers, so it would
 * fall through the error handler as a generic 500.
 */
async function findById(commentId: string): Promise<HydratedDocument<Comment> | null> {
  if (!Types.ObjectId.isValid(commentId)) return null
  return CommentModel.findById(commentId)
}

/**
 * How deep a reply may sit under a root comment.
 *
 * A cap is required, not cosmetic: without one a scripted client can chain
 * replies indefinitely, and every later reader pays for it — CommentThread
 * renders one nested component per level, so a long enough chain overflows the
 * stack of everyone who opens the post. The client indents to match.
 */
const MAX_DEPTH = 10

/** Ancestor count of a comment: 0 for a root, 1 for a direct reply, and so on. */
async function depthOf(comment: HydratedDocument<Comment>): Promise<number> {
  if (!comment.parent) return 0
  const [result] = await CommentModel.aggregate<{ depth: number }>([
    { $match: { _id: comment._id } },
    {
      // The mirror of the cascade's walk: up the chain via `parent`, not down.
      $graphLookup: {
        from: CommentModel.collection.name,
        startWith: '$parent',
        connectFromField: 'parent',
        connectToField: '_id',
        as: 'ancestors',
      },
    },
    { $project: { depth: { $size: '$ancestors' } } },
  ])
  return result?.depth ?? 0
}

export const commentService = {
  /**
   * The whole thread for a post, oldest first. Flat on the wire on purpose —
   * the client rebuilds the tree from `parent`, so one query serves any depth
   * and the API never has to pick a nesting limit.
   */
  async list(slug: string): Promise<CommentDto[]> {
    if (process.env.DEBUG) console.log('[COMMENT_SERVICE] list', { slug })
    const postId = await resolvePostId(slug)
    const comments = await CommentModel.find({ post: postId })
      .sort({ createdAt: 1 })
      .populate('author', 'username')
    return comments.map(toDto)
  },

  async create(slug: string, input: CreateComment, authorId: string): Promise<CommentDto> {
    if (process.env.DEBUG) console.log('[COMMENT_SERVICE] create', { slug, authorId })
    const postId = await resolvePostId(slug)
    // Demo capacity (spec §3). `post` is indexed, so this is a lookup. `postId`
    // comes from the resolved slug, never the body — the same rule the
    // ownership checks follow.
    assertCommentSlotFree(await CommentModel.countDocuments({ post: postId }))

    if (input.parent) {
      const parent = await findById(input.parent)
      // A parent that does not exist, or that belongs to a different post, is a
      // malformed *input* — the post in the URL was found, so 404 would point at
      // the wrong resource. The schema can only check the id's shape; which post
      // it hangs off is a database fact, so the 400 is raised here.
      if (!parent || !parent.post.equals(postId)) {
        if (process.env.DEBUG)
          console.warn('[COMMENT_SERVICE] rejected parent', { slug, parent: input.parent })
        throw new ValidationError('Invalid input.', {
          parent: ['Parent comment does not belong to this post'],
        })
      }
      if ((await depthOf(parent)) + 1 > MAX_DEPTH) {
        if (process.env.DEBUG)
          console.warn('[COMMENT_SERVICE] rejected parent: too deep', { parent: input.parent })
        throw new ValidationError('Invalid input.', {
          parent: [`Replies can only be nested ${MAX_DEPTH} levels deep`],
        })
      }
    }

    const comment = await CommentModel.create({
      body: input.body,
      parent: input.parent ? new Types.ObjectId(input.parent) : undefined,
      post: postId,
      // From the session, never from `input` — validate() strips an `author`
      // key anyway, and this is the second reason it cannot be spoofed.
      author: new Types.ObjectId(authorId),
    })
    await comment.populate('author', 'username')
    return toDto(comment)
  },

  async update(commentId: string, input: UpdateComment): Promise<CommentDto> {
    if (process.env.DEBUG) console.log('[COMMENT_SERVICE] update', { commentId })
    const comment = await findById(commentId)
    if (!comment) throw new NotFoundError('Comment not found.')

    comment.body = input.body
    await comment.save()
    await comment.populate('author', 'username')
    return toDto(comment)
  },

  /**
   * Deletes a comment and its entire reply subtree.
   *
   * $graphLookup walks `parent` edges to arbitrary depth in one round trip, so
   * the cost does not grow with nesting the way a per-level loop would. Deleting
   * only the root would leave every reply orphaned: they point at an id that no
   * longer resolves, so buildCommentTree would surface them as fresh roots and
   * the "deleted" subthread would reappear at the top of the page.
   */
  async remove(commentId: string): Promise<void> {
    if (process.env.DEBUG) console.log('[COMMENT_SERVICE] remove', { commentId })
    const root = await findById(commentId)
    if (!root) throw new NotFoundError('Comment not found.')

    const [result] = await CommentModel.aggregate<{ ids: Types.ObjectId[] }>([
      { $match: { _id: root._id } },
      {
        $graphLookup: {
          // Read off the model rather than hardcoded: a wrong collection name
          // here fails SILENTLY — the pipeline returns no descendants and the
          // cascade quietly degrades to deleting only the root.
          from: CommentModel.collection.name,
          startWith: '$_id',
          connectFromField: '_id',
          connectToField: 'parent',
          as: 'descendants',
        },
      },
      { $project: { ids: { $concatArrays: [['$_id'], '$descendants._id'] } } },
    ])

    // The fallback keeps the root deletable even if the aggregation returns
    // nothing; correctness of the cascade still rests on the pipeline.
    const ids = result?.ids ?? [root._id]
    if (process.env.DEBUG) console.log('[COMMENT_SERVICE] cascade', { count: ids.length })
    await CommentModel.deleteMany({ _id: { $in: ids } })
  },

  /**
   * Called from postService.remove. Flat, not recursive: every comment on the
   * post goes regardless of depth, so walking the tree would be wasted work.
   */
  async removeAllForPost(postId: Types.ObjectId): Promise<void> {
    if (process.env.DEBUG) console.log('[COMMENT_SERVICE] removeAllForPost', { postId })
    await CommentModel.deleteMany({ post: postId })
  },

  /**
   * Loader for requireOwner. Returns only what the ownership check needs.
   *
   * Scoped by slug as well as id, so a comment reached through the WRONG post's
   * URL is a 404 rather than an edit or delete that silently succeeds. The URL
   * claims a hierarchy; a nested resource that ignores its parent is lying, and
   * the client would then invalidate the thread of a post that never changed.
   */
  async findForOwnerCheck(
    slug: string,
    commentId: string,
  ): Promise<{ author: Types.ObjectId } | null> {
    if (!Types.ObjectId.isValid(commentId)) return null
    const post = await PostModel.findOne({ slug }).select('_id')
    if (!post) return null

    const comment = await CommentModel.findOne({ _id: commentId, post: post._id }).select('author')
    return comment ? { author: comment.author } : null
  },
}

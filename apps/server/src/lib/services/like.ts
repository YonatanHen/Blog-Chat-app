import { NotFoundError } from '../errors.js'
import { LikeModel } from '../../models/like.js'
import { PostModel } from '../../models/post.js'
import type { Types } from 'mongoose'

async function resolvePostId(slug: string): Promise<Types.ObjectId> {
  const post = await PostModel.findOne({ slug }).select('_id')
  if (!post) throw new NotFoundError('Post not found.')
  return post._id
}

export const likeService = {
  /**
   * Idempotent like. Exposed as PUT because repeating it must not change the
   * outcome — which is why the count cannot be corrupted by a double click.
   * upsert + the unique (user, post) index make concurrency a non-event: the
   * loser of the race updates the same document instead of inserting a second.
   */
  async like(slug: string, userId: string): Promise<{ likeCount: number }> {
    const postId = await resolvePostId(slug)
    await LikeModel.updateOne(
      { user: userId, post: postId },
      { $setOnInsert: { user: userId, post: postId } },
      { upsert: true },
    )
    return { likeCount: await LikeModel.countDocuments({ post: postId }) }
  },

  /** Idempotent unlike. Deleting nothing is success, not a 404. */
  async unlike(slug: string, userId: string): Promise<{ likeCount: number }> {
    const postId = await resolvePostId(slug)
    await LikeModel.deleteOne({ user: userId, post: postId })
    return { likeCount: await LikeModel.countDocuments({ post: postId }) }
  },
}

import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose'

const commentSchema = new Schema(
  {
    body: { type: String, required: true, trim: true },
    author: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    post: { type: Schema.Types.ObjectId, ref: 'Post', required: true },
    // Indexed because the cascade delete walks `parent` edges with
    // $graphLookup, and $graphLookup scans the whole collection once per level
    // when its connectToField is unindexed — which would quietly undo the
    // reason the cascade is one aggregation instead of a per-level loop.
    parent: { type: Schema.Types.ObjectId, ref: 'Comment', index: true },
  },
  { timestamps: true },
)
// Covers both halves of the thread query: `post` alone is a prefix of this, so
// no separate index on it is needed, and the createdAt sort is served by the
// index rather than by an in-memory blocking sort.
commentSchema.index({ post: 1, createdAt: 1 })

export type Comment = InferSchemaType<typeof commentSchema>
export const CommentModel: Model<Comment> =
  (mongoose.models.Comment as Model<Comment>) ?? mongoose.model<Comment>('Comment', commentSchema)

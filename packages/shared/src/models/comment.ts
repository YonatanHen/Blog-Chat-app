import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose'

const commentSchema = new Schema(
  {
    body: { type: String, required: true, trim: true },
    author: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    post: { type: Schema.Types.ObjectId, ref: 'Post', required: true, index: true },
    parent: { type: Schema.Types.ObjectId, ref: 'Comment' },
  },
  { timestamps: true },
)

export type Comment = InferSchemaType<typeof commentSchema>
export const CommentModel: Model<Comment> =
  (mongoose.models.Comment as Model<Comment>) ?? mongoose.model<Comment>('Comment', commentSchema)

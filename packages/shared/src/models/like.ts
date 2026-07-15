import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose'

const likeSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    post: { type: Schema.Types.ObjectId, ref: 'Post', required: true, index: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
)

likeSchema.index({ user: 1, post: 1 }, { unique: true })

export type Like = InferSchemaType<typeof likeSchema>
export const LikeModel: Model<Like> =
  (mongoose.models.Like as Model<Like>) ?? mongoose.model<Like>('Like', likeSchema)

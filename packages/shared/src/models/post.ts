import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose'

const postSchema = new Schema(
  {
    // Bounds mirror CreatePostSchema as defense-in-depth: Zod guards the API
    // boundary, and scripts/seed.ts writes to PostModel directly.
    title: { type: String, required: true, trim: true, minlength: 3, maxlength: 120 },
    slug: { type: String, required: true, unique: true },
    body: { type: String, required: true, minlength: 1, maxlength: 50_000 },
    premium: { type: Boolean, required: true, default: false },
    coverImage: { type: String },
    author: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tags: {
      type: [String],
      default: [],
      index: true,
      validate: {
        validator: (tags: string[]) => tags.length <= 5,
        message: 'A post can have at most 5 tags',
      },
    },
  },
  { timestamps: true },
)
postSchema.index({ title: 'text', body: 'text' })

export type Post = InferSchemaType<typeof postSchema>
export const PostModel: Model<Post> =
  (mongoose.models.Post as Model<Post>) ?? mongoose.model<Post>('Post', postSchema)

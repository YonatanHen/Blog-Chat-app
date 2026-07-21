import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose'

const userSchema = new Schema(
  {
    username: { type: String, required: true, unique: true, trim: true, minlength: 3, maxlength: 30 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String }, // absent for OAuth users
    image: { type: String },    // Cloudinary public ID
    // TODO(P5): no Zod schema covers `bio` yet — there is no profile-update
    // feature in P1. Add a matching length bound here once one exists.
    bio: { type: String },
  },
  { timestamps: true },
)

export type User = InferSchemaType<typeof userSchema>
export const UserModel: Model<User> =
  (mongoose.models.User as Model<User>) ?? mongoose.model<User>('User', userSchema)

import { type Signup, type UpdateUser } from '@blog/zod-shared'
import { ConflictError, NotFoundError } from '../errors.js'
import { UserModel } from '../../models/user.js'
import bcrypt from 'bcryptjs'
import { Types } from 'mongoose'

const BCRYPT_COST = 12 // legacy used 8

export type PublicUser = {
  id: string
  username: string
  bio?: string
  image?: string
  createdAt: Date
}

/** MongoServerError code for a unique-index violation. */
const DUPLICATE_KEY = 11000

function isDuplicateKeyError(err: unknown): err is { code: number; keyPattern?: Record<string, 1> } {
  return typeof err === 'object' && err !== null && 'code' in err && err.code === DUPLICATE_KEY
}

export const userService = {
  async signup(input: Signup): Promise<{ id: string; username: string }> {
    // A pre-check only to produce a precise message. It is NOT the guard —
    // two concurrent signups can both pass it. The unique index is the guard,
    // and the catch below turns its E11000 into the same ConflictError.
    const existing = await UserModel.findOne({
      $or: [{ username: input.username }, { email: input.email }],
    })
    if (existing) {
      throw new ConflictError(
        existing.username === input.username
          ? 'That username is taken.'
          : 'That email is already registered.',
      )
    }

    const password = await bcrypt.hash(input.password, BCRYPT_COST)
    try {
      const user = await UserModel.create({ ...input, password })
      return { id: user._id.toString(), username: user.username }
    } catch (err) {
      if (isDuplicateKeyError(err)) {
        throw new ConflictError(
          err.keyPattern?.username ? 'That username is taken.' : 'That email is already registered.',
        )
      }
      throw err
    }
  },

  async verifyCredentials(
    username: string,
    password: string,
  ): Promise<{ id: string; username: string } | null> {
    const user = await UserModel.findOne({ username })
    // Return null for BOTH "no such user" and "wrong password" so the two are
    // indistinguishable to an attacker enumerating usernames.
    if (!user?.password) return null
    if (!(await bcrypt.compare(password, user.password))) return null
    return { id: user._id.toString(), username: user.username }
  },

  async getPublicProfile(id: string): Promise<PublicUser> {
    // A malformed id would otherwise throw a CastError and surface as a 500.
    if (!Types.ObjectId.isValid(id)) throw new NotFoundError('User not found.')

    const user = await UserModel.findById(id)
    if (!user) throw new NotFoundError('User not found.')

    // Built field by field, not by deleting from the document: a whitelist
    // cannot leak a field added to the schema later.
    return {
      id: user._id.toString(),
      username: user.username,
      bio: user.bio ?? undefined,
      image: user.image ?? undefined,
      createdAt: user.createdAt,
    }
  },

  async updateProfile(id: string, input: UpdateUser): Promise<PublicUser> {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundError('User not found.')
    const user = await UserModel.findById(id)
    if (!user) throw new NotFoundError('User not found.')

    if (input.bio !== undefined) user.bio = input.bio
    if (input.image !== undefined) user.image = input.image
    // Only when explicitly provided. The legacy handler compared the plaintext
    // field to the stored hash, so every profile save reset the password.
    if (input.password !== undefined) {
      user.password = await bcrypt.hash(input.password, BCRYPT_COST)
    }

    await user.save()
    return this.getPublicProfile(id)
  },

  async remove(id: string): Promise<void> {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundError('User not found.')
    const result = await UserModel.findByIdAndDelete(id)
    if (!result) throw new NotFoundError('User not found.')
  },
}

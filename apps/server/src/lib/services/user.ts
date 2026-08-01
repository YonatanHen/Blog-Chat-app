import { type DeleteUser, type Signup, type UpdateUser } from '@blog/zod-shared'
import { ConflictError, NotFoundError, UnauthorizedError, ValidationError } from '../errors.js'
import { assertUserSlotFree } from '../demo-limits.js'
import { UserModel } from '../../models/user.js'
import { CommentModel } from '../../models/comment.js'
import { LikeModel } from '../../models/like.js'
import { PostModel } from '../../models/post.js'
import { postService } from './post.js'
import { publicIdFrom } from './upload.js'
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

/** Only ever returned to the account owner — see `getPublicProfile`'s viewerId gate. */
export type PrivateUser = PublicUser & {
  email: string
  hasPassword: boolean
  oauthProvider: 'google' | null
}

/** MongoServerError code for a unique-index violation. */
const DUPLICATE_KEY = 11000

function isDuplicateKeyError(err: unknown): err is { code: number; keyPattern?: Record<string, 1> } {
  return typeof err === 'object' && err !== null && 'code' in err && err.code === DUPLICATE_KEY
}

export const userService = {
  async signup(input: Signup): Promise<{ id: string; username: string }> {
    console.log('[USER_SERVICE] signup start', { username: input.username, email: input.email })
    // Demo capacity (spec §3). Signup is the only global cap, and with rate
    // limiting dropped it is the one remaining chokepoint — a scripted run of
    // registrations is what exhausts the demo. Race accepted and documented:
    // two concurrent signups at the limit can both pass, overshooting by at
    // most the concurrency level, never unbounded.
    assertUserSlotFree(await UserModel.countDocuments())
    // A pre-check only to produce a precise message. It is NOT the guard —
    // two concurrent signups can both pass it. The unique index is the guard,
    // and the catch below turns its E11000 into the same ConflictError.
    const existing = await UserModel.findOne({
      $or: [{ username: input.username }, { email: input.email }],
    })
    if (existing) {
      console.warn('[USER_SERVICE] User already exists', { username: input.username, email: input.email })
      throw new ConflictError(
        existing.username === input.username
          ? 'That username is taken.'
          : 'That email is already registered.',
      )
    }

    console.log('[USER_SERVICE] No duplicate found, hashing password')
    const password = await bcrypt.hash(input.password, BCRYPT_COST)
    try {
      console.log('[USER_SERVICE] Creating user in database')
      const user = await UserModel.create({ ...input, password })
      console.info('[USER_SERVICE] User created successfully', { id: user._id.toString(), username: user.username })
      return { id: user._id.toString(), username: user.username }
    } catch (err) {
      console.error('[USER_SERVICE] Create error', err instanceof Error ? err.message : err)
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
    console.log('[USER_SERVICE] verifyCredentials start', { username })
    const user = await UserModel.findOne({ username })
    // Return null for BOTH "no such user" and "wrong password" so the two are
    // indistinguishable to an attacker enumerating usernames.
    if (!user?.password) {
      console.log('[USER_SERVICE] User not found or no password')
      return null
    }
    const passwordValid = await bcrypt.compare(password, user.password)
    if (!passwordValid) {
      console.log('[USER_SERVICE] Password mismatch')
      return null
    }
    console.info('[USER_SERVICE] Credentials verified', { id: user._id.toString(), username: user.username })
    return { id: user._id.toString(), username: user.username }
  },

  /**
   * `viewerId` gates the private fields (email, password/OAuth status) the
   * same way `postService.getBySlug`'s `viewerId` gates a post's full body —
   * only the account owner ever sees them; everyone else gets `PublicUser`.
   */
  async getPublicProfile(id: string, viewerId?: string): Promise<PublicUser | PrivateUser> {
    // A malformed id would otherwise throw a CastError and surface as a 500.
    if (!Types.ObjectId.isValid(id)) throw new NotFoundError('User not found.')

    const user = await UserModel.findById(id)
    if (!user) throw new NotFoundError('User not found.')

    // Built field by field, not by deleting from the document: a whitelist
    // cannot leak a field added to the schema later.
    const publicView: PublicUser = {
      id: user._id.toString(),
      username: user.username,
      bio: user.bio ?? undefined,
      image: user.image ?? undefined,
      createdAt: user.createdAt,
    }
    if (viewerId !== id) return publicView

    return {
      ...publicView,
      email: user.email,
      hasPassword: Boolean(user.password),
      oauthProvider: user.googleId ? 'google' : null,
    }
  },

  async updateProfile(id: string, input: UpdateUser): Promise<PrivateUser> {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundError('User not found.')
    const user = await UserModel.findById(id)
    if (!user) throw new NotFoundError('User not found.')

    // A new value to SET, never used to look up which account this is — that
    // stays fixed to `id` throughout. See the schema comment in zod-shared.
    if (input.username !== undefined) user.username = input.username

    if (input.email !== undefined) {
      // Locked, not merely defaulted: changing it would let the stored email
      // drift from the Google-verified one oauthService.findOrCreate keys on.
      if (user.googleId) {
        throw new ValidationError('Invalid input.', {
          email: ["Email is managed by your Google account and can't be changed."],
        })
      }
      user.email = input.email
    }

    if (input.bio !== undefined) user.bio = input.bio
    // Re-checked here, not trusted from the body: the browser reports what
    // Cloudinary returned and a client can lie about it — same rule coverImage
    // follows in postService. `null` clears an existing image.
    if (input.image !== undefined) {
      user.image = input.image ? publicIdFrom(input.image, 'image') : undefined
    }

    // Only when explicitly provided. The legacy handler compared the plaintext
    // field to the stored hash, so every profile save reset the password.
    if (input.password !== undefined) {
      if (user.password) {
        // Changing an existing password requires proving you know it — a
        // hijacked session should not be able to silently lock the owner out.
        const currentValid =
          input.currentPassword !== undefined &&
          (await bcrypt.compare(input.currentPassword, user.password))
        if (!currentValid) throw new UnauthorizedError('Current password is incorrect.')
      }
      // Else: an OAuth account setting its first password — nothing to verify
      // against, this is the "add local login" path, not a change.
      user.password = await bcrypt.hash(input.password, BCRYPT_COST)
    }

    try {
      await user.save()
    } catch (err) {
      if (isDuplicateKeyError(err)) {
        throw new ConflictError(
          err.keyPattern?.username ? 'That username is taken.' : 'That email is already registered.',
        )
      }
      throw err
    }

    return (await this.getPublicProfile(id, id)) as PrivateUser
  },

  async remove(id: string, confirmation: DeleteUser): Promise<void> {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundError('User not found.')
    const user = await UserModel.findById(id)
    if (!user) throw new NotFoundError('User not found.')

    const confirmed = user.password
      ? confirmation.currentPassword !== undefined &&
        (await bcrypt.compare(confirmation.currentPassword, user.password))
      : confirmation.usernameConfirmation === user.username
    if (!confirmed) throw new UnauthorizedError('Confirmation did not match.')

    const authorId = new Types.ObjectId(id)
    // Each post's own likes/comments cascade for free via postService.remove.
    const posts = await PostModel.find({ author: authorId }).select('slug')
    for (const post of posts) await postService.remove(post.slug)
    // Catches this user's activity on OTHER people's posts, which the loop
    // above never touches.
    await CommentModel.deleteMany({ author: authorId })
    await LikeModel.deleteMany({ user: authorId })

    await UserModel.findByIdAndDelete(id)
  },
}

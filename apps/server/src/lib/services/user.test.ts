import { ConflictError, NotFoundError, UnauthorizedError, ValidationError } from '../errors.js'
import { UserModel } from '../../models/user.js'
import { CommentModel } from '../../models/comment.js'
import { LikeModel } from '../../models/like.js'
import { PostModel } from '../../models/post.js'
import { describe, expect, it } from 'vitest'
import { useTestDb } from '../../test/helpers.js'
import { userService } from './user.js'
import { postService } from './post.js'

useTestDb()

const signup = (over: Partial<{ username: string; email: string; password: string }> = {}) =>
  userService.signup({
    username: 'yonatan',
    email: 'y@example.com',
    password: 'correct-horse',
    ...over,
  })

describe('userService.signup', () => {
  it('hashes the password — never stores plaintext', async () => {
    await signup()
    const user = await UserModel.findOne({ username: 'yonatan' })
    expect(user!.password).not.toBe('correct-horse')
    expect(user!.password).toMatch(/^\$2[aby]\$/) // bcrypt
  })

  it('uses bcrypt cost 12, not the legacy 8', async () => {
    await signup()
    const user = await UserModel.findOne({ username: 'yonatan' })
    expect(user!.password).toMatch(/^\$2[aby]\$12\$/)
  })

  it('throws ConflictError for a duplicate username', async () => {
    await signup()
    await expect(signup({ email: 'other@example.com' })).rejects.toThrow(ConflictError)
  })

  it('throws ConflictError for a duplicate email', async () => {
    await signup()
    await expect(signup({ username: 'someone-else' })).rejects.toThrow(ConflictError)
  })

  it('turns a duplicate-key race into ConflictError, not an unhandled 500', async () => {
    // Two concurrent signups both pass the findOne pre-check; one loses at the
    // unique index. That E11000 must surface as a 409, not a crash. The index is
    // the real guard — the pre-check only buys a nicer message.
    const results = await Promise.allSettled([signup(), signup()])
    const rejected = results.filter((r) => r.status === 'rejected')
    expect(rejected).toHaveLength(1)
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(ConflictError)
  })

  it('returns the new id and username', async () => {
    const result = await signup()
    expect(result.username).toBe('yonatan')
    expect(result.id).toMatch(/^[a-f0-9]{24}$/)
  })
})

describe('userService.verifyCredentials', () => {
  it('returns the user for a correct password', async () => {
    await signup()
    expect((await userService.verifyCredentials('yonatan', 'correct-horse'))?.username).toBe('yonatan')
  })

  it('returns null for a wrong password', async () => {
    await signup()
    expect(await userService.verifyCredentials('yonatan', 'wrong')).toBeNull()
  })

  it('returns null — not a distinguishable error — for an unknown username', async () => {
    // The legacy app threw "Unable to find user: <name>", leaking which usernames
    // exist. Both failure modes must be indistinguishable to the caller.
    expect(await userService.verifyCredentials('nobody', 'correct-horse')).toBeNull()
  })

  it('returns null for an OAuth user who has no password', async () => {
    await UserModel.create({ username: 'oauth', email: 'o@example.com' })
    expect(await userService.verifyCredentials('oauth', 'anything')).toBeNull()
  })
})

describe('userService.getPublicProfile', () => {
  it('never exposes the password hash or the email to a non-owner viewer', async () => {
    const { id } = await signup()
    const profile = await userService.getPublicProfile(id)
    expect(profile).not.toHaveProperty('password')
    expect(profile).not.toHaveProperty('email')
    expect(profile.username).toBe('yonatan')
  })

  it('throws NotFoundError for an unknown id', async () => {
    await expect(userService.getPublicProfile('507f1f77bcf86cd799439011')).rejects.toThrow(NotFoundError)
  })

  it('throws NotFoundError for a malformed id rather than a cast error', async () => {
    await expect(userService.getPublicProfile('not-an-objectid')).rejects.toThrow(NotFoundError)
  })

  it('includes email, hasPassword and oauthProvider only when the viewer is the owner', async () => {
    const { id } = await signup()
    const own = (await userService.getPublicProfile(id, id)) as {
      email: string
      hasPassword: boolean
      oauthProvider: string | null
    }
    expect(own.email).toBe('y@example.com')
    expect(own.hasPassword).toBe(true)
    expect(own.oauthProvider).toBeNull()

    const other = await userService.getPublicProfile(id, '507f1f77bcf86cd799439011')
    expect(other).not.toHaveProperty('email')
  })

  it('reports oauthProvider google for a Google-linked account', async () => {
    const oauthUser = await UserModel.create({
      username: 'oauth',
      email: 'o@example.com',
      googleId: 'g-123',
    })
    const id = oauthUser._id.toString()
    const profile = (await userService.getPublicProfile(id, id)) as { oauthProvider: string | null }
    expect(profile.oauthProvider).toBe('google')
  })
})

describe('userService.updateProfile — image validation', () => {
  // SECURITY FIX. `image` used to accept any string up to 200 chars, unlike
  // `coverImage` on posts — which requires publicIdFrom() to gate a Cloudinary
  // public ID before persisting. A client reports what Cloudinary returned and
  // can lie about it, so this must be re-checked server-side, not trusted from
  // the body, exactly like coverImage.
  it('rejects an arbitrary string — only a Cloudinary public ID under our folders is accepted', async () => {
    const { id } = await signup()
    await expect(
      userService.updateProfile(id, { image: 'https://evil.example/track.png' }),
    ).rejects.toThrow(ValidationError)
    await expect(userService.updateProfile(id, { image: 'javascript:alert(1)' })).rejects.toThrow(
      ValidationError,
    )
  })

  it('accepts a public ID under blogchat/avatars', async () => {
    const { id } = await signup()
    const profile = await userService.updateProfile(id, { image: 'blogchat/avatars/ab12cd' })
    expect(profile.image).toBe('blogchat/avatars/ab12cd')
  })

  it('rejects a public ID outside our folders', async () => {
    const { id } = await signup()
    await expect(
      userService.updateProfile(id, { image: 'someone-elses/folder/x' }),
    ).rejects.toThrow(ValidationError)
  })
})

describe('userService.updateProfile — username', () => {
  it('lets a user rename themselves', async () => {
    const { id } = await signup()
    const profile = await userService.updateProfile(id, { username: 'renamed' })
    expect(profile.username).toBe('renamed')
  })

  it('throws ConflictError when the new username is already taken', async () => {
    const { id } = await signup()
    await signup({ username: 'taken', email: 'taken@example.com' })
    await expect(userService.updateProfile(id, { username: 'taken' })).rejects.toThrow(ConflictError)
  })
})

describe('userService.updateProfile — email', () => {
  it('lets a local user change their email', async () => {
    const { id } = await signup()
    const profile = await userService.updateProfile(id, { email: 'new@example.com' })
    expect(profile.email).toBe('new@example.com')
  })

  it('throws ConflictError when the new email is already registered', async () => {
    const { id } = await signup()
    await signup({ username: 'other', email: 'taken@example.com' })
    await expect(userService.updateProfile(id, { email: 'taken@example.com' })).rejects.toThrow(
      ConflictError,
    )
  })

  it('rejects an email change for a Google-linked account', async () => {
    const oauthUser = await UserModel.create({
      username: 'oauth',
      email: 'o@example.com',
      googleId: 'g-123',
    })
    const id = oauthUser._id.toString()
    await expect(userService.updateProfile(id, { email: 'new@example.com' })).rejects.toThrow(
      ValidationError,
    )
    expect((await UserModel.findById(id))!.email).toBe('o@example.com')
  })
})

describe('userService.updateProfile — password', () => {
  it('requires the current password to change an existing one', async () => {
    const { id } = await signup()
    await expect(
      userService.updateProfile(id, { password: 'brand-new-password' }),
    ).rejects.toThrow(UnauthorizedError)
  })

  it('rejects a wrong current password', async () => {
    const { id } = await signup()
    await expect(
      userService.updateProfile(id, { currentPassword: 'nope', password: 'brand-new-password' }),
    ).rejects.toThrow(UnauthorizedError)
  })

  it('accepts a correct current password and re-hashes the new one', async () => {
    const { id } = await signup()
    await userService.updateProfile(id, {
      currentPassword: 'correct-horse',
      password: 'brand-new-password',
    })
    expect(await userService.verifyCredentials('yonatan', 'brand-new-password')).not.toBeNull()
  })

  it('lets an OAuth account set its first password without a currentPassword', async () => {
    const oauthUser = await UserModel.create({
      username: 'oauth',
      email: 'o@example.com',
      googleId: 'g-123',
    })
    const id = oauthUser._id.toString()
    await userService.updateProfile(id, { password: 'first-password' })
    expect(await userService.verifyCredentials('oauth', 'first-password')).not.toBeNull()
  })
})

describe('userService.remove', () => {
  it('rejects deletion with a wrong current password and leaves the account intact', async () => {
    const { id } = await signup()
    await expect(userService.remove(id, { currentPassword: 'wrong' })).rejects.toThrow(
      UnauthorizedError,
    )
    expect(await UserModel.findById(id)).not.toBeNull()
  })

  it('deletes the account given the correct current password', async () => {
    const { id } = await signup()
    await userService.remove(id, { currentPassword: 'correct-horse' })
    expect(await UserModel.findById(id)).toBeNull()
  })

  it('deletes an OAuth (no-password) account given a matching username confirmation', async () => {
    const oauthUser = await UserModel.create({
      username: 'oauth',
      email: 'o@example.com',
      googleId: 'g-123',
    })
    const id = oauthUser._id.toString()
    await expect(
      userService.remove(id, { usernameConfirmation: 'wrong-name' }),
    ).rejects.toThrow(UnauthorizedError)
    await userService.remove(id, { usernameConfirmation: 'oauth' })
    expect(await UserModel.findById(id)).toBeNull()
  })

  it('cascades: deletes the user\'s own posts, their likes/comments on other posts, and other people\'s comments on the user\'s own posts', async () => {
    const { id } = await signup()
    const { id: otherId } = await signup({ username: 'other', email: 'other@example.com' })

    // The user's own post, plus another user commenting on it.
    const ownPost = await postService.create({ title: 'My post', body: 'hello world' }, id)
    await CommentModel.create({ post: ownPost.id, author: otherId, body: 'nice post' })

    // Another user's post, on which the target user comments and likes.
    const otherPost = await postService.create({ title: 'Other post', body: 'hello world' }, otherId)
    await CommentModel.create({ post: otherPost.id, author: id, body: 'nice post' })
    await LikeModel.create({ post: otherPost.id, user: id })

    await userService.remove(id, { currentPassword: 'correct-horse' })

    expect(await PostModel.findById(ownPost.id)).toBeNull()
    expect(await CommentModel.countDocuments({ post: ownPost.id })).toBe(0)
    expect(await CommentModel.countDocuments({ author: id })).toBe(0)
    expect(await LikeModel.countDocuments({ user: id })).toBe(0)
    // The other user and their post are untouched.
    expect(await PostModel.findById(otherPost.id)).not.toBeNull()
    expect(await UserModel.findById(otherId)).not.toBeNull()
  })
})

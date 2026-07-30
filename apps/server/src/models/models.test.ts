import { MongoMemoryServer } from 'mongodb-memory-server'
import mongoose from 'mongoose'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { LikeModel } from './like.js'
import { PostModel } from './post.js'
import { UserModel } from './user.js'

let mongod: MongoMemoryServer

beforeAll(async () => {
  mongod = await MongoMemoryServer.create()
  await mongoose.connect(mongod.getUri())
  await mongoose.syncIndexes()
})

afterAll(async () => {
  await mongoose.disconnect()
  await mongod.stop()
})

beforeEach(async () => {
  await Promise.all([UserModel.deleteMany({}), PostModel.deleteMany({}), LikeModel.deleteMany({})])
})

describe('UserModel', () => {
  it('enforces a unique username at the database level', async () => {
    await UserModel.create({ username: 'yonatan', email: 'a@example.com', password: 'x' })
    await expect(
      UserModel.create({ username: 'yonatan', email: 'b@example.com', password: 'x' }),
    ).rejects.toThrow(/duplicate key/i)
  })

  it('enforces a unique email at the database level', async () => {
    await UserModel.create({ username: 'usera', email: 'same@example.com', password: 'x' })
    await expect(
      UserModel.create({ username: 'userb', email: 'same@example.com', password: 'x' }),
    ).rejects.toThrow(/duplicate key/i)
  })

  it('allows a user with no password (OAuth users have none)', async () => {
    const user = await UserModel.create({ username: 'oauth', email: 'o@example.com' })
    expect(user.password).toBeUndefined()
  })
})

describe('LikeModel', () => {
  it('makes double-liking impossible via a compound unique index', async () => {
    const user = await UserModel.create({ username: 'liker', email: 'liker@example.com', password: 'x' })
    const post = await PostModel.create({
      title: 'A Test Title', slug: 't', body: 'b', author: user._id,
    })

    await LikeModel.create({ user: user._id, post: post._id })
    // The legacy toggle did read-then-write, so two fast clicks could both push.
    await expect(LikeModel.create({ user: user._id, post: post._id })).rejects.toThrow(
      /duplicate key/i,
    )
    expect(await LikeModel.countDocuments({ post: post._id })).toBe(1)
  })
})

describe('PostModel', () => {
  it('enforces a unique slug', async () => {
    const user = await UserModel.create({ username: 'poster', email: 'poster@example.com', password: 'x' })
    await PostModel.create({ title: 'A Test Title', slug: 'dup', body: 'b', author: user._id })
    await expect(
      PostModel.create({ title: 'Another Test Title', slug: 'dup', body: 'b', author: user._id }),
    ).rejects.toThrow(/duplicate key/i)
  })
})

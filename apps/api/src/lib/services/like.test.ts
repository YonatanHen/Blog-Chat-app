import { LikeModel, NotFoundError, PostModel, UserModel } from '@blog/shared'
import { beforeEach, describe, expect, it } from 'vitest'
import { useTestDb } from '../../test/helpers.js'
import { likeService } from './like.js'

useTestDb()

let userId: string
let slug: string

beforeEach(async () => {
  const user = await UserModel.create({ username: 'liker', email: 'l@example.com', password: 'x' })
  userId = user._id.toString()
  const post = await PostModel.create({ title: 'A Fine Title', slug: 'a-fine-title', body: 'b', author: user._id })
  slug = post.slug
})

describe('likeService.like', () => {
  it('records a like and returns the new count', async () => {
    expect(await likeService.like(slug, userId)).toEqual({ likeCount: 1 })
  })

  it('is IDEMPOTENT — liking twice still leaves exactly one like', async () => {
    // The whole reason like is PUT and not POST /toggle. The legacy toggle did
    // read-then-write, so two fast clicks could both read "not liked" and push.
    await likeService.like(slug, userId)
    expect(await likeService.like(slug, userId)).toEqual({ likeCount: 1 })
    expect(await LikeModel.countDocuments()).toBe(1)
  })

  it('survives a concurrent double-like without a duplicate or a crash', async () => {
    const results = await Promise.all([likeService.like(slug, userId), likeService.like(slug, userId)])
    expect(await LikeModel.countDocuments()).toBe(1)
    expect(results.every((r) => r.likeCount === 1)).toBe(true)
  })

  it('throws NotFoundError for an unknown slug', async () => {
    await expect(likeService.like('nope', userId)).rejects.toThrow(NotFoundError)
  })
})

describe('likeService.unlike', () => {
  it('removes the like and returns the new count', async () => {
    await likeService.like(slug, userId)
    expect(await likeService.unlike(slug, userId)).toEqual({ likeCount: 0 })
  })

  it('is IDEMPOTENT — unliking twice is not an error and never goes negative', async () => {
    await likeService.like(slug, userId)
    await likeService.unlike(slug, userId)
    expect(await likeService.unlike(slug, userId)).toEqual({ likeCount: 0 })
  })

  it('unliking a post that was never liked is a no-op, not a 404', async () => {
    expect(await likeService.unlike(slug, userId)).toEqual({ likeCount: 0 })
  })

  it('throws NotFoundError for an unknown slug', async () => {
    await expect(likeService.unlike('nope', userId)).rejects.toThrow(NotFoundError)
  })
})

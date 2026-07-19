import { LikeModel, NotFoundError, PostModel, UserModel } from '@blog/shared'
import { Types } from 'mongoose'
import { beforeEach, describe, expect, it } from 'vitest'
import { useTestDb } from '../../test/helpers.js'
import { postService } from './post.js'

useTestDb()

let authorId: string
const LONG_BODY = 'Para one.\n\nPara two.\n\nPara three — this must never reach an anonymous reader.'

beforeEach(async () => {
  const author = await UserModel.create({ username: 'author', email: 'a@example.com', password: 'x' })
  authorId = author._id.toString()
})

const create = (over: Partial<{ title: string; body: string; premium: boolean; tags: string[] }> = {}) =>
  postService.create(
    { title: 'A Fine Title', body: LONG_BODY, premium: false, tags: [], ...over },
    authorId,
  )

describe('postService.create', () => {
  it('derives the slug from the title', async () => {
    expect((await create({ title: 'Hello World Again' })).slug).toBe('hello-world-again')
  })

  it('suffixes the slug when it collides, rather than failing on the unique index', async () => {
    await create({ title: 'Same Title' })
    expect((await create({ title: 'Same Title' })).slug).toBe('same-title-2')
  })

  it('sets the author from the caller id, never from the input', async () => {
    const post = await create()
    expect(post.author.id).toBe(authorId)
  })

  it('returns the full body to the creator', async () => {
    expect((await create()).body).toBe(LONG_BODY)
  })
})

describe('postService.list', () => {
  it('returns teaser bodies only — a list endpoint never ships full bodies', async () => {
    await create({ premium: false })
    const [post] = await postService.list()
    expect(post!.body).toBe('Para one.\n\nPara two.')
    expect(post!.body).not.toContain('Para three')
  })

  it('teases free posts too — the feed is a feed, not a paywall probe', async () => {
    await create({ premium: false })
    expect((await postService.list())[0]!.body).not.toContain('Para three')
  })

  it('includes the like count', async () => {
    const post = await create()
    await LikeModel.create({ user: new Types.ObjectId(), post: new Types.ObjectId(post.id) })
    expect((await postService.list())[0]!.likeCount).toBe(1)
  })

  it('populates the author instead of a denormalized copy', async () => {
    await create()
    expect((await postService.list())[0]!.author.username).toBe('author')
  })
})

describe('postService.getBySlug — THE gating rule (spec §6)', () => {
  it('returns the full body of a FREE post to an anonymous reader', async () => {
    const { slug } = await create({ premium: false })
    const post = await postService.getBySlug(slug, undefined)
    expect(post.body).toBe(LONG_BODY)
    expect(post.gated).toBe(false)
  })

  it('OMITS the full body of a PREMIUM post for an anonymous reader', async () => {
    const { slug } = await create({ premium: true })
    const post = await postService.getBySlug(slug, undefined)
    expect(post.body).toBe('Para one.\n\nPara two.')
    expect(post.gated).toBe(true)
  })

  it('leaves the gated bytes nowhere in the serialized object', async () => {
    // The real assertion: not "hidden", ABSENT. Serialize the whole DTO and grep.
    const { slug } = await create({ premium: true })
    const post = await postService.getBySlug(slug, undefined)
    expect(JSON.stringify(post)).not.toContain('Para three')
  })

  it('returns the full body of a PREMIUM post to a signed-in reader', async () => {
    const { slug } = await create({ premium: true })
    const reader = await UserModel.create({ username: 'reader', email: 'r@example.com', password: 'x' })
    const post = await postService.getBySlug(slug, reader._id.toString())
    expect(post.body).toBe(LONG_BODY)
    expect(post.gated).toBe(false)
  })

  it('throws NotFoundError for an unknown slug', async () => {
    await expect(postService.getBySlug('nope', undefined)).rejects.toThrow(NotFoundError)
  })
})

describe('postService.update', () => {
  it('applies a partial update and leaves other fields alone', async () => {
    const { slug } = await create({ title: 'Original Title' })
    const updated = await postService.update(slug, { title: 'A Brand New Title' })
    expect(updated.title).toBe('A Brand New Title')
    expect(updated.body).toBe(LONG_BODY)
  })

  it('re-slugs when the title changes so the URL tracks the title', async () => {
    const { slug } = await create({ title: 'Original Title' })
    expect((await postService.update(slug, { title: 'A Brand New Title' })).slug).toBe('a-brand-new-title')
  })

  it('does not change the slug when the title is untouched', async () => {
    const { slug } = await create({ title: 'Original Title' })
    expect((await postService.update(slug, { body: 'New body.' })).slug).toBe('original-title')
  })

  it('throws NotFoundError for an unknown slug', async () => {
    await expect(postService.update('nope', { title: 'Whatever Title' })).rejects.toThrow(NotFoundError)
  })
})

describe('postService.remove', () => {
  it('deletes the post', async () => {
    const { slug } = await create()
    await postService.remove(slug)
    expect(await PostModel.countDocuments()).toBe(0)
  })

  it('deletes the post likes too, so no orphans accumulate', async () => {
    const post = await create()
    await LikeModel.create({ user: new Types.ObjectId(), post: new Types.ObjectId(post.id) })
    await postService.remove(post.slug)
    expect(await LikeModel.countDocuments()).toBe(0)
  })

  it('throws NotFoundError for an unknown slug', async () => {
    await expect(postService.remove('nope')).rejects.toThrow(NotFoundError)
  })
})

describe('postService.findBySlugForOwnerCheck', () => {
  it('returns the author id for requireOwner', async () => {
    const { slug } = await create()
    const found = await postService.findBySlugForOwnerCheck(slug)
    expect(found!.author.toString()).toBe(authorId)
  })

  it('returns null for an unknown slug so requireOwner can 404', async () => {
    expect(await postService.findBySlugForOwnerCheck('nope')).toBeNull()
  })
})

import { NotFoundError } from '../errors.js'
import { commentService } from './comment.js'
import { CommentModel } from '../../models/comment.js'
import { LikeModel } from '../../models/like.js'
import { PostModel } from '../../models/post.js'
import { UserModel } from '../../models/user.js'
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

const create = (over: Partial<{ title: string; body: string; tags: string[] }> = {}) =>
  postService.create({ title: 'A Fine Title', body: LONG_BODY, tags: [], ...over }, authorId)

const signUpReader = () =>
  UserModel.create({ username: 'reader', email: 'r@example.com', password: 'x' })

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
    await create()
    const [post] = await postService.list()
    expect(post!.body).toBe('Para one.\n\nPara two.')
    expect(post!.body).not.toContain('Para three')
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

  // `gated` answers "is this reader locked out of the full body", NOT "is this
  // body a teaser" — the feed teases everyone, so the latter reading would flag
  // signed-in readers too and the UI could not use it to prompt for a login.
  it('marks every post gated for an anonymous reader', async () => {
    await create()
    expect((await postService.list())[0]!.gated).toBe(true)
  })

  it('marks nothing gated for a signed-in reader', async () => {
    await create()
    const reader = await signUpReader()
    expect((await postService.list(reader._id.toString()))[0]!.gated).toBe(false)
  })

  it('still ships ONLY the teaser to a signed-in reader — ungating is not a licence to bulk-send bodies', async () => {
    await create()
    const reader = await signUpReader()
    const [post] = await postService.list(reader._id.toString())
    expect(post!.body).toBe('Para one.\n\nPara two.')
    expect(JSON.stringify(post)).not.toContain('Para three')
  })
})

describe('postService.list — search and tag filters', () => {
  it('matches on the title', async () => {
    await create({ title: 'Indexing Mongo Text' })
    await create({ title: 'An Unrelated Essay' })
    const found = await postService.list(undefined, { q: 'Mongo' })
    expect(found.map((p) => p.title)).toEqual(['Indexing Mongo Text'])
  })

  it('matches on the body, not just the title', async () => {
    await create({ title: 'A Fine Title', body: 'Nothing here.\n\nA word about kubernetes.' })
    await create({ title: 'Another Title', body: 'Nothing here at all.' })
    const found = await postService.list(undefined, { q: 'kubernetes' })
    expect(found).toHaveLength(1)
    expect(found[0]!.title).toBe('A Fine Title')
  })

  it('returns an empty list when nothing matches', async () => {
    await create()
    expect(await postService.list(undefined, { q: 'zzzznotaword' })).toEqual([])
  })

  // MongoDB rejects `$text: { $search: '' }`, so a blank box must not become a query.
  it('treats an empty or whitespace-only term as no term at all', async () => {
    await create({ title: 'One Title' })
    await create({ title: 'Two Title' })
    expect(await postService.list(undefined, { q: '' })).toHaveLength(2)
    expect(await postService.list(undefined, { q: '   ' })).toHaveLength(2)
  })

  it('filters by tag', async () => {
    await create({ title: 'Tagged Post', tags: ['express'] })
    await create({ title: 'Other Post', tags: ['react'] })
    const found = await postService.list(undefined, { tag: 'express' })
    expect(found.map((p) => p.title)).toEqual(['Tagged Post'])
  })

  it('ANDs the term and the tag rather than widening to either', async () => {
    await create({ title: 'Kubernetes Basics', tags: ['devops'] })
    await create({ title: 'Kubernetes Advanced', tags: ['react'] })
    await create({ title: 'An Unrelated Essay', tags: ['devops'] })
    const found = await postService.list(undefined, { q: 'Kubernetes', tag: 'devops' })
    expect(found.map((p) => p.title)).toEqual(['Kubernetes Basics'])
  })

  it('still gates and teases filtered results — a filter is not a bypass', async () => {
    await create({ title: 'Kubernetes Basics' })
    const [post] = await postService.list(undefined, { q: 'Kubernetes' })
    expect(post!.gated).toBe(true)
    expect(post!.body).not.toContain('Para three')
  })
})

describe('postService.list — ordering', () => {
  /** Pins createdAt through the driver: Mongoose's timestamps plugin owns the field otherwise. */
  const backdate = (slug: string, iso: string) =>
    PostModel.collection.updateOne({ slug }, { $set: { createdAt: new Date(iso) } })

  // Three posts whose insertion order, date order and relevance order are all
  // DIFFERENT. That is the point: with two, "most relevant" and "newest" can
  // coincide with the order the driver happens to return, and both assertions
  // below would pass with the sort deleted entirely.
  //
  //   insertion : Deep, Passing, Middling
  //   newest    : Passing, Middling, Deep
  //   relevance : Deep, Middling, Passing
  beforeEach(async () => {
    await create({ title: 'Mongo Mongo Mongo Deep', body: 'Mongo mongo mongo mongo mongo.' })
    await create({ title: 'An Essay Passing By', body: `${LONG_BODY}\n\nOne aside about mongo.` })
    await create({ title: 'Mongo Middling', body: `${LONG_BODY}\n\nTwo asides: mongo, mongo.` })
    await backdate('mongo-mongo-mongo-deep', '2020-01-01')
    await backdate('mongo-middling', '2023-01-01')
    await backdate('an-essay-passing-by', '2026-01-01')
  })

  it('sorts an unfiltered feed newest-first', async () => {
    const titles = (await postService.list()).map((p) => p.title)
    expect(titles).toEqual(['An Essay Passing By', 'Mongo Middling', 'Mongo Mongo Mongo Deep'])
  })

  it('sorts a search by relevance, not by date', async () => {
    const titles = (await postService.list(undefined, { q: 'mongo' })).map((p) => p.title)
    expect(titles).toEqual(['Mongo Mongo Mongo Deep', 'Mongo Middling', 'An Essay Passing By'])
  })
})

// The legacy feed read `post.body` unguarded (postsList.jsx:12) and threw on the
// first document that had none. Such a document should not exist — so it is
// inserted through the driver, past the Mongoose validator, on purpose.
describe('postService.list — a body-less document must not crash the feed', () => {
  const insertBodyless = () =>
    PostModel.collection.insertOne({
      title: 'Bodyless Curiosity',
      slug: 'bodyless-curiosity',
      author: new Types.ObjectId(authorId),
      tags: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    })

  it('lists it instead of throwing', async () => {
    await insertBodyless()
    const posts = await postService.list()
    expect(posts).toHaveLength(1)
    expect(posts[0]!.body).toBe('')
  })

  it('survives it in a search result too', async () => {
    await insertBodyless()
    await expect(postService.list(undefined, { q: 'Bodyless' })).resolves.toHaveLength(1)
  })
})

describe('postService.getBySlug — THE gating rule (spec §6)', () => {
  it('OMITS the full body for an anonymous reader', async () => {
    const { slug } = await create()
    const post = await postService.getBySlug(slug, undefined)
    expect(post.body).toBe('Para one.\n\nPara two.')
    expect(post.gated).toBe(true)
  })

  it('leaves the gated bytes nowhere in the serialized object', async () => {
    // The real assertion: not "hidden", ABSENT. Serialize the whole DTO and grep.
    const { slug } = await create()
    const post = await postService.getBySlug(slug, undefined)
    expect(JSON.stringify(post)).not.toContain('Para three')
  })

  it('returns the full body to a signed-in reader', async () => {
    const { slug } = await create()
    const reader = await signUpReader()
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

  it('deletes the post comments too, at every depth', async () => {
    const post = await create()
    const root = await commentService.create(post.slug, { body: 'Root.' }, authorId)
    await commentService.create(post.slug, { body: 'Reply.', parent: root.id }, authorId)

    await postService.remove(post.slug)
    expect(await CommentModel.countDocuments()).toBe(0)
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

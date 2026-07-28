import { NotFoundError, ValidationError } from '../errors.js'
import { CommentModel } from '../../models/comment.js'
import { UserModel } from '../../models/user.js'
import { Types } from 'mongoose'
import { beforeEach, describe, expect, it } from 'vitest'
import { useTestDb } from '../../test/helpers.js'
import { commentService } from './comment.js'
import { postService } from './post.js'

useTestDb()

let authorId: string
let slug: string

beforeEach(async () => {
  const author = await UserModel.create({ username: 'author', email: 'a@example.com', password: 'x' })
  authorId = author._id.toString()
  const post = await postService.create({ title: 'A Fine Title', body: 'Body.', tags: [] }, authorId)
  slug = post.slug
})

const comment = (body: string, parent?: string) =>
  commentService.create(slug, { body, parent }, authorId)

describe('commentService.create', () => {
  it('attaches the caller as the author, never a body field', async () => {
    const created = await comment('Nice post.')
    expect(created.author.id).toBe(authorId)
    expect(created.author.username).toBe('author')
  })

  it('creates a root comment with a null parent', async () => {
    expect((await comment('Root.')).parent).toBeNull()
  })

  it('creates a reply carrying its parent id', async () => {
    const root = await comment('Root.')
    expect((await comment('Reply.', root.id)).parent).toBe(root.id)
  })

  it('throws NotFoundError for an unknown post slug', async () => {
    await expect(commentService.create('nope', { body: 'hi' }, authorId)).rejects.toThrow(
      NotFoundError,
    )
  })

  it('rejects a parent that belongs to a different post', async () => {
    const other = await postService.create(
      { title: 'Another Title', body: 'Body.', tags: [] },
      authorId,
    )
    const foreign = await commentService.create(other.slug, { body: 'Elsewhere.' }, authorId)

    // 400, not 404: the post in the URL exists, so it is the input that is wrong.
    const failure = commentService.create(slug, { body: 'Reply.', parent: foreign.id }, authorId)
    await expect(failure).rejects.toThrow(ValidationError)
    await expect(failure).rejects.toMatchObject({ fields: { parent: expect.any(Array) } })
  })

  it('rejects a parent that does not exist', async () => {
    const ghost = new Types.ObjectId().toString()
    await expect(
      commentService.create(slug, { body: 'Reply.', parent: ghost }, authorId),
    ).rejects.toThrow(ValidationError)
  })
})

describe('commentService.list', () => {
  it('returns the whole thread flat, oldest first', async () => {
    const root = await comment('First.')
    await comment('Reply.', root.id)
    const all = await commentService.list(slug)
    expect(all.map((c) => c.body)).toEqual(['First.', 'Reply.'])
  })

  it('does not leak comments from another post', async () => {
    const other = await postService.create(
      { title: 'Another Title', body: 'Body.', tags: [] },
      authorId,
    )
    await commentService.create(other.slug, { body: 'Elsewhere.' }, authorId)
    await comment('Here.')
    expect((await commentService.list(slug)).map((c) => c.body)).toEqual(['Here.'])
  })

  it('throws NotFoundError for an unknown post slug', async () => {
    await expect(commentService.list('nope')).rejects.toThrow(NotFoundError)
  })
})

describe('commentService.update', () => {
  it('replaces the body', async () => {
    const created = await comment('Typo.')
    expect((await commentService.update(created.id, { body: 'Fixed.' })).body).toBe('Fixed.')
  })

  it('leaves the parent alone — a comment is never re-parented', async () => {
    const root = await comment('Root.')
    const reply = await comment('Reply.', root.id)
    expect((await commentService.update(reply.id, { body: 'Edited.' })).parent).toBe(root.id)
  })

  it('throws NotFoundError for a malformed id instead of a CastError 500', async () => {
    await expect(commentService.update('not-an-id', { body: 'x' })).rejects.toThrow(NotFoundError)
  })
})

describe('commentService.remove', () => {
  it('deletes the entire reply subtree, not just the comment', async () => {
    const root = await comment('Root.')
    const child = await comment('Child.', root.id)
    await comment('Grandchild.', child.id)

    await commentService.remove(root.id)
    expect(await CommentModel.countDocuments()).toBe(0)
  })

  it('deletes only itself when it is a leaf', async () => {
    const root = await comment('Root.')
    const child = await comment('Child.', root.id)

    await commentService.remove(child.id)
    expect((await commentService.list(slug)).map((c) => c.id)).toEqual([root.id])
  })

  it('leaves sibling subtrees standing', async () => {
    const keep = await comment('Keep.')
    await comment('Keep reply.', keep.id)
    const drop = await comment('Drop.')
    await comment('Drop reply.', drop.id)

    await commentService.remove(drop.id)
    expect((await commentService.list(slug)).map((c) => c.body)).toEqual(['Keep.', 'Keep reply.'])
  })

  it('throws NotFoundError for a malformed id instead of a CastError 500', async () => {
    await expect(commentService.remove('not-an-id')).rejects.toThrow(NotFoundError)
  })
})

describe('commentService.removeAllForPost', () => {
  it('deletes every comment on the post at any depth', async () => {
    const root = await comment('Root.')
    await comment('Reply.', root.id)

    const postId = (await CommentModel.findById(root.id))!.post
    await commentService.removeAllForPost(postId)
    expect(await CommentModel.countDocuments()).toBe(0)
  })
})

describe('commentService.findByIdForOwnerCheck', () => {
  it('returns the author id for requireOwner', async () => {
    const created = await comment('Mine.')
    const found = await commentService.findByIdForOwnerCheck(created.id)
    expect(found!.author.toString()).toBe(authorId)
  })

  it('returns null for an unknown id so requireOwner can 404', async () => {
    expect(await commentService.findByIdForOwnerCheck(new Types.ObjectId().toString())).toBeNull()
  })

  it('returns null for a malformed id rather than throwing a CastError', async () => {
    expect(await commentService.findByIdForOwnerCheck('not-an-id')).toBeNull()
  })
})

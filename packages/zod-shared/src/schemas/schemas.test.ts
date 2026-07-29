import { describe, expect, it } from 'vitest'
import {
  SignupSchema,
  CreatePostSchema,
  UpdatePostSchema,
  CreateCommentSchema,
  UpdateCommentSchema,
  ChatMessageSchema,
  slugify,
  deriveTeaser,
} from './index.js'

describe('SignupSchema', () => {
  it('accepts a valid signup', () => {
    const result = SignupSchema.safeParse({
      username: 'yonatan',
      email: 'y@example.com',
      password: 'correct-horse',
    })
    expect(result.success).toBe(true)
  })

  it('rejects a password shorter than 8 characters', () => {
    const result = SignupSchema.safeParse({
      username: 'yonatan',
      email: 'y@example.com',
      password: 'short',
    })
    expect(result.success).toBe(false)
    expect(result.error!.flatten().fieldErrors.password).toBeDefined()
  })

  it('rejects a username longer than 30 characters', () => {
    const result = SignupSchema.safeParse({
      username: 'a'.repeat(31),
      email: 'y@example.com',
      password: 'correct-horse',
    })
    expect(result.success).toBe(false)
    expect(result.error!.flatten().fieldErrors.username).toEqual([
      'Username must be at most 30 characters',
    ])
  })

  it('rejects a malformed email', () => {
    const result = SignupSchema.safeParse({
      username: 'yonatan',
      email: 'not-an-email',
      password: 'correct-horse',
    })
    expect(result.success).toBe(false)
  })

  it('lowercases and trims the email', () => {
    const result = SignupSchema.parse({
      username: 'yonatan',
      email: '  Y@Example.COM ',
      password: 'correct-horse',
    })
    expect(result.email).toBe('y@example.com')
  })
})

describe('CreatePostSchema', () => {
  it('rejects a title shorter than 3 characters', () => {
    const result = CreatePostSchema.safeParse({ title: 'ab', body: 'hello' })
    expect(result.success).toBe(false)
  })

  it('defaults tags to an empty array', () => {
    const result = CreatePostSchema.parse({ title: 'A good title', body: 'hello' })
    expect(result.tags).toEqual([])
  })

  it('strips a premium field — gating is per-reader, not per-post', () => {
    const result = CreatePostSchema.parse({ title: 'A good title', body: 'hello', premium: true })
    expect(result).not.toHaveProperty('premium')
  })

  it('rejects an author field from client input', () => {
    // The legacy app trusted req.body.author. The schema must strip it so it
    // can never reach the database — identity comes from the session only.
    const result = CreatePostSchema.parse({
      title: 'A good title',
      body: 'hello',
      author: 'attacker-controlled-id',
    } as never)
    expect('author' in result).toBe(false)
  })
})

describe('UpdatePostSchema', () => {
  it('accepts a partial update — PATCH does not require every field', () => {
    const result = UpdatePostSchema.safeParse({ title: 'Just The New Title' })
    expect(result.success).toBe(true)
  })

  it('accepts an empty object — a no-op PATCH is valid, not a 400', () => {
    expect(UpdatePostSchema.safeParse({}).success).toBe(true)
  })

  it('still enforces field rules on the fields that ARE present', () => {
    const result = UpdatePostSchema.safeParse({ title: 'no' })
    expect(result.success).toBe(false)
  })

  it('does not carry postId — the slug in the URL identifies the post', () => {
    const parsed = UpdatePostSchema.parse({
      title: 'A Valid Title',
      postId: 'attacker-supplied',
    } as never)
    expect(parsed).not.toHaveProperty('postId')
  })
})

describe('CreateCommentSchema', () => {
  const OID = '507f1f77bcf86cd799439011'

  it('accepts a root comment with no parent', () => {
    const result = CreateCommentSchema.safeParse({ body: 'Nice post.' })
    expect(result.success).toBe(true)
    expect(result.data!.parent).toBeUndefined()
  })

  it('accepts a reply carrying a parent id', () => {
    expect(CreateCommentSchema.parse({ body: 'Agreed.', parent: OID }).parent).toBe(OID)
  })

  it('trims the body', () => {
    expect(CreateCommentSchema.parse({ body: '  spaced  ' }).body).toBe('spaced')
  })

  it('rejects a body that is empty once trimmed', () => {
    const result = CreateCommentSchema.safeParse({ body: '   ' })
    expect(result.success).toBe(false)
    expect(result.error!.flatten().fieldErrors.body).toEqual(['Comment cannot be empty'])
  })

  it('rejects a body longer than 5,000 characters', () => {
    expect(CreateCommentSchema.safeParse({ body: 'a'.repeat(5001) }).success).toBe(false)
  })

  it('rejects a parent that is not a 24-char hex id', () => {
    // Without this the value reaches Mongoose and a CastError surfaces as a 500.
    const result = CreateCommentSchema.safeParse({ body: 'hi', parent: 'not-an-id' })
    expect(result.success).toBe(false)
    expect(result.error!.flatten().fieldErrors.parent).toBeDefined()
  })

  it('strips an author field — identity comes from the session only', () => {
    const result = CreateCommentSchema.parse({ body: 'hi', author: 'attacker' } as never)
    expect('author' in result).toBe(false)
  })

  it('strips a post field — the slug in the URL identifies the post', () => {
    const result = CreateCommentSchema.parse({ body: 'hi', post: 'attacker' } as never)
    expect('post' in result).toBe(false)
  })
})

describe('UpdateCommentSchema', () => {
  it('accepts a body-only edit', () => {
    expect(UpdateCommentSchema.safeParse({ body: 'Edited.' }).success).toBe(true)
  })

  it('still requires a body — an edit to nothing is not an edit', () => {
    expect(UpdateCommentSchema.safeParse({}).success).toBe(false)
  })

  it('strips parent — a comment is never re-parented after creation', () => {
    const parsed = UpdateCommentSchema.parse({
      body: 'Edited.',
      parent: '507f1f77bcf86cd799439011',
    } as never)
    expect(parsed).not.toHaveProperty('parent')
  })
})

describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    expect(slugify('Hello World')).toBe('hello-world')
  })

  it('strips punctuation and collapses separators', () => {
    expect(slugify('Redis: what is it, really?!')).toBe('redis-what-is-it-really')
  })

  it('trims leading and trailing hyphens', () => {
    expect(slugify('  --Hello--  ')).toBe('hello')
  })
})

describe('deriveTeaser', () => {
  it('returns the first two paragraphs', () => {
    const body = 'One.\n\nTwo.\n\nThree.'
    expect(deriveTeaser(body)).toBe('One.\n\nTwo.')
  })

  it('returns the whole body when it is shorter than the limit', () => {
    expect(deriveTeaser('Only one.')).toBe('Only one.')
  })
})

describe('ChatMessageSchema', () => {
  it('trims and accepts a normal message', () => {
    const result = ChatMessageSchema.parse({ body: '  hello  ' })
    expect(result.body).toBe('hello')
  })

  it('rejects a whitespace-only message', () => {
    expect(ChatMessageSchema.safeParse({ body: '   ' }).success).toBe(false)
  })

  it('rejects a message over 1,000 characters', () => {
    expect(ChatMessageSchema.safeParse({ body: 'a'.repeat(1001) }).success).toBe(false)
  })

  // The author is server-derived. A payload claiming one must not survive
  // parsing, or the socket handler could be tempted to trust it.
  it('strips an author supplied by the client', () => {
    const result = ChatMessageSchema.parse({ body: 'hi', author: { id: 'x', username: 'admin' } })
    expect(result).not.toHaveProperty('author')
  })
})

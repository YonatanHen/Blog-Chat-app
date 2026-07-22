import { describe, expect, it } from 'vitest'
import { SignupSchema, CreatePostSchema, UpdatePostSchema, slugify, deriveTeaser } from './index.js'

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
    const result = CreatePostSchema.safeParse({ title: 'ab', body: 'hello', premium: false })
    expect(result.success).toBe(false)
  })

  it('defaults premium to false and tags to an empty array', () => {
    const result = CreatePostSchema.parse({ title: 'A good title', body: 'hello' })
    expect(result.premium).toBe(false)
    expect(result.tags).toEqual([])
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

import { describe, expect, it } from 'vitest'
import { ConflictError, ValidationError } from './errors.js'

describe('ValidationError', () => {
  it('carries per-field messages so the API can return them verbatim', () => {
    const err = new ValidationError('Invalid input.', { title: ['Title must be at least 3 characters'] })
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe('ValidationError')
    expect(err.fields).toEqual({ title: ['Title must be at least 3 characters'] })
  })

  it('defaults fields to an empty object so callers never guard on undefined', () => {
    expect(new ValidationError('Invalid input.').fields).toEqual({})
  })
})

describe('ConflictError', () => {
  it('is a distinct type so the error handler can map it to 409', () => {
    const err = new ConflictError('That username is taken.')
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe('ConflictError')
    expect(err.message).toBe('That username is taken.')
  })
})

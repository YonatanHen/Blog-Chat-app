import type { NextFunction, Request, Response } from 'express'
import { ValidationError } from '../lib/errors.js'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { validate } from './validate.js'

const Schema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters'),
  premium: z.coerce.boolean().default(false),
})

function ctx(body: unknown) {
  const req = { body } as Request
  const res = {} as Response
  const next = vi.fn() as unknown as NextFunction
  return { req, res, next: next as ReturnType<typeof vi.fn> }
}

describe('validate', () => {
  it('replaces req.body with the PARSED value, applying defaults and coercion', () => {
    // Handlers must read the parsed value: the raw body has no defaults applied.
    const { req, res, next } = ctx({ title: 'A Good Title' })
    validate(Schema)(req, res, next)
    expect(next).toHaveBeenCalledWith()
    expect(req.body).toEqual({ title: 'A Good Title', premium: false })
  })

  it('passes a ValidationError carrying Zod field errors', () => {
    const { req, res, next } = ctx({ title: 'no' })
    validate(Schema)(req, res, next)
    const err = next.mock.calls[0]?.[0]
    expect(err).toBeInstanceOf(ValidationError)
    expect(err.fields).toEqual({ title: ['Title must be at least 3 characters'] })
  })

  it('strips unknown keys so a client cannot smuggle extra fields into a handler', () => {
    // e.g. { title, author: '<someone-else>' } must never reach the service.
    const { req, res, next } = ctx({ title: 'A Good Title', author: 'attacker' })
    validate(Schema)(req, res, next)
    expect(req.body).not.toHaveProperty('author')
  })

  it('treats a missing body as an empty object rather than throwing', () => {
    const { req, res, next } = ctx(undefined)
    validate(Schema)(req, res, next)
    expect(next.mock.calls[0]?.[0]).toBeInstanceOf(ValidationError)
  })
})

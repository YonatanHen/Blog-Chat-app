import type { NextFunction, Request, Response } from 'express'
import { ValidationError } from '../lib/errors.js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { validate } from './validate.js'

const Schema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters'),
  draft: z.coerce.boolean().default(false),
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
    expect(req.body).toEqual({ title: 'A Good Title', draft: false })
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

/**
 * This middleware wraps every validated route, including POST /auth/signup and
 * /auth/login — so whatever it logs, it logs a plaintext password. Two separate
 * guarantees, because either alone is insufficient: the gate keeps production
 * silent, and the redaction means turning DEBUG on to chase a bug (which is
 * exactly when someone would) still cannot spill a credential.
 */
describe('validate credential logging', () => {
  const originalDebug = process.env.DEBUG

  afterEach(() => {
    if (originalDebug === undefined) delete process.env.DEBUG
    else process.env.DEBUG = originalDebug
    vi.restoreAllMocks()
  })

  it('never logs a password, even with DEBUG on', () => {
    process.env.DEBUG = '1'
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const { req, res, next } = ctx({ title: 'A Good Title', password: 'super-secret-value' })

    validate(Schema)(req, res, next)

    // Without this the test passes vacuously if the gate suppresses everything.
    expect(log).toHaveBeenCalled()
    expect(JSON.stringify(log.mock.calls)).not.toContain('super-secret-value')
  })

  it('logs nothing at all when DEBUG is off', () => {
    delete process.env.DEBUG
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const { req, res, next } = ctx({ title: 'A Good Title', password: 'super-secret-value' })

    validate(Schema)(req, res, next)

    expect(log).not.toHaveBeenCalled()
  })
})

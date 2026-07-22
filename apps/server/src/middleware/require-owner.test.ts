import type { NextFunction, Request, Response } from 'express'
import { ForbiddenError, NotFoundError, UnauthorizedError } from '../lib/errors.js'
import { Types } from 'mongoose'
import { describe, expect, it, vi } from 'vitest'
import { requireOwner } from './require-owner.js'

function ctx(userId?: string) {
  const req = { session: userId ? { userId } : {}, params: {} } as unknown as Request
  const res = {} as Response
  const next = vi.fn() as unknown as NextFunction
  return { req, res, next: next as ReturnType<typeof vi.fn> }
}

describe('requireOwner', () => {
  it('calls next() with no error when the session identity is the author', async () => {
    const id = new Types.ObjectId()
    const { req, res, next } = ctx(id.toString())
    await requireOwner(async () => ({ author: id }))(req, res, next)
    expect(next).toHaveBeenCalledWith()
  })

  it('passes ForbiddenError for a signed-in non-owner', async () => {
    // THE legacy vulnerability: post.js:42 let any signed-in user delete any post.
    const { req, res, next } = ctx(new Types.ObjectId().toString())
    await requireOwner(async () => ({ author: new Types.ObjectId() }))(req, res, next)
    expect(next.mock.calls[0]?.[0]).toBeInstanceOf(ForbiddenError)
  })

  it('passes UnauthorizedError for an anonymous caller — and never runs the loader', async () => {
    const load = vi.fn()
    const { req, res, next } = ctx(undefined)
    await requireOwner(load)(req, res, next)
    expect(next.mock.calls[0]?.[0]).toBeInstanceOf(UnauthorizedError)
    expect(load).not.toHaveBeenCalled() // don't hit the DB for a request we already reject
  })

  it('passes NotFoundError when the resource does not exist', async () => {
    const { req, res, next } = ctx(new Types.ObjectId().toString())
    await requireOwner(async () => null)(req, res, next)
    expect(next.mock.calls[0]?.[0]).toBeInstanceOf(NotFoundError)
  })

  it('forwards a loader rejection instead of swallowing it into a 403', async () => {
    const { req, res, next } = ctx(new Types.ObjectId().toString())
    const boom = new Error('db down')
    await requireOwner(async () => {
      throw boom
    })(req, res, next)
    expect(next).toHaveBeenCalledWith(boom)
  })
})

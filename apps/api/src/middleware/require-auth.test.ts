import type { NextFunction, Request, Response } from 'express'
import { UnauthorizedError } from '@blog/shared'
import { describe, expect, it, vi } from 'vitest'
import { requireAuth } from './require-auth.js'

function ctx(session: Partial<{ userId: string }> | undefined) {
  const req = { session } as unknown as Request
  const res = {} as Response
  const next = vi.fn() as unknown as NextFunction
  return { req, res, next: next as ReturnType<typeof vi.fn> }
}

describe('requireAuth', () => {
  it('calls next() with no error when a session identity is present', () => {
    const { req, res, next } = ctx({ userId: 'u1' })
    requireAuth(req, res, next)
    expect(next).toHaveBeenCalledWith()
  })

  it('passes UnauthorizedError when the session has no userId', () => {
    const { req, res, next } = ctx({})
    requireAuth(req, res, next)
    expect(next.mock.calls[0]?.[0]).toBeInstanceOf(UnauthorizedError)
  })

  it('passes UnauthorizedError when there is no session at all', () => {
    const { req, res, next } = ctx(undefined)
    requireAuth(req, res, next)
    expect(next.mock.calls[0]?.[0]).toBeInstanceOf(UnauthorizedError)
  })
})

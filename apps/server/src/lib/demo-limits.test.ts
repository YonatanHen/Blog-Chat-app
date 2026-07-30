import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DemoLimitError } from './errors.js'
import {
  DEMO_FULL_MESSAGE,
  assertCommentSlotFree,
  assertPostSlotFree,
  assertUserSlotFree,
  demoLimits,
} from './demo-limits.js'

const KEYS = ['DEMO_MAX_USERS', 'DEMO_MAX_POSTS_PER_USER', 'DEMO_MAX_COMMENTS_PER_POST'] as const
// Saved and restored, never deleted: vitest runs this suite with singleFork, so
// every test file shares one process, and deleting these would drop the raised
// limits vitest.config.ts sets for all the other fixtures.
const ORIGINAL = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]))
afterEach(() => {
  for (const k of KEYS) {
    if (ORIGINAL[k] === undefined) delete process.env[k]
    else process.env[k] = ORIGINAL[k]
  }
})

describe('demoLimits', () => {
  it('uses the spec defaults when unset', () => {
    for (const k of KEYS) delete process.env[k]
    expect(demoLimits.maxUsers).toBe(20)
    expect(demoLimits.maxPostsPerUser).toBe(3)
    expect(demoLimits.maxCommentsPerPost).toBe(10)
  })

  // Read per call, not captured at import, so a test can raise a cap without
  // reloading the module.
  it('is env-driven', () => {
    process.env.DEMO_MAX_USERS = '99'
    expect(demoLimits.maxUsers).toBe(99)
  })

  it('falls back rather than disabling the cap on a garbage value', () => {
    process.env.DEMO_MAX_POSTS_PER_USER = 'not-a-number'
    expect(demoLimits.maxPostsPerUser).toBe(3)
    process.env.DEMO_MAX_POSTS_PER_USER = ''
    expect(demoLimits.maxPostsPerUser).toBe(3)
  })

  it('honours an explicit 0 — a deployment may legitimately close signups', () => {
    process.env.DEMO_MAX_USERS = '0'
    expect(demoLimits.maxUsers).toBe(0)
    expect(() => assertUserSlotFree(0)).toThrow(DemoLimitError)
  })
})

describe('cap assertions', () => {
  // These assert against the spec defaults, so the raised ambient values from
  // vitest.config.ts have to be cleared first. afterEach puts them back.
  beforeEach(() => {
    for (const k of KEYS) delete process.env[k]
  })

  it('allows a slot below the cap and refuses at it', () => {
    expect(() => assertUserSlotFree(19)).not.toThrow()
    expect(() => assertUserSlotFree(20)).toThrow(DemoLimitError)
    expect(() => assertPostSlotFree(2)).not.toThrow()
    expect(() => assertPostSlotFree(3)).toThrow(DemoLimitError)
    expect(() => assertCommentSlotFree(9)).not.toThrow()
    expect(() => assertCommentSlotFree(10)).toThrow(DemoLimitError)
  })

  // Two conditions, two messages. Telling someone who has used their 2 posts
  // that the app is full is false, and invites a support email about a working
  // app.
  it('says the demo is full only for the global user cap', () => {
    expect(() => assertUserSlotFree(20)).toThrow(/reached its visitor limit/)
    expect(() => assertUserSlotFree(20)).toThrow(/github.com\/YonatanHen/)
  })

  it('tells a capped account it has spent its own share, not that the app is full', () => {
    expect(() => assertPostSlotFree(3)).toThrow(/caps each account at 3 posts/)
    expect(() => assertPostSlotFree(3)).not.toThrow(/visitor limit/)
    // The suggested remedy has to be real — delete exists for posts and comments.
    expect(() => assertCommentSlotFree(10)).toThrow(/Delete one of yours/)
  })

  it('quotes the configured numbers, not hardcoded ones', () => {
    process.env.DEMO_MAX_POSTS_PER_USER = '5'
    process.env.DEMO_MAX_COMMENTS_PER_POST = '7'
    expect(() => assertPostSlotFree(5)).toThrow(/caps each account at 5 posts and each post at 7/)
  })

  it('keeps the full-demo message stable — it is quoted in the README and specs', () => {
    expect(DEMO_FULL_MESSAGE).toContain('portfolio demo app')
  })
})

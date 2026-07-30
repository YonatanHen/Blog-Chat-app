import { DemoLimitError } from './errors.js'

/**
 * Capacity caps for the public demo deployment (demo-caps spec §3).
 *
 * Per-owner rather than global for posts and comments: a global pool lets one
 * enthusiastic visitor consume all of it, and every later visitor finds the app
 * full. A per-account allowance cannot be spent on anyone else's behalf, which
 * also makes the total footprint a predictable product of the caps —
 * 20 users × 3 posts × 10 comments — small enough to share a free cluster.
 *
 * Read per call rather than captured at module load so tests can raise them.
 */
function limit(name: string, fallback: number): number {
  const raw = process.env[name]
  const parsed = raw === undefined || raw.trim() === '' ? Number.NaN : Number(raw)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
}

export const demoLimits = {
  get maxUsers(): number {
    return limit('DEMO_MAX_USERS', 20)
  },
  get maxPostsPerUser(): number {
    return limit('DEMO_MAX_POSTS_PER_USER', 3)
  },
  get maxCommentsPerPost(): number {
    return limit('DEMO_MAX_COMMENTS_PER_POST', 10)
  },
}

/**
 * Two messages, because there are two conditions. Telling a visitor who has
 * used their 2 posts that the app is at capacity is simply false, and invites a
 * support email about a working app.
 */
export const DEMO_FULL_MESSAGE =
  "This is a portfolio demo app and it's reached its visitor limit. " +
  'For any questions, contact the creator directly on GitHub: github.com/YonatanHen'

export function allowanceMessage(): string {
  return (
    `This demo caps each account at ${demoLimits.maxPostsPerUser} posts and each post at ` +
    `${demoLimits.maxCommentsPerPost} comments, so there's room for everyone trying it out. ` +
    'Delete one of yours to make space.'
  )
}

/** The demo genuinely is full — no further visitor accounts fit. */
export function assertUserSlotFree(currentUsers: number): void {
  if (currentUsers >= demoLimits.maxUsers) throw new DemoLimitError(DEMO_FULL_MESSAGE)
}

/** The app is fine; this account has spent its share. The remedy is real —
 *  delete is implemented for both posts and comments. */
export function assertPostSlotFree(currentPostsByAuthor: number): void {
  if (currentPostsByAuthor >= demoLimits.maxPostsPerUser) throw new DemoLimitError(allowanceMessage())
}

export function assertCommentSlotFree(currentCommentsOnPost: number): void {
  if (currentCommentsOnPost >= demoLimits.maxCommentsPerPost) {
    throw new DemoLimitError(allowanceMessage())
  }
}

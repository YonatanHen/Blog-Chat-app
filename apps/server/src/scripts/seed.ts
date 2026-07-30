import { slugify } from '@blog/zod-shared'
import mongoose from 'mongoose'
import { connectDb } from '../lib/db.js'
import { resolveSeedTarget } from './seed-target.js'
import { userService } from '../lib/services/user.js'
import { CommentModel } from '../models/comment.js'
import { LikeModel } from '../models/like.js'
import { PostModel } from '../models/post.js'
import { UserModel } from '../models/user.js'

// Idempotent and destructive: wipes and rewrites the collections it owns.
// The demo password is a throwaway credential for a public demo account, not a secret.
const DEMO_PASSWORD = 'demo-password-1234'

const POSTS = [
  {
    title: 'Rebuilding a Five-Year-Old MERN App',
    tags: ['engineering', 'react'],
    body: [
      'This blog is a rebuild of a MERN app I wrote five years ago.',
      'The original had five authorization holes, a Redux store that cached server state by hand, and a Dockerfile that never worked. Every one of those is a test in this codebase now.',
      'The rebuild is an Express REST API with a React SPA in front of it. Not because the old stack was slow — because the new one is explicit.',
    ].join('\n\n'),
  },
  {
    title: 'Why Identity Never Comes From The Request Body',
    tags: ['security'],
    body: [
      'The legacy app had an endpoint that took a user id and a new password, both from the request body, and applied them.',
      'That is an account takeover, not a bug. Anyone could rewrite anyone. The fix is one sentence: identity always comes from the session, never from a body field.',
      'Every mutation in this API compares req.session.userId to the resource owner, and there is a test for each of the five holes the old app had.',
    ].join('\n\n'),
  },
  {
    title: 'Gating Content At The Serialization Boundary',
    tags: ['engineering', 'security'],
    body: [
      'A registration wall implemented in a component is a suggestion. The body is still in the JSON, one DevTools tab away.',
      'If you are reading this paragraph you are signed in — the API never serialized it otherwise.',
      'The rule lives in postService.getBySlug, which does not copy the body into its return value when the reader is anonymous. There is nothing to find in the response because it was never put there.',
    ].join('\n\n'),
  },
]

async function seed(): Promise<void> {
  // Not loadEnv(): seeding needs a Mongo URI and nothing else, and requiring
  // SESSION_SECRET/REDIS_URL to reseed was friction with no safety value.
  const target = resolveSeedTarget(process.argv.slice(2), process.env)
  console.log(`Seeding ${target.isProd ? 'PRODUCTION' : 'local'} database: ${target.host}`)
  await connectDb(target.uri)
  // The unique indexes are layer 3 of the authorization model — build them.
  await mongoose.syncIndexes()

  // CommentModel is not optional here. Without it the weekly reset frees every
  // post and user while every comment survives, so the per-post comment cap
  // would ratchet to full and never release a slot — creating the permanent
  // wall the reset exists to prevent, plus a fresh generation of orphaned rows
  // pointing at deleted posts every week.
  console.log('Wiping posts, comments, likes and users…')
  await Promise.all([
    PostModel.deleteMany({}),
    CommentModel.deleteMany({}),
    LikeModel.deleteMany({}),
    UserModel.deleteMany({}),
  ])

  const demo = await userService.signup({
    username: 'demo',
    email: 'demo@example.com',
    password: DEMO_PASSWORD,
  })
  const reader = await userService.signup({
    username: 'reader',
    email: 'reader@example.com',
    password: DEMO_PASSWORD,
  })
  console.log(`Created users: ${demo.username}, ${reader.username}`)

  // Three posts, all by `demo`, against a per-author cap of 3 — exactly at the
  // limit, so `demo` cannot add a fourth through the UI. That is intended: new
  // portfolio content is added by editing this file and reseeding.
  //
  // This writes via PostModel, BELOW the service layer, so the cap guard never
  // runs. That bypass is deliberate. Do not "tidy" it to call
  // postService.create(): reseeding would then fail once the collection is not
  // empty, and only in production.
  for (const post of POSTS) {
    const created = await PostModel.create({
      ...post,
      slug: slugify(post.title),
      author: new mongoose.Types.ObjectId(demo.id),
    })
    // One like from the reader, so likeCount is not uniformly zero in the demo.
    await LikeModel.create({ user: new mongoose.Types.ObjectId(reader.id), post: created._id })
    console.log(`  ${created.slug}`)
  }

  await mongoose.disconnect()
  console.log(`\nDone. Sign in as: demo / ${DEMO_PASSWORD}`)
}

seed().catch((err) => {
  console.error('Seed failed:', err)
  process.exit(1)
})
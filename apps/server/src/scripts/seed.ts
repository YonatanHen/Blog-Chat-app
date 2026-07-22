import { slugify } from '@blog/zod-shared'
import mongoose from 'mongoose'
import { loadEnv } from '../lib/env.js'
import { connectDb } from '../lib/db.js'
import { userService } from '../lib/services/user.js'
import { LikeModel } from '../models/like.js'
import { PostModel } from '../models/post.js'
import { UserModel } from '../models/user.js'

// Idempotent and destructive: wipes and rewrites the collections it owns.
// The demo password is a throwaway credential for a public demo account, not a secret.
const DEMO_PASSWORD = 'demo-password-1234'

const POSTS = [
  {
    title: 'Rebuilding a Five-Year-Old MERN App',
    premium: false,
    tags: ['engineering', 'react'],
    body: [
      'This blog is a rebuild of a MERN app I wrote five years ago.',
      'The original had five authorization holes, a Redux store that cached server state by hand, and a Dockerfile that never worked. Every one of those is a test in this codebase now.',
      'The rebuild is an Express REST API with a React SPA in front of it. Not because the old stack was slow — because the new one is explicit.',
    ].join('\n\n'),
  },
  {
    title: 'Why Identity Never Comes From The Request Body',
    premium: false,
    tags: ['security'],
    body: [
      'The legacy app had an endpoint that took a user id and a new password, both from the request body, and applied them.',
      'That is an account takeover, not a bug. Anyone could rewrite anyone. The fix is one sentence: identity always comes from the session, never from a body field.',
      'Every mutation in this API compares req.session.userId to the resource owner, and there is a test for each of the five holes the old app had.',
    ].join('\n\n'),
  },
  {
    title: 'Gating Content At The Serialization Boundary',
    premium: true,
    tags: ['engineering', 'security'],
    body: [
      'A paywall implemented in a component is a suggestion. The body is still in the JSON, one DevTools tab away.',
      'This post is premium, so if you are reading this paragraph you are signed in — the API never serialized it otherwise.',
      'The rule lives in postService.getBySlug, which does not copy the body into its return value when the reader is anonymous. There is nothing to find in the response because it was never put there.',
    ].join('\n\n'),
  },
]

async function seed(): Promise<void> {
  const env = loadEnv()
  await connectDb(env.MONGODB_URI)
  // The unique indexes are layer 3 of the authorization model — build them.
  await mongoose.syncIndexes()

  console.log('Wiping posts, likes and users…')
  await Promise.all([PostModel.deleteMany({}), LikeModel.deleteMany({}), UserModel.deleteMany({})])

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

  for (const post of POSTS) {
    const created = await PostModel.create({
      ...post,
      slug: slugify(post.title),
      author: new mongoose.Types.ObjectId(demo.id),
    })
    // One like from the reader, so likeCount is not uniformly zero in the demo.
    await LikeModel.create({ user: new mongoose.Types.ObjectId(reader.id), post: created._id })
    console.log(`  ${created.slug}${post.premium ? ' (premium)' : ''}`)
  }

  await mongoose.disconnect()
  console.log(`\nDone. Sign in as: demo / ${DEMO_PASSWORD}`)
}

seed().catch((err) => {
  console.error('Seed failed:', err)
  process.exit(1)
})
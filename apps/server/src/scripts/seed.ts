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
    title: 'Why the Sky Is Blue and the Sunset Is Red',
    tags: ['science', 'nature'],
    body: [
      "Sunlight looks white, but it's every color mixed together, and each color travels through air as a wave of a different length. Blue light has a short wavelength and scatters off air molecules far more easily than red does.",
      "At midday the sun is overhead and its light takes the shortest path through the atmosphere, so that scattered blue reaches your eyes from every direction — the whole sky glows blue.",
      "At sunset the light travels through much more atmosphere at a low angle. Most of the blue scatters away long before it reaches you, leaving the longer red and orange wavelengths to dominate what's left.",
    ].join('\n\n'),
  },
  {
    title: 'How Coffee Went From an Ethiopian Hillside to a Global Habit',
    tags: ['history', 'food'],
    body: [
      'Legend credits a goat herder named Kaldi, who noticed his goats grew unusually energetic after eating berries from a certain tree, and brought them to a local monastery to ask what they were.',
      'Whatever really happened in that highland region of Ethiopia, coffee cultivation had spread to Yemen by the 15th century, where it was first roasted and brewed roughly the way it is today.',
      "From Yemeni ports it moved into the Ottoman Empire, then into Europe through Venetian trade routes in the 1600s, arriving in a city near you a few centuries later as the thing that gets you through a Monday.",
    ].join('\n\n'),
  },
  {
    title: 'The Monarch Butterfly Migration Nobody Fully Explained Until Recently',
    tags: ['nature', 'biology'],
    body: [
      "Monarch butterflies in eastern North America fly up to 3,000 miles to a handful of specific forests in central Mexico each winter, despite no single butterfly ever having made the round trip before.",
      "The butterflies that arrive in Mexico are three or four generations removed from the ones that left the previous spring, so the route can't be memorized by an individual — it has to be encoded some other way.",
      "Researchers eventually traced the compass to a combination of the sun's position and an internal circadian clock, sensed through antennae that appear to also register the Earth's magnetic field as a backup on cloudy days.",
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
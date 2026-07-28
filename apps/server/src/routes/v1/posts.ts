import { CreatePostSchema, UpdatePostSchema } from '@blog/zod-shared'
import { Router, type Request } from 'express'
import { commentsRouter } from './comments.js'
import { likeService } from '../../lib/services/like.js'
import { postService } from '../../lib/services/post.js'
import { requireAuth } from '../../middleware/require-auth.js'
import { requireOwner } from '../../middleware/require-owner.js'
import { validate } from '../../middleware/validate.js'

export const postsRouter = Router()

/**
 * Loader for requireOwner: resolves :slug to the post's author.
 * Typed Request<{ slug: string }>, NOT a bare Request — a bare Request types
 * req.params.slug as `string | string[] | undefined` under this repo's
 * noUncheckedIndexedAccess, which will not pass to a `slug: string` service.
 */
const loadPostOwner = (req: Request<{ slug: string }>) =>
  postService.findBySlugForOwnerCheck(req.params.slug)

postsRouter.get('/', async (req, res) => {
  res.json(await postService.list(req.session?.userId))
})

postsRouter.post('/', requireAuth, validate(CreatePostSchema), async (req, res) => {
  // requireAuth guarantees userId is set.
  res.status(201).json(await postService.create(req.body, req.session.userId!))
})

postsRouter.put<{ slug: string }>('/:slug/likes', requireAuth, async (req, res) => {
  res.json(await likeService.like(req.params.slug, req.session.userId!))
})

postsRouter.delete<{ slug: string }>('/:slug/likes', requireAuth, async (req, res) => {
  res.json(await likeService.unlike(req.params.slug, req.session.userId!))
})

// Registered with the other sub-resources, above the bare /:slug handlers.
// Express matches in registration order, and unlike a route path a `use` mount
// matches by PREFIX — so this must never end up behind a handler that could
// claim the same prefix first.
postsRouter.use('/:slug/comments', commentsRouter)

postsRouter.get('/:slug', async (req, res) => {
  // The viewer id is passed to the service, which decides what to serialize.
  // The handler does NOT branch on the session — gating belongs to one layer only.
  res.json(await postService.getBySlug(req.params.slug, req.session?.userId))
})

postsRouter.patch(
  '/:slug',
  requireOwner(loadPostOwner),
  validate(UpdatePostSchema),
  async (req, res) => {
    res.json(await postService.update(req.params.slug, req.body))
  },
)

postsRouter.delete('/:slug', requireOwner(loadPostOwner), async (req, res) => {
  await postService.remove(req.params.slug)
  res.status(204).end()
})

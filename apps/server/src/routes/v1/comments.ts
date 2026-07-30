import { CreateCommentSchema, UpdateCommentSchema } from '@blog/zod-shared'
import { Router, type Request } from 'express'
import { commentService } from '../../lib/services/comment.js'
import { requireAuth } from '../../middleware/require-auth.js'
import { requireOwner } from '../../middleware/require-owner.js'
import { validate } from '../../middleware/validate.js'

/**
 * Mounted under /api/v1/posts/:slug/comments, so `mergeParams` is required —
 * without it `req.params.slug` is undefined on this router and every request
 * would 404 on a post that exists.
 */
export const commentsRouter = Router({ mergeParams: true })

type CommentParams = { slug: string; commentId: string }

/**
 * Loader for requireOwner: resolves :slug + :commentId to the comment's author.
 * Both params, not just the id — a comment addressed through another post's URL
 * must 404, the way likeService resolves :slug before touching a like.
 */
const loadCommentOwner = (req: Request<CommentParams>) =>
  commentService.findForOwnerCheck(req.params.slug, req.params.commentId)

// Public, and deliberately ungated: the wall is on post bodies, not on the
// discussion around them, so no viewer id is passed and none is consulted.
commentsRouter.get<{ slug: string }>('/', async (req, res) => {
  res.json(await commentService.list(req.params.slug))
})

commentsRouter.post<{ slug: string }>(
  '/',
  requireAuth,
  validate(CreateCommentSchema),
  async (req, res) => {
    // requireAuth guarantees userId is set.
    res.status(201).json(await commentService.create(req.params.slug, req.body, req.session.userId!))
  },
)

commentsRouter.patch<CommentParams>(
  '/:commentId',
  requireOwner(loadCommentOwner),
  validate(UpdateCommentSchema),
  async (req, res) => {
    res.json(await commentService.update(req.params.commentId, req.body))
  },
)

commentsRouter.delete<CommentParams>(
  '/:commentId',
  requireOwner(loadCommentOwner),
  async (req, res) => {
    await commentService.remove(req.params.commentId)
    res.status(204).end()
  },
)

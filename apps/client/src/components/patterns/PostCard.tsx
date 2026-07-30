import { Link } from 'react-router'
import type { Post } from '../../api/posts.js'
import { formatDate } from '../../lib/format-date.js'
import { cn } from '../../lib/cn.js'
import { PostTile } from './PostTile.js'

/**
 * A feed entry. `post.body` is always a teaser here — the list endpoint never
 * ships full bodies — so this renders it verbatim and never truncates.
 * `post.gated` is the server's verdict on whether this reader may open the post;
 * the card only relays it (spec §6), it does not decide it.
 */
export function PostCard({ post, featured = false }: { post: Post; featured?: boolean }) {
  const meta = (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-xs tracking-[0.09em] text-[var(--ink-faint)] uppercase tabular-nums">
      <time dateTime={post.createdAt}>{formatDate(post.createdAt)}</time>
      <span aria-hidden="true">·</span>
      <span>{post.author.username}</span>
      <span aria-hidden="true">·</span>
      <span>
        {post.likeCount} {post.likeCount === 1 ? 'like' : 'likes'}
      </span>
    </p>
  )

  // The tile is decorative and duplicates the headline's destination, so it is
  // kept out of the a11y tree — the headline link is the one real way in.
  const tile = (
    <div className="relative">
      <Link to={`/blog/${post.slug}`} aria-hidden="true" tabIndex={-1} className="group block">
        <PostTile
          slug={post.slug}
          coverUrl={post.coverUrl}
          className="transition-opacity duration-200 group-hover:opacity-85"
        />
      </Link>
      {post.gated && (
        <Link
          to="/login"
          className="absolute bottom-2 left-2 inline-flex items-center gap-1.5 bg-[var(--sheet)] px-2 py-1 font-mono text-[0.66rem] tracking-[0.11em] text-[var(--muted-foreground)] uppercase hover:text-[var(--primary)]"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            aria-hidden="true"
            className="size-3"
          >
            <rect x="4" y="10" width="16" height="11" rx="1" />
            <path d="M8 10V7a4 4 0 0 1 8 0v3" />
          </svg>
          Sign in to read
        </Link>
      )}
    </div>
  )

  const body = (
    <div className="flex flex-col gap-2.5">
      {meta}
      <h3
        className={cn(
          'font-display leading-none tracking-[-0.035em] text-balance',
          featured ? 'text-3xl md:text-4xl' : 'text-xl',
        )}
      >
        <Link to={`/blog/${post.slug}`} className="hover:text-[var(--primary)]">
          {post.title}
        </Link>
      </h3>

      <p className="line-clamp-3 max-w-[58ch] whitespace-pre-wrap text-[var(--muted-foreground)]">
        {post.body}
      </p>

      {post.tags.length > 0 && (
        <ul className="flex flex-wrap gap-1.5 font-mono text-[0.68rem] tracking-[0.09em] uppercase">
          {post.tags.map((tag) => (
            <li key={tag} className="bg-[var(--primary-wash)] px-1.5 py-0.5 text-[var(--primary)]">
              {tag}
            </li>
          ))}
        </ul>
      )}

      {featured && (
        <Link
          to={`/blog/${post.slug}`}
          className="mt-1 inline-flex items-center gap-2 self-start border-b-[1.5px] border-[var(--primary)] pb-0.5 font-mono text-xs tracking-[0.11em] text-[var(--primary)] uppercase"
        >
          Read the post <span aria-hidden="true">→</span>
        </Link>
      )}
    </div>
  )

  return featured ? (
    <article className="grid items-center gap-6 md:grid-cols-[1.35fr_1fr] md:gap-10">
      {tile}
      {body}
    </article>
  ) : (
    <article className="flex flex-col gap-3">
      {tile}
      {body}
    </article>
  )
}

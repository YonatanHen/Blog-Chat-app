import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { usePosts } from '../hooks/use-posts.js'
import { useDebouncedValue } from '../hooks/use-debounced-value.js'
import { PostCard } from '../components/patterns/PostCard.js'
import { SearchBar } from '../components/patterns/SearchBar.js'
import { EmptyState } from '../components/patterns/EmptyState.js'
import { Skeleton } from '../components/ui/skeleton.js'

export function BlogFeedPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  // What's shown in the box is local state, updated synchronously on every
  // keystroke. It must NOT be derived from the URL on every render: router
  // state updates round-trip through history/context, and a keystroke that
  // lands before that round trip resolves would otherwise get overwritten by
  // the still-stale value, so fast typing loses every character but the last.
  const [term, setTerm] = useState(() => searchParams.get('q') ?? '')
  // The box tracks every keystroke; the query does not. Debouncing between the
  // two is what makes this one request per pause instead of one per character.
  // Trimmed for the same reason the API drops a blank filter: "   " is not a
  // search, so it must not colour the empty state either.
  const debouncedTerm = useDebouncedValue(term).trim()

  const { data: posts, isPending, isError } = usePosts({ q: debouncedTerm })

  // The URL is synced from the debounced term, not from every keystroke, so
  // it settles well after the round trip that caused the original bug — a
  // search stays bookmarkable/shareable without fighting the input for control
  // of what's on screen. Edits `q` in place: passing an object would drop
  // every other param, and `tag` is already plumbed through the API — a
  // keystroke silently clearing a tag filter would be a confusing bug to trace
  // back here. `replace` so typing does not push one history entry per pause.
  useEffect(() => {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev)
        if (debouncedTerm) params.set('q', debouncedTerm)
        else params.delete('q')
        return params
      },
      { replace: true },
    )
  }, [debouncedTerm, setSearchParams])

  const handleSearch = (next: string) => setTerm(next)

  let content: ReactNode
  if (isPending) {
    content = (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
    )
  } else if (isError) {
    content = <EmptyState message="Could not load posts. Please try again." />
  } else if (!posts || posts.length === 0) {
    content = (
      <EmptyState message={debouncedTerm ? `No posts match “${debouncedTerm}”.` : 'No posts yet.'} />
    )
  } else {
    content = (
      <div className="flex flex-col gap-4">
        {posts.map((post) => (
          <PostCard key={post.id} post={post} />
        ))}
      </div>
    )
  }

  // The search box is outside every branch on purpose: it must stay on screen
  // while results load and, above all, when a search returns nothing — hiding
  // it there would leave the reader stranded with no way to change the term.
  return (
    <div className="flex flex-col gap-6">
      <SearchBar value={term} onChange={handleSearch} />
      {content}
    </div>
  )
}

import type { ReactNode } from 'react'
import { useSearchParams } from 'react-router'
import { usePosts } from '../hooks/use-posts.js'
import { useDebouncedValue } from '../hooks/use-debounced-value.js'
import { PostCard } from '../components/patterns/PostCard.js'
import { SearchBar } from '../components/patterns/SearchBar.js'
import { EmptyState } from '../components/patterns/EmptyState.js'
import { Skeleton } from '../components/ui/skeleton.js'

export function BlogFeedPage() {
  // The term lives in the URL, not in component state: a search is then
  // bookmarkable, shareable, and survives a reload or the back button.
  const [searchParams, setSearchParams] = useSearchParams()
  const term = searchParams.get('q') ?? ''
  // The box tracks every keystroke; the query does not. Debouncing between the
  // two is what makes this one request per pause instead of one per character.
  // Trimmed for the same reason the API drops a blank filter: "   " is not a
  // search, so it must not colour the empty state either.
  const debouncedTerm = useDebouncedValue(term).trim()

  const { data: posts, isPending, isError } = usePosts({ q: debouncedTerm })

  // Edits `q` in place instead of replacing the whole search string: passing an
  // object would drop every other param, and `tag` is already plumbed through
  // the API — a keystroke silently clearing a tag filter would be a confusing
  // bug to trace back here. `replace` so typing does not push one history entry
  // per keystroke; back should leave the feed, not replay the search.
  const handleSearch = (next: string) =>
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev)
        if (next) params.set('q', next)
        else params.delete('q')
        return params
      },
      { replace: true },
    )

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

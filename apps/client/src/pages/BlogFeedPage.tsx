import { usePosts } from '../hooks/use-posts.js'
import { PostCard } from '../components/patterns/PostCard.js'
import { EmptyState } from '../components/patterns/EmptyState.js'
import { Skeleton } from '../components/ui/skeleton.js'

export function BlogFeedPage() {
  const { data: posts, isPending, isError } = usePosts()

  if (isPending) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
    )
  }

  if (isError) return <EmptyState message="Could not load posts. Please try again." />
  if (!posts || posts.length === 0) return <EmptyState message="No posts yet." />

  return (
    <div className="flex flex-col gap-4">
      {posts.map((post) => (
        <PostCard key={post.id} post={post} />
      ))}
    </div>
  )
}

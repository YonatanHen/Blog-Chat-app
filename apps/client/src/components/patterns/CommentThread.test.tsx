// The root vitest.config.ts declares no setupFiles, so apps/client/src/test/setup.ts
// never runs — every client test file wires jest-dom and cleanup itself, as
// apps/client/src/components/patterns/AutoForm.test.tsx does.
import '@testing-library/jest-dom/vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildCommentTree, CommentThread } from './CommentThread.js'
import { queryKeys } from '../../lib/query-client.js'
import type { AuthUser } from '../../hooks/use-auth.js'
import type { Comment } from '../../api/comments.js'

const at = '2026-01-01T00:00:00.000Z'

const make = (id: string, parent: string | null = null, authorId = 'u1'): Comment => ({
  id,
  body: `body ${id}`,
  author: { id: authorId, username: `user-${authorId}` },
  parent,
  createdAt: at,
  updatedAt: at,
})

describe('buildCommentTree', () => {
  it('nests replies under their parent', () => {
    const tree = buildCommentTree([make('a'), make('b', 'a'), make('c', 'b')])
    expect(tree).toHaveLength(1)
    expect(tree[0]!.replies[0]!.id).toBe('b')
    expect(tree[0]!.replies[0]!.replies[0]!.id).toBe('c')
  })

  it('keeps roots in the order the server sent them', () => {
    expect(buildCommentTree([make('a'), make('b'), make('c')]).map((n) => n.id)).toEqual([
      'a',
      'b',
      'c',
    ])
  })

  // Mid-delete the cache can still hold a reply whose parent is already gone.
  // Dropping it would make a comment that still exists on the server invisible.
  it('promotes an orphan to a root rather than losing it', () => {
    const tree = buildCommentTree([make('a'), make('orphan', 'deleted-parent')])
    expect(tree.map((n) => n.id)).toEqual(['a', 'orphan'])
  })

  it('returns an empty tree for an empty thread', () => {
    expect(buildCommentTree([])).toEqual([])
  })

  it('does not mutate the comments it was given', () => {
    const input = [make('a'), make('b', 'a')]
    buildCommentTree(input)
    expect(input[0]).not.toHaveProperty('replies')
  })
})

function renderThread(comments: Comment[], me: AuthUser | null) {
  const client = new QueryClient({
    // staleTime keeps the seeded identity from being refetched over a network
    // that is not stubbed in the tests that do not care about it.
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  })
  client.setQueryData(queryKeys.me, me)
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <CommentThread slug="my-post" comments={buildCommentTree(comments)} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('CommentThread', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('renders every comment in the tree, at any depth', () => {
    renderThread([make('a'), make('b', 'a')], null)
    expect(screen.getByText('body a')).toBeInTheDocument()
    expect(screen.getByText('body b')).toBeInTheDocument()
  })

  it('renders comment bodies as Markdown, never as raw HTML', () => {
    const evil = { ...make('a'), body: '<script>alert(1)</script>' }
    const { container } = renderThread([evil], null)
    expect(container.querySelector('script')).toBeNull()
  })

  it('offers Edit and Delete to the comment author only', () => {
    renderThread([make('a', null, 'u1'), make('b', null, 'u2')], { id: 'u1', username: 'user-u1' })
    expect(screen.getAllByText('Edit')).toHaveLength(1)
    expect(screen.getAllByText('Delete')).toHaveLength(1)
  })

  it('offers neither to an anonymous reader, who also cannot reply', () => {
    renderThread([make('a')], null)
    expect(screen.queryByText('Edit')).not.toBeInTheDocument()
    expect(screen.queryByText('Delete')).not.toBeInTheDocument()
    expect(screen.queryByText('Reply')).not.toBeInTheDocument()
  })

  it('lets any signed-in reader reply, not just the author', () => {
    renderThread([make('a', null, 'u1')], { id: 'u2', username: 'user-u2' })
    expect(screen.getByText('Reply')).toBeInTheDocument()
    expect(screen.queryByText('Edit')).not.toBeInTheDocument()
  })

  it('reveals a nested composer when Reply is clicked', () => {
    renderThread([make('a')], { id: 'u1', username: 'user-u1' })
    expect(screen.queryByLabelText('Comment')).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('Reply'))
    expect(screen.getByLabelText('Comment')).toBeInTheDocument()
    expect(screen.getByText('Reply', { selector: 'button[type="submit"]' })).toBeInTheDocument()
  })

  it('swaps the body for an editor seeded with the current text', () => {
    renderThread([make('a')], { id: 'u1', username: 'user-u1' })
    fireEvent.click(screen.getByText('Edit'))

    expect(screen.getByLabelText('Comment')).toHaveValue('body a')
    expect(screen.queryByText('Delete')).not.toBeInTheDocument()
  })

  it('sends the parent id with a reply so the server nests it', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify(make('new', 'a')), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    renderThread([make('a')], { id: 'u1', username: 'user-u1' })
    fireEvent.click(screen.getByText('Reply'))
    fireEvent.change(screen.getByLabelText('Comment'), { target: { value: 'Replying.' } })
    fireEvent.click(screen.getByText('Reply', { selector: 'button[type="submit"]' }))

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/v1/posts/my-post/comments')
    expect(JSON.parse(init.body as string)).toEqual({ body: 'Replying.', parent: 'a' })
  })
})

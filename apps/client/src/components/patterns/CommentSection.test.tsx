// The root vitest.config.ts declares no setupFiles, so apps/client/src/test/setup.ts
// never runs — every client test file wires jest-dom and cleanup itself, as
// apps/client/src/components/patterns/AutoForm.test.tsx does.
import '@testing-library/jest-dom/vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CommentSection } from './CommentSection.js'
import { queryKeys } from '../../lib/query-client.js'
import type { AuthUser } from '../../hooks/use-auth.js'
import type { Comment } from '../../api/comments.js'

const comment: Comment = {
  id: 'c1',
  body: 'Nice post.',
  author: { id: 'u1', username: 'demo' },
  parent: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

function renderSection(me: AuthUser | null, comments: Comment[] = [comment]) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  })
  client.setQueryData(queryKeys.me, me)
  client.setQueryData(queryKeys.comments.list('my-post'), comments)
  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <CommentSection slug="my-post" />
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

describe('CommentSection', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('shows the thread and a composer to a signed-in reader', async () => {
    renderSection({ id: 'u2', username: 'reader' })
    await waitFor(() => expect(screen.getByText('Nice post.')).toBeInTheDocument())
    expect(screen.getByLabelText('Comment')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument()
  })

  // The post body may be teased for this reader, but the discussion is not
  // walled — what they lose is the ability to write, not to read.
  it('still shows the thread to an anonymous reader, with a sign-in prompt instead of a box', async () => {
    renderSection(null)
    await waitFor(() => expect(screen.getByText('Nice post.')).toBeInTheDocument())
    expect(screen.queryByLabelText('Comment')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login')
  })

  it('says so when nothing has been posted yet', async () => {
    renderSection(null, [])
    await waitFor(() => expect(screen.getByText('No comments yet.')).toBeInTheDocument())
    expect(screen.getByText('Comments (0)')).toBeInTheDocument()
  })
})

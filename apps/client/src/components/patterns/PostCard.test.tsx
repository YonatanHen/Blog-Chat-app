// The root vitest.config.ts declares no setupFiles, so apps/client/src/test/setup.ts
// never runs — every client test file wires jest-dom and cleanup itself, as
// apps/client/src/components/ui/button.test.tsx does.
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import { PostCard } from './PostCard.js'
import type { Post } from '../../api/posts.js'

const basePost: Post = {
  id: '1',
  title: 'Gating at the boundary',
  slug: 'gating-at-the-boundary',
  body: 'Para one.\n\nPara two.',
  gated: true,
  author: { id: 'u1', username: 'demo' },
  tags: ['express'],
  likeCount: 3,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

describe('PostCard', () => {
  afterEach(() => cleanup())

  it('prompts an anonymous reader to sign in', () => {
    render(<PostCard post={basePost} />, { wrapper: MemoryRouter })
    expect(screen.getByRole('link', { name: /sign in to read/i })).toHaveAttribute('href', '/login')
  })

  // The feed teases everyone, so a signed-in reader still sees a truncated body
  // here — but they are not locked out, so the prompt would be a lie.
  it('drops the prompt once the reader is signed in', () => {
    render(<PostCard post={{ ...basePost, gated: false }} />, { wrapper: MemoryRouter })
    expect(screen.queryByText(/sign in to read/i)).not.toBeInTheDocument()
  })

  it('renders the teaser the server sent, verbatim', () => {
    render(<PostCard post={basePost} />, { wrapper: MemoryRouter })
    expect(screen.getByText(/Para one\./)).toBeInTheDocument()
  })

  it('links to the post and credits the author', () => {
    render(<PostCard post={basePost} />, { wrapper: MemoryRouter })
    expect(screen.getByRole('link', { name: basePost.title })).toHaveAttribute(
      'href',
      '/blog/gating-at-the-boundary',
    )
    expect(screen.getByText(/demo/)).toBeInTheDocument()
  })
})

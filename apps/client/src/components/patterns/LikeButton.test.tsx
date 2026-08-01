// The root vitest.config.ts declares no setupFiles, so apps/client/src/test/setup.ts
// never runs — every client test file wires jest-dom and cleanup itself, as
// apps/client/src/components/ui/button.test.tsx does.
import '@testing-library/jest-dom/vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LikeButton } from './LikeButton.js'
import type { ReactElement } from 'react'

function renderWithClient(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

describe('LikeButton', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('shows an outline heart and calls the like (PUT) mutation when not liked', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {}))) // never resolves
    renderWithClient(<LikeButton slug="s" likeCount={2} liked={false} />)

    const button = screen.getByRole('button')
    expect(button.querySelector('svg')).not.toHaveClass('fill-current')

    fireEvent.click(button)
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/posts/s/likes'),
        expect.objectContaining({ method: 'PUT' }),
      ),
    )
  })

  it('shows a filled heart and calls the unlike (DELETE) mutation when liked', async () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {}))) // never resolves
    renderWithClient(<LikeButton slug="s" likeCount={3} liked={true} />)

    const button = screen.getByRole('button')
    expect(button.querySelector('svg')).toHaveClass('fill-current')

    fireEvent.click(button)
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/posts/s/likes'),
        expect.objectContaining({ method: 'DELETE' }),
      ),
    )
  })

  it('defaults to unliked when the `liked` prop is omitted (anonymous-viewer DTO)', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
    renderWithClient(<LikeButton slug="s" likeCount={0} />)

    expect(screen.getByRole('button').querySelector('svg')).not.toHaveClass('fill-current')
  })
})

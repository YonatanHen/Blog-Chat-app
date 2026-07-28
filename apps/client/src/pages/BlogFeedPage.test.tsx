// The root vitest.config.ts declares no setupFiles, so apps/client/src/test/setup.ts
// never runs — every client test file wires jest-dom and cleanup itself, as
// apps/client/src/components/patterns/AutoForm.test.tsx does.
import '@testing-library/jest-dom/vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { queryKeys } from '../lib/query-client.js'

// Real browsers don't apply a router's `setSearchParams` synchronously — it
// round-trips through history/context, same as it did in production when this
// bug shipped. RTL's `fireEvent` flushes React synchronously, which hides that
// gap entirely: a naive test typing into the box passes identically whether
// the box's value comes from local state or straight from the URL. This mock
// puts a real, fake-timer-controlled delay on `setSearchParams` so the gap
// that caused the bug is reproducible on demand.
let mockParams = new URLSearchParams()
let notify: (() => void) | undefined
vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>()
  return {
    ...actual,
    useSearchParams: () => {
      const [, setTick] = useState(0)
      notify = () => setTick((n) => n + 1)
      const setSearchParams = (
        updater: URLSearchParams | ((prev: URLSearchParams) => URLSearchParams),
      ) => {
        const prevAtCallTime = mockParams
        setTimeout(() => {
          mockParams = typeof updater === 'function' ? updater(prevAtCallTime) : updater
          notify?.()
        }, 100)
      }
      return [mockParams, setSearchParams] as const
    },
  }
})

// Imported after the mock so BlogFeedPage picks up the mocked useSearchParams.
const { BlogFeedPage } = await import('./BlogFeedPage.js')

function renderFeed() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  client.setQueryData(queryKeys.posts.list({}), [])
  client.setQueryData(queryKeys.posts.list({ q: 'identity' }), [])
  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <BlogFeedPage />
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

describe('BlogFeedPage search box', () => {
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    mockParams = new URLSearchParams()
    notify = undefined
  })

  // Regression: the box's value used to be read straight from the URL
  // (`searchParams.get('q')`) on every render. A keystroke that landed before
  // a prior `setSearchParams` round trip resolved got overwritten by the
  // still-stale value once that round trip finally landed — typing "identity"
  // at a normal pace left only the last keystroke on screen. Each `fireEvent`
  // below appends to whatever the DOM currently shows, exactly like a real
  // keypress does, so a mid-typing reset shows up as a garbled string instead
  // of "identity".
  it('keeps every keystroke on screen even when a stale URL round trip lands mid-typing', () => {
    vi.useFakeTimers()
    renderFeed()
    const input = screen.getByPlaceholderText('Search posts…') as HTMLInputElement

    for (const ch of 'identity') {
      fireEvent.change(input, { target: { value: input.value + ch } })
      // Faster than the mocked 100ms round trip: several keystrokes land
      // before any of their setSearchParams calls have resolved.
      act(() => void vi.advanceTimersByTime(30))
    }
    // Drain every round trip that's still pending.
    act(() => void vi.advanceTimersByTime(200))

    expect(input.value).toBe('identity')
  })
})

import '@testing-library/jest-dom/vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { queryKeys } from '../../lib/query-client.js'
import { OAuthButtons } from './OAuthButtons.js'

function renderWith(providers: { google: boolean } | undefined) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  })
  if (providers) client.setQueryData(queryKeys.providers, providers)
  return render(
    <QueryClientProvider client={client}>
      <OAuthButtons />
    </QueryClientProvider>,
  )
}

describe('OAuthButtons', () => {
  afterEach(() => cleanup())

  // A deployment with no OAuth app registered must show no button at all,
  // rather than one that leads to a 503.
  it('renders nothing when the provider is disabled', () => {
    const { container } = renderWith({ google: false })
    expect(container).toBeEmptyDOMElement()
  })

  it('renders nothing before the provider is known', () => {
    const { container } = renderWith(undefined)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders the Google button when enabled', () => {
    renderWith({ google: true })
    expect(screen.getByRole('link', { name: /google/i })).toBeInTheDocument()
  })

  // A top-level navigation, not a fetch: the provider has to render its own
  // consent screen and set its own cookies.
  it('links straight at the API route rather than fetching it', () => {
    renderWith({ google: true })
    expect(screen.getByRole('link', { name: /google/i })).toHaveAttribute(
      'href',
      '/api/v1/auth/google',
    )
  })
})

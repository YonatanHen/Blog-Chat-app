import { afterEach, describe, expect, it, vi } from 'vitest'
import { normalizeListParams, postsApi } from './posts.js'

/** Stubs fetch and returns the mock, so tests can assert the URL that was hit. */
function stubFetch() {
  const fetchMock = vi.fn().mockResolvedValue(new Response('[]', { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const calledPath = (fetchMock: ReturnType<typeof stubFetch>) => fetchMock.mock.calls[0]![0]

describe('postsApi.list', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('hits the bare collection when there are no filters', async () => {
    const fetchMock = stubFetch()
    await postsApi.list()
    expect(calledPath(fetchMock)).toBe('/api/v1/posts')
  })

  it('sends a term as ?q=', async () => {
    const fetchMock = stubFetch()
    await postsApi.list({ q: 'x' })
    expect(calledPath(fetchMock)).toBe('/api/v1/posts?q=x')
  })

  it('sends a tag as ?tag=, and both filters together', async () => {
    const fetchMock = stubFetch()
    await postsApi.list({ q: 'x', tag: 'express' })
    expect(calledPath(fetchMock)).toBe('/api/v1/posts?q=x&tag=express')
  })

  // A cleared box must produce the unfiltered feed, not `?q=` — the server has
  // its own guard, but an empty term is not a search on either side.
  it('omits a whitespace-only term entirely', async () => {
    const fetchMock = stubFetch()
    await postsApi.list({ q: '  ' })
    expect(calledPath(fetchMock)).toBe('/api/v1/posts')
  })

  it('percent-encodes a term rather than pasting it into the URL', async () => {
    const fetchMock = stubFetch()
    await postsApi.list({ q: 'a&b c' })
    expect(calledPath(fetchMock)).toBe('/api/v1/posts?q=a%26b+c')
  })
})

// `usePosts` builds the cache key from this, so two params that produce one URL
// have to produce one object — otherwise the same request is cached twice.
describe('normalizeListParams', () => {
  it('collapses a blank filter to no filter at all', () => {
    expect(normalizeListParams({ q: '' })).toEqual({})
    expect(normalizeListParams({ q: '  ', tag: '' })).toEqual({})
  })

  it('collapses a padded filter onto its trimmed form', () => {
    expect(normalizeListParams({ q: ' mongo ' })).toEqual(normalizeListParams({ q: 'mongo' }))
  })

  it('keeps the filters that carry a value', () => {
    expect(normalizeListParams({ q: 'mongo', tag: 'db' })).toEqual({ q: 'mongo', tag: 'db' })
  })
})

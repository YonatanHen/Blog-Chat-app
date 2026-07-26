import { expect, test } from '@playwright/test'

/**
 * The gating boundary, asserted on raw response bytes rather than the DOM —
 * hiding the body in a component would pass a DOM check while the text sat in
 * the JSON, one DevTools tab away.
 *
 * The fixture is built through the API instead of read from the seed script:
 * `compose.e2e.yaml` starts an empty Mongo and never seeds, and the `runner`
 * image contains only the bundled dist — `src/scripts/seed.ts` and `tsx` are
 * both absent from it, so `npm run seed` cannot run against this stack.
 */
const SENTINEL = 'only a signed-in reader should ever receive this sentence'

test('an anonymous reader never receives a full body over the wire', async ({
  page,
  request,
  playwright,
}) => {
  const username = `gate-${Date.now()}`

  // `request` keeps the session cookie across calls, so this context is the author.
  const signup = await request.post('/api/v1/auth/signup', {
    data: { username, email: `${username}@example.com`, password: 'a-valid-password' },
  })
  expect(signup.ok()).toBe(true)

  const created = await request.post('/api/v1/posts', {
    data: {
      title: `Gating check ${Date.now()}`,
      body: [
        'Paragraph one is public — the teaser always includes it.',
        'Paragraph two is public as well; deriveTeaser keeps the first two.',
        `Paragraph three is past the wall: ${SENTINEL}.`,
      ].join('\n\n'),
      tags: [],
    },
  })
  expect(created.ok()).toBe(true)
  const { slug } = await created.json()

  // The author sees everything — without this the anonymous assertion below
  // could pass simply because the sentence was never stored.
  const asAuthor = await (await request.get(`/api/v1/posts/${slug}`)).json()
  expect(asAuthor.gated).toBe(false)
  expect(asAuthor.body).toContain(SENTINEL)

  // A context with no cookies at all.
  // Built by hand, so it needs the proxy header the config gives every other
  // context — see playwright.config.ts for why it is required at all.
  const anon = await playwright.request.newContext({
    baseURL: 'http://localhost:3000',
    extraHTTPHeaders: { 'X-Forwarded-Proto': 'https' },
  })
  const res = await anon.get(`/api/v1/posts/${slug}`)
  expect(res.ok()).toBe(true)
  const anonBody = await res.json()
  expect(anonBody.gated).toBe(true)
  expect(anonBody.body).not.toContain(SENTINEL)
  // Nothing anywhere in the payload, not just the body field.
  expect(JSON.stringify(anonBody)).not.toContain(SENTINEL)
  await anon.dispose()

  // `page` is a separate browser context and carries no session either.
  await page.goto(`/blog/${slug}`)
  await expect(page.getByText('to read the rest of this post')).toBeVisible()
  await expect(page.getByText(SENTINEL)).toHaveCount(0)
})

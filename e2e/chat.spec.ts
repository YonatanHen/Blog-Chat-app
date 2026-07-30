import { expect, test } from '@playwright/test'

/**
 * Two independent browser contexts, so each has its own cookie jar and its own
 * session — the only way to prove a message actually crosses the server rather
 * than being echoed locally.
 */
test('two signed-in users exchange a message, and a fresh client sees the buffered history', async ({
  browser,
}) => {
  const stamp = Date.now()

  async function signUp(name: string) {
    const context = await browser.newContext({
      baseURL: 'http://localhost:3000',
      extraHTTPHeaders: { 'X-Forwarded-Proto': 'https' },
    })
    const page = await context.newPage()
    await page.goto('/signup')
    await page.getByLabel('Username').fill(name)
    await page.getByLabel('Email').fill(`${name}@example.com`)
    // exact: true — "Confirm password" also contains "Password".
    await page.getByLabel('Password', { exact: true }).fill('a-valid-password')
    await page.getByLabel('Confirm password').fill('a-valid-password')
    await page.getByRole('button', { name: 'Sign Up' }).click()
    await expect(page).toHaveURL('/')
    return page
  }

  const alice = await signUp(`e2e-a-${stamp}`)
  const bob = await signUp(`e2e-b-${stamp}`)

  await alice.goto('/chat')
  await bob.goto('/chat')

  // ChatRoom.tsx disables Send while the draft is empty OR while the socket
  // isn't 'connected'. Filling the draft first removes the first condition,
  // so waiting for Send to become enabled afterwards genuinely asserts "the
  // socket is up" rather than an assertion that would time out regardless of
  // connection state.
  await alice.getByLabel('Message').fill('hello from alice')
  await expect(alice.getByRole('button', { name: 'Send' })).toBeEnabled()

  // Bob never sends anything, but his socket has to be connected before
  // alice's message goes out, or the live broadcast has nothing to reach —
  // there is no replay to a socket that connects after the fact. A throwaway
  // draft proves his connection the same way, then gets cleared so it doesn't
  // linger in the composer.
  await bob.getByLabel('Message').fill('ready-check')
  await expect(bob.getByRole('button', { name: 'Send' })).toBeEnabled()
  await bob.getByLabel('Message').fill('')

  await alice.getByRole('button', { name: 'Send' }).click()

  await expect(bob.getByText('hello from alice')).toBeVisible()
  // Stamped with the sender's session identity, not anything the client sent.
  await expect(bob.getByText(`e2e-a-${stamp}`)).toBeVisible()

  // A third, brand-new context that never had a socket open while alice's
  // message went out. If it can still see the message, that message came from
  // GET /api/v1/chat/messages (the Redis-backed buffer), not a live relay —
  // proving the buffer that use-chat.ts loads on mount actually reaches a
  // fresh client instead of leaving it an empty box.
  const carol = await signUp(`e2e-c-${stamp}`)
  await carol.goto('/chat')
  await expect(carol.getByText('hello from alice')).toBeVisible()
  await expect(carol.getByText(`e2e-a-${stamp}`)).toBeVisible()
})

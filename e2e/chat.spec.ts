import { expect, test } from '@playwright/test'

/**
 * Two independent browser contexts, so each has its own cookie jar and its own
 * session — the only way to prove a message actually crosses the server rather
 * than being echoed locally.
 */
test('two signed-in users exchange a message', async ({ browser }) => {
  const stamp = Date.now()

  async function signUp(name: string) {
    const context = await browser.newContext()
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
  // The Send button enables only once the socket reports connected.
  await expect(alice.getByRole('button', { name: 'Send' })).toBeEnabled()
  await expect(bob.getByRole('button', { name: 'Send' })).toBeEnabled()

  await alice.getByLabel('Message').fill('hello from alice')
  await alice.getByRole('button', { name: 'Send' }).click()

  await expect(bob.getByText('hello from alice')).toBeVisible()
  // Stamped with the sender's session identity, not anything the client sent.
  await expect(bob.getByText(`e2e-a-${stamp}`)).toBeVisible()
})

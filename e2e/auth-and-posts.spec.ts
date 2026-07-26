import { expect, test } from '@playwright/test'

/**
 * The whole authenticated round trip through the real prod image: an account
 * that did not exist, a post it owns, a like on it, and a session that ends.
 *
 * Selectors are the accessible name the app actually renders — "Sign Up",
 * "New Post", "Publish", "Logout" — not the ones the plan guessed at.
 */
test('signup, create a post, like it, then log out', async ({ page }) => {
  const username = `e2e-${Date.now()}`

  await page.goto('/signup')
  await page.getByLabel('Username').fill(username)
  await page.getByLabel('Email').fill(`${username}@example.com`)
  await page.getByLabel('Password').fill('a-valid-password')
  await page.getByRole('button', { name: 'Sign Up' }).click()
  await expect(page).toHaveURL('/')
  await expect(page.getByText(`Welcome, ${username}`)).toBeVisible()

  await page.getByRole('link', { name: 'New Post' }).click()
  // AutoForm labels every field with its raw schema key.
  await page.getByLabel('title').fill('An E2E post')
  await page.getByLabel('body').fill('Written by Playwright.')
  await page.getByRole('button', { name: 'Publish' }).click()
  // Re-runs collide on the slug, so the server suffixes it: -2, -3, ...
  await expect(page).toHaveURL(/\/blog\/an-e2e-post/)

  // The like button's accessible name is just its count — a fresh post is at 0.
  await page.getByRole('button', { name: '0' }).click()
  await expect(page.getByRole('button', { name: '1' })).toBeVisible()

  await page.getByRole('button', { name: 'Logout' }).click()
  await expect(page.getByRole('link', { name: 'Login' })).toBeVisible()
})

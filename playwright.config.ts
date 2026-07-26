import { defineConfig } from '@playwright/test'

/**
 * E2E runs against `infra/compose.e2e.yaml`, which builds the Dockerfile's
 * `runner` target — the same image Render would run. A broken production build
 * fails here rather than after a deploy.
 *
 * `reuseExistingServer` is unconditionally true, NOT `!process.env.CI`: the
 * `e2e-smoke` job brings the stack up itself with `up --build --wait` before
 * calling this, so with `false` Playwright would refuse to start on an
 * already-bound :3000. Reusing is correct in both places for the same reason —
 * whoever brought the stack up, that is the stack under test.
 */
export default defineConfig({
  testDir: './e2e',
  // The suite signs up real users against a shared stack; parallel workers
  // racing the same Mongo make failures hard to read for no time saved.
  workers: 1,
  use: {
    baseURL: 'http://localhost:3000',
    /**
     * The e2e stack runs the real production image, so `NODE_ENV=production`
     * gives it `secure: true` session cookies and `trust proxy`. Over plain
     * http:// Express marks the connection insecure and express-session drops
     * the cookie silently — signup returns 201 with no Set-Cookie and every
     * authenticated step afterwards 401s.
     *
     * This is the header Render's TLS-terminating proxy sets in front of the
     * same image, so sending it reproduces the production topology rather than
     * working around it. Downgrading the container to NODE_ENV=development
     * would "fix" it by testing an artifact prod never runs.
     */
    extraHTTPHeaders: { 'X-Forwarded-Proto': 'https' },
    trace: 'on-first-retry',
  },
  webServer: {
    command:
      'docker compose -f infra/compose.e2e.yaml --project-directory . up --build --wait',
    url: 'http://localhost:3000/api/v1/health',
    reuseExistingServer: true,
    // A cold `runner` build pulls base images and runs npm ci twice.
    timeout: 600_000,
  },
})

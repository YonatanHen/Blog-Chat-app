import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['packages/**/*.test.ts', 'apps/**/*.test.ts', 'apps/**/*.test.tsx'],
    // The demo caps default to 2 posts per author, which every fixture that
    // creates a third post would otherwise trip. Raised here rather than
    // weakened in the code — the caps are env-driven exactly so tests can lift
    // them, and demo-caps.test.ts sets its own low values per case.
    env: {
      DEMO_MAX_USERS: '100000',
      DEMO_MAX_POSTS_PER_USER: '100000',
      DEMO_MAX_COMMENTS_PER_POST: '100000',
    },
    testTimeout: 30_000, // mongodb-memory-server downloads a binary on first run
    environmentMatchGlobs: [['apps/client/**', 'jsdom']],
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
})

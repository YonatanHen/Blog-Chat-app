import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['packages/**/*.test.ts', 'apps/**/*.test.ts', 'apps/**/*.test.tsx'],
    testTimeout: 30_000, // mongodb-memory-server downloads a binary on first run
    environmentMatchGlobs: [['apps/client/**', 'jsdom']],
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
})

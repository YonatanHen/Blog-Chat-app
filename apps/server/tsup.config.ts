import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node22',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  // @blog/zod-shared ships TypeScript source (main: ./src/index.ts), so it must
  // be bundled in. Left external, `node dist/index.js` would try to import raw
  // .ts at runtime and crash.
  noExternal: ['@blog/zod-shared'],
  external: ['mongoose'],
})

import { defineConfig } from 'vitest/config';

/** Avoid loading root postcss.config.mjs (Tailwind native bindings) during unit tests. */
export default defineConfig({
  css: {
    postcss: {
      plugins: [],
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});

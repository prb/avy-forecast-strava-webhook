import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // vitest 4+ no longer skips dist/ by default, which holds compiled copies of the tests
    exclude: ['**/node_modules/**', '**/dist/**'],
  },
});

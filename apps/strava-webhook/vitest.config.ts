import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./lambda/__tests__/setup.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/cdk.out/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['lambda/**/*.ts'],
      exclude: ['lambda/__tests__/**', 'lambda/**/*.test.ts', 'dist/**'],
    },
  },
});

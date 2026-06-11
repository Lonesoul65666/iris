// Vitest config — deliberately SEPARATE from vite.config.ts so the app config
// stays untouched. Pure-function unit tests only: node environment, no jsdom.
// The utils under test use relative imports, so no alias plumbing is needed.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/utils/__tests__/**/*.test.ts'],
  },
});

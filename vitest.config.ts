// Vitest config — deliberately SEPARATE from vite.config.ts so the app config
// stays untouched. Pure-function unit tests only: node environment, no jsdom.
// The utils under test use relative imports, so no alias plumbing is needed.
// Server-side pure functions (e.g. the Teller mapper) live under server/__tests__
// so they typecheck under tsconfig.node.json (which has node types) — importing
// them from src would drag server files into the app project and break tsc -b.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/utils/__tests__/**/*.test.ts', 'server/__tests__/**/*.test.ts'],
  },
});

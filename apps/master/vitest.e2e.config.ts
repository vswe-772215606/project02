import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

// Finance e2e suite: every test file boots the real Express app in-process on
// its own copy of a freshly migrated SQLite database, seeded the way a
// packaged Windows install seeds itself, and drives it over real HTTP.
export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src/renderer'),
    },
  },
  test: {
    environment: 'node',
    include: ['e2e/**/*.test.ts'],
    globalSetup: ['e2e/global-setup.ts'],
    pool: 'forks',
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 180_000,
  },
});

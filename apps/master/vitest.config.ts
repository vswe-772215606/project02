import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src/renderer'),
    },
  },
  test: {
    environment: 'node',
    // src/main is included so the updater's pure modules (the state machine and
    // the Uzbek prompt composition) are covered. Only modules with no electron,
    // electron-updater or Prisma imports are testable this way — everything
    // impure lives in `updater-service.ts`, which has no test file.
    include: ['src/renderer/**/*.test.ts', 'src/main/**/*.test.ts'],
    passWithNoTests: false,
  },
});

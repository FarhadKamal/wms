import 'dotenv/config';
import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    globalSetup: ['./test/global-setup.ts'],
    // The API under test talks to the test database only.
    env: { DATABASE_URL: process.env.TEST_DATABASE_URL ?? '' },
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 180_000,
  },
});

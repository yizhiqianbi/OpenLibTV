import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{js,jsx,ts,tsx}', 'api/**/*.test.ts'],
    setupFiles: ['./src/test/setup.js'],
    clearMocks: true,
    restoreMocks: true,
    maxWorkers: 2,
  },
  esbuild: { jsx: 'automatic' },
});

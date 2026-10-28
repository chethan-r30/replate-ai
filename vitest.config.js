// Keep pure setup checks fast; later phases add integration/browser suites.
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['scripts/**/*.test.js', 'server/**/*.test.js'],
    coverage: { provider: 'v8', include: ['server/src/services/**/*.js'] },
  },
});

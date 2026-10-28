// Keep pure setup checks fast; later phases add integration/browser suites.
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  test: {
    include: [
      'scripts/**/*.test.js',
      'server/**/*.test.js',
      'client/**/*.test.jsx',
      'client/**/*.test.js',
    ],
    coverage: {
      provider: 'v8',
      include: [
        'server/src/services/**/*.js',
        'server/src/ai/**/*.js',
        'client/src/**/*.{js,jsx}',
      ],
      exclude: ['**/*.test.*', 'client/src/main.jsx'],
      reporter: ['text', 'json-summary', 'html'],
      thresholds: {
        'server/src/services/**': {
          lines: 80,
          statements: 80,
          functions: 80,
          branches: 80,
        },
        'client/src/**': {
          lines: 70,
          statements: 70,
          functions: 70,
          branches: 70,
        },
      },
    },
  },
});

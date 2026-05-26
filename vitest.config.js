import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.js'],
  },
  resolve: {
    alias: {
      '@': '/static/js',
    },
  },
});

import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: '/no-overtime-game/',
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/game/**/*.ts', 'src/persistence.ts', 'src/share.ts'],
    },
  },
});

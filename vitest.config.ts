import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['packages/server/tests/**/*.test.ts'],
    testTimeout: 60000,
    hookTimeout: 60000
  }
})
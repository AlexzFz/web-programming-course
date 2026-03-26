import { defineConfig } from 'vitest/config'

// Чекпоинт 0: настройка тестового раннера.
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.unit.test.ts', 'src/**/*.feature.test.ts'],
    setupFiles: ['test/setup/test-db.ts', 'test/setup/test-app.ts'],
    clearMocks: true,
    fileParallelism: false,
  },
})
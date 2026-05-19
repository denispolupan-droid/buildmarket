import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/accounting/**/*.test.ts'],
    setupFiles: ['./tests/accounting/setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Тести залежать від стану БД — виконуємо послідовно
    sequence: { concurrent: false },
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './') },
  },
});

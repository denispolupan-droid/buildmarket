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
    // Тести залежать від СПІЛЬНОГО стану БД — виконуємо послідовно і в межах файлу
    // (sequence.concurrent), і між файлами (fileParallelism). Інакше два файли в
    // паралельних воркерах гонятимуться за той самий тестовий SKU/склад.
    sequence: { concurrent: false },
    fileParallelism: false,
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './') },
  },
});

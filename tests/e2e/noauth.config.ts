import { defineConfig, devices } from '@playwright/test';

// Конфіг для публічних спек без оптового логіну — напр., проти dev на test-БД,
// де E2E_WHOLESALE_* не існує:
//   E2E_BASE_URL=http://localhost:3005 npx playwright test --config tests/e2e/noauth.config.ts tests/e2e/shop-filter-scroll.spec.ts
export default defineConfig({
  testDir: '.',
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    ...devices['Desktop Chrome'],
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
  },
});

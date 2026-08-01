import { defineConfig, devices } from '@playwright/test';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env.local', quiet: true });

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';

export default defineConfig({
  testDir: './tests/e2e',
  // These specs assert on timing (a late RSC payload racing the user's scroll), so they run
  // one at a time — parallel workers sharing one dev server skew exactly what's measured.
  workers: 1,
  fullyParallel: false,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  globalSetup: './tests/e2e/global-setup.ts',
  use: {
    baseURL: BASE_URL,
    // Written by global-setup: the wholesale session every /catalog spec needs.
    storageState: 'tests/e2e/.auth/wholesale.json',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: BASE_URL,
    reuseExistingServer: true,
    // `next dev` compiles a route on first hit, and /catalog is a big one.
    timeout: 240_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});

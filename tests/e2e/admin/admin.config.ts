import { defineConfig, devices } from '@playwright/test';
import { config as loadEnv } from 'dotenv';
import path from 'node:path';

/**
 * E2E адмінки — ТІЛЬКИ проти тестової бази.
 *
 * Сценарії створюють замовлення, відвантажують і проводять продаж через реальні
 * роути, тож проти прода їх запускати не можна. Оточення береться з .env.test
 * (у CI — з секретів TEST_*), а не з .env.local, де живе прод; setup.ts додатково
 * відмовляється стартувати, якщо URL бази — продовий.
 *
 * Dev-сервер піднімається на своєму порту і в своєму каталозі збірки, щоб не
 * конфліктувати з `npm run dev` власника на :3000 і не перетирати його .next.
 */
loadEnv({ path: path.resolve(process.cwd(), '.env.test'), override: true, quiet: true });

const PORT = Number(process.env.E2E_ADMIN_PORT ?? 3100);
const BASE_URL = `http://localhost:${PORT}`;

export const ADMIN_AUTH_FILE = path.join(process.cwd(), 'tests', 'e2e', '.auth', 'admin.json');

export default defineConfig({
  testDir: path.resolve(__dirname),
  workers: 1,
  fullyParallel: false,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [['github'], ['html', { open: 'never', outputFolder: 'playwright-report-admin' }]] : [['list']],
  globalSetup: path.resolve(__dirname, 'setup.ts'),
  use: {
    baseURL: BASE_URL,
    storageState: ADMIN_AUTH_FILE,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'admin', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
  ],
  webServer: {
    command: `npx next dev -p ${PORT}`,
    // Playwright запускає webServer з каталогу конфігу; Next потрібен корінь репо.
    cwd: path.resolve(__dirname, '..', '..', '..'),
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 240_000,
    stdout: 'ignore',
    stderr: 'pipe',
    env: {
      ...process.env,
      NEXT_DIST_DIR: '.next-e2e-admin',
      // Роути створюють new Resend(...) на рівні модуля — без ключа «Collecting
      // page data» падає; листи не відправляються (ключ фіктивний).
      RESEND_API_KEY: process.env.RESEND_API_KEY ?? 're_dummy_e2e',
    },
  },
});

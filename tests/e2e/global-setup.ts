import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

export const AUTH_FILE = path.join(process.cwd(), 'tests', 'e2e', '.auth', 'wholesale.json');

/**
 * Signs in once through the real login form and hands the resulting session to every spec via
 * `storageState`. Going through the form rather than minting a session with the service-role
 * key keeps the login path itself covered, and means no Supabase admin credentials are needed
 * at test time.
 */
export default async function globalSetup() {
  const email    = process.env.E2E_WHOLESALE_EMAIL;
  const password = process.env.E2E_WHOLESALE_PASSWORD;

  if (!email || !password) {
    throw new Error(
      'E2E: не заданий оптовий акаунт. Додай у .env.local:\n' +
      '  E2E_WHOLESALE_EMAIL=...\n' +
      '  E2E_WHOLESALE_PASSWORD=...\n' +
      'Потрібен акаунт із account_type dealer/wholesale/contractor/shop_owner — /catalog під авторизацією.',
    );
  }

  const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
  const browser = await chromium.launch();
  const page = await browser.newPage({ baseURL });

  try {
    await page.goto('/login?next=/catalog', { waitUntil: 'domcontentloaded' });
    await page.locator('#email').fill(email);
    await page.locator('#password').fill(password);
    await page.locator('button[type="submit"].auth-btn').click();

    // The catalog is the gate we actually care about: landing anywhere else means the account
    // exists but isn't wholesale, which would fail every spec later with a confusing selector
    // error instead of this one.
    await page.waitForURL('**/catalog**', { timeout: 30_000 });

    fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true });
    await page.context().storageState({ path: AUTH_FILE });
  } finally {
    await browser.close();
  }
}

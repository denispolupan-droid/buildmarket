import { chromium, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import { ADMIN_AUTH_FILE } from './admin.config';

export const E2E_ADMIN_EMAIL = 'e2e-admin@fixline.test';
const PROD_REF = 'boaztnparrdoeknajprn';

async function waitForHydration(page: Page, selector: string) {
  await page.waitForFunction(
    sel => {
      const el = document.querySelector(sel);
      return !!el && Object.keys(el).some(k => k.startsWith('__react'));
    },
    selector,
    { timeout: 60_000 },
  );
}

/**
 * Гарантує e2e-адміна в ТЕСТОВІЙ базі (service role → auth.admin) і логіниться
 * через справжню форму, щоб шлях логіну теж був під тестом. Пароль — із
 * E2E_ADMIN_PASSWORD (секрет CI / .env.test); при розбіжності з базою — оновлюємо,
 * тож ротація секрету нічого не ламає.
 */
export default async function adminGlobalSetup() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  const password = process.env.E2E_ADMIN_PASSWORD ?? '';

  if (!url || !serviceKey) throw new Error('E2E admin: немає NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (.env.test або секрети TEST_*)');
  if (url.includes(PROD_REF)) throw new Error('E2E admin: відмова — це ПРОДОВА база. Сценарії створюють і проводять замовлення; запускати лише проти тестової.');
  if (!password) throw new Error('E2E admin: задай E2E_ADMIN_PASSWORD (.env.test локально, секрет у CI)');

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  // auth.admin.listUsers пагінований; e2e-користувачів мало, однієї сторінки вистачає
  const { data: list, error: listErr } = await admin.auth.admin.listUsers({ perPage: 200 });
  if (listErr) throw new Error('E2E admin: listUsers: ' + listErr.message);
  const existing = list.users.find(u => u.email === E2E_ADMIN_EMAIL);

  if (existing) {
    const { error } = await admin.auth.admin.updateUserById(existing.id, {
      password, email_confirm: true, app_metadata: { ...(existing.app_metadata ?? {}), role: 'admin' },
    });
    if (error) throw new Error('E2E admin: updateUser: ' + error.message);
  } else {
    const { error } = await admin.auth.admin.createUser({
      email: E2E_ADMIN_EMAIL, password, email_confirm: true, app_metadata: { role: 'admin' },
    });
    if (error) throw new Error('E2E admin: createUser: ' + error.message);
  }

  const port = Number(process.env.E2E_ADMIN_PORT ?? 3100);
  const baseURL = `http://localhost:${port}`;
  const browser = await chromium.launch();
  const page = await browser.newPage({ baseURL });
  try {
    await page.goto('/login?next=/admin', { waitUntil: 'domcontentloaded' });
    await waitForHydration(page, '#email');
    await page.locator('#email').fill(E2E_ADMIN_EMAIL);
    await page.locator('#password').fill(password);
    await page.locator('button[type="submit"].auth-btn').click();
    try {
      await page.waitForURL(u => u.pathname.startsWith('/admin'), { timeout: 90_000 });
    } catch (e) {
      const shown = await page.locator('.auth-error-box').textContent().catch(() => null);
      if (shown) throw new Error(`E2E admin: логін відхилено — «${shown.trim()}»`);
      throw e;
    }
    const state = await page.context().storageState();
    if (!state.cookies.some(c => c.name.startsWith('sb-'))) throw new Error('E2E admin: сесійні cookie не збереглися');
    fs.mkdirSync(path.dirname(ADMIN_AUTH_FILE), { recursive: true });
    fs.writeFileSync(ADMIN_AUTH_FILE, JSON.stringify(state, null, 2));
  } finally {
    await browser.close();
  }
}

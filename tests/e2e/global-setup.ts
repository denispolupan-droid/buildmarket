import { chromium, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

export const AUTH_FILE = path.join(process.cwd(), 'tests', 'e2e', '.auth', 'wholesale.json');

/**
 * The login inputs are React-controlled and `onSubmit` only exists once the page has hydrated.
 * Typing before that looks fine — the DOM keeps the value — but React then wipes its state and
 * the click does a plain form GET instead of signing in. Waiting for React to attach its props
 * to the field is the cheapest honest signal that hydration is done.
 */
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
    await waitForHydration(page, '#email');
    await page.locator('#email').fill(email);
    await page.locator('#password').fill(password);
    await page.locator('button[type="submit"].auth-btn').click();

    // Match on the *pathname*, not a glob: `/login?next=/catalog` also contains "/catalog",
    // so a glob would resolve before the form is even submitted and we'd persist an
    // anonymous session. The catalog is the gate we actually care about — landing anywhere
    // else means the account exists but isn't wholesale.
    try {
      await page.waitForURL(url => url.pathname.replace(/^\/ru/, '') === '/catalog', { timeout: 60_000 });
    } catch (e) {
      const shown = await page.locator('.auth-error-box').textContent().catch(() => null);
      if (shown) throw new Error(`E2E: логін відхилено — «${shown.trim()}». Перевір E2E_WHOLESALE_* у .env.local.`);
      throw e;
    }

    // Supabase writes its session cookies during the redirect; without them every spec would
    // silently run against the login page instead of the catalog.
    const state = await page.context().storageState();
    const hasSession = state.cookies.some(c => c.name.startsWith('sb-'));
    if (!hasSession) {
      throw new Error('E2E: логін пройшов, але сесійні cookie не збереглися — перевір E2E_WHOLESALE_* у .env.local.');
    }

    fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true });
    fs.writeFileSync(AUTH_FILE, JSON.stringify(state, null, 2));
  } finally {
    await browser.close();
  }
}

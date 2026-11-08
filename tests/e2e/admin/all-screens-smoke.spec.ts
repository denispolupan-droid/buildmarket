import { test, expect, type Response } from '@playwright/test';

/**
 * Дим по екранах адмінки після переходу на спільний шар даних: сторінка відкривається без
 * помилок JS, а її API-запити на читання не падають 5xx (502 — чесна відповідь «зовнішній
 * API площадки недоступний», на тестовій базі без ключів Rozetka це норма).
 */
const SCREENS = [
  '/admin', '/admin/finance/periods', '/admin/finance/returns', '/admin/finance/adjustments',
  '/admin/procurement', '/admin/procurement/inventory', '/admin/partners', '/admin/prices', '/admin/suppliers',
  '/admin/seo', '/admin/seo/ai', '/admin/seo/demand', '/admin/seo/log', '/admin/seo/pages', '/admin/seo/snippets',
  '/admin/blog', '/admin/reviews', '/admin/rozetka/commissions', '/admin/rozetka/moderation', '/admin/pricing-model',
  '/admin/showcase', '/admin/settings', '/admin/chat', '/admin/mail', '/admin/dispatch',
];

for (const url of SCREENS) {
  test(`екран ${url}`, async ({ page }) => {
    const errors: string[] = [];
    const bad: string[] = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('response', (r: Response) => {
      if (r.url().includes('/api/admin/') && r.request().method() === 'GET' && r.status() >= 500 && r.status() !== 502) bad.push(`${r.status()} ${r.url()}`);
    });
    const res = await page.goto(url, { waitUntil: 'load' });
    expect(res?.status()).toBeLessThan(400);
    await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
    expect(errors).toEqual([]);
    expect(bad).toEqual([]);
  });
}

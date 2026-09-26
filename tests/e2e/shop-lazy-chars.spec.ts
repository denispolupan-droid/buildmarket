import { test, expect } from '@playwright/test';

// Сторінка категорії везе характеристики лише своєї гілки (lib/shop-chars);
// клік по іншій категорії в сайдбарі — без навігації (pushState) — має
// довантажити її характеристики з /api/category-chars і показати фасети.
// Кліки — лише через JS: Playwright click сам підскролює до елемента.
test('перемикання категорії без перезавантаження довантажує фасети', async ({ page }) => {
  await page.goto('/shop/germetyky');
  await page.locator('.shop-grid').first().waitFor();
  await page.evaluate(() => { (window as unknown as { __alive: number }).__alive = 1; });

  const waitChars = page.waitForResponse(r => r.url().includes('/api/category-chars/laky') && r.ok());
  const clicked = await page.evaluate(() => {
    const a = document.querySelector('a[href="/shop/laky"]') as HTMLAnchorElement | null;
    if (!a) return false;
    a.click();
    return true;
  });
  expect(clicked).toBe(true);
  const res = await waitChars;
  const rows = await res.json() as { sku: string; characteristics: unknown[] }[];
  expect(rows.length).toBeGreaterThan(5);

  await expect(page).toHaveURL(/\/shop\/laky$/);
  // без повного перезавантаження: маркер у window живий
  expect(await page.evaluate(() => (window as unknown as { __alive?: number }).__alive)).toBe(1);

  // фасет із характеристик лаків («Основа») з'явився після довантаження
  await expect(page.locator('.shop-filter-group', { hasText: 'Основа' }).first()).toBeVisible();

  // повернення в стартову гілку (листова підкатегорія: клік по батьку з дітьми
  // лише розгортає гілку) — фасети на місці, без нового запиту
  let extraReq = 0;
  page.on('request', r => { if (r.url().includes('/api/category-chars/')) extraReq++; });
  await page.evaluate(() => (document.querySelector('a[href="/shop/akrylovi-germetyky"]') as HTMLAnchorElement).click());
  await expect(page).toHaveURL(/\/shop\/akrylovi-germetyky$/);
  await expect(page.locator('.shop-filter-group', { hasText: 'Бренд' }).first()).toBeVisible();
  await page.waitForTimeout(500);
  expect(extraReq).toBe(0);
});

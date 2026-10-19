import { test, expect, type Page } from '@playwright/test';

// Сторінка категорії везе лише товари своєї гілки (lib/shop-products); клік по
// категорії з іншої гілки — без навігації (pushState) — має довантажити її
// товари з /api/shop-products і показати їх разом із фасетами. Кліки — лише
// через JS: Playwright click сам підскролює до елемента.

const cardHrefs = (page: Page) => page.evaluate(() =>
  [...document.querySelectorAll('.shop-grid .shop-card__clickable')].map(a => a.getAttribute('href')));

const jsClick = (page: Page, selector: string) => page.evaluate(sel => {
  const el = document.querySelector(sel) as HTMLElement | null;
  if (!el) return false;
  el.click();
  return true;
}, selector);

test('сторінка категорії несе лише свою гілку, решта — довантаженням', async ({ page }) => {
  let shopReq = 0;
  page.on('request', r => { if (r.url().includes('/api/shop-products/')) shopReq++; });

  await page.goto('/shop/germetyky');
  await page.locator('.shop-grid .shop-card').first().waitFor();
  await page.evaluate(() => { (window as unknown as { __alive: number }).__alive = 1; });
  // у даних сторінки ~гілка «Герметики», а не всі 770+ товарів каталогу
  const shipped = await page.evaluate(() => (document.documentElement.innerHTML.match(/\\"price_retail\\":/g) ?? []).length);
  expect(shipped).toBeGreaterThan(10);
  expect(shipped).toBeLessThan(400);
  expect(shopReq).toBe(0);

  // інша гілка — запит, товари й фасет «Основа» лаків
  const waitLaky = page.waitForResponse(r => r.url().includes('/api/shop-products/laky') && r.ok());
  expect(await jsClick(page, 'a[href="/shop/laky"]')).toBe(true);
  const rows = await (await waitLaky).json() as { sku: string; category_slug: string }[];
  expect(rows.length).toBeGreaterThan(5);
  await expect(page).toHaveURL(/\/shop\/laky$/);
  await expect(page.locator('.shop-grid .shop-card').first()).toBeVisible();
  await expect(page.locator('.shop-filter-group', { hasText: 'Основа' }).first()).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __alive?: number }).__alive)).toBe(1);

  // повернення в стартову гілку (листова підкатегорія) — без нового запиту
  const before = shopReq;
  expect(await jsClick(page, 'a[href="/shop/akrylovi-germetyky"]')).toBe(true);
  await expect(page).toHaveURL(/\/shop\/akrylovi-germetyky$/);
  await expect(page.locator('.shop-grid .shop-card').first()).toBeVisible();
  await page.waitForTimeout(500);
  expect(shopReq).toBe(before);

  // «Назад» — знову лаки, з уже завантажених даних
  await page.goBack();
  await expect(page).toHaveURL(/\/shop\/laky$/);
  await expect(page.locator('.shop-filter-group', { hasText: 'Основа' }).first()).toBeVisible();
  expect(shopReq).toBe(before);
});

test('«Назад» з товару на довантажену категорію показує її товари', async ({ page }) => {
  await page.goto('/shop/germetyky');
  await page.locator('.shop-grid .shop-card').first().waitFor();
  expect(await jsClick(page, 'a[href="/shop/laky"]')).toBe(true);
  await expect(page).toHaveURL(/\/shop\/laky$/);
  await expect(page.locator('.shop-grid .shop-card').first()).toBeVisible();
  const lakyCards = await cardHrefs(page);

  expect(await jsClick(page, '.shop-grid .shop-card__clickable')).toBe(true);
  await expect(page).toHaveURL(/\/product\//);
  await page.goBack();
  await expect(page).toHaveURL(/\/shop\/laky$/);
  await expect(page.locator('.shop-grid .shop-card').first()).toBeVisible();
  expect(await cardHrefs(page)).toEqual(lakyCards);
});

test('збій довантаження — звичайний перехід сторінкою, а не порожній листинг', async ({ page }) => {
  await page.route('**/api/shop-products/**', r => r.abort());
  await page.goto('/shop/germetyky');
  await page.locator('.shop-grid .shop-card').first().waitFor();
  const nav = page.waitForEvent('load');
  expect(await jsClick(page, 'a[href="/shop/laky"]')).toBe(true);
  await nav;
  await expect(page).toHaveURL(/\/shop\/laky$/);
  await expect(page.locator('.shop-grid .shop-card').first()).toBeVisible();
  await expect(page.locator('.shop-title')).toContainText('Лак');
});

test('«Всі категорії» з категорії — той самий порядок, що й на /shop', async ({ page }) => {
  await page.goto('/shop');
  await page.locator('.shop-grid .shop-card').first().waitFor();
  const reference = await cardHrefs(page);
  const refCount = await page.locator('.shop-count').first().textContent();

  await page.goto('/shop/germetyky');
  await page.locator('.shop-grid .shop-card').first().waitFor();
  const waitAll = page.waitForResponse(r => r.url().includes('/api/shop-products/all') && r.ok());
  expect(await jsClick(page, '.shop-cats-list > button.shop-cat-item')).toBe(true);
  await waitAll;
  await expect(page).toHaveURL(/\/shop$/);
  await expect(page.locator('.shop-count').first()).toHaveText(refCount ?? '');
  expect(await cardHrefs(page)).toEqual(reference);
});

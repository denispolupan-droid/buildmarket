import { test, expect } from '@playwright/test';

/**
 * Структуровані дані товару. Перевіряємо не наявність тега, а вміст: Google
 * читає Product.description для товарної картки, і туди має йти повний опис, а
 * не короткий тизер на 150 символів (він лишається в meta description).
 *
 * Заодно сторожимо валідність JSON: опис — вільний текст із лапками й тире,
 * і будь-яка помилка екранування ламає ВСІ структуровані дані сторінки мовчки.
 */
test('JSON-LD товару: валідний і з повним описом', async ({ page }) => {
  await page.goto('/product/1005-025');

  const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
  expect(blocks.length).toBeGreaterThan(0);

  // Кожен блок має бути валідним JSON — інакше Google ігнорує розмітку цілком
  const parsed = blocks.map(b => JSON.parse(b) as Record<string, unknown>);
  const product = parsed.find(p => p['@type'] === 'Product');
  expect(product, 'на сторінці товару має бути Product').toBeTruthy();

  const desc = String(product!.description ?? '');
  expect(desc.length).toBeGreaterThan(600);

  // meta description лишається коротким — це різні поля з різним призначенням
  const meta = await page.locator('meta[name="description"]').getAttribute('content');
  expect((meta ?? '').length).toBeLessThan(400);
});

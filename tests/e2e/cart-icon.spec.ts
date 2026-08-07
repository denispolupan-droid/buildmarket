import { test, expect } from '@playwright/test';

/**
 * Кнопка «в кошик» має нести іконку кошика, а не плюс. Плюс лишається тільки на
 * кроці кількості (+/− біля числа) — і саме тому перевірка дивиться всередину
 * САМЕ кнопки кошика, а не «чи є плюс на сторінці».
 *
 * Окремо мобільна ширина: там підпис ховається CSS і кнопка стає суто іконковою,
 * тож помилка в іконці видна лише на телефоні.
 */

const CART_BTN = '.shop-card__btn, .shop-card__cart-btn, button:has(.shop-card__btn-label)';

async function firstCartButton(page: import('@playwright/test').Page) {
  await page.goto('/shop');
  const btn = page.locator(CART_BTN).first();
  await btn.waitFor({ state: 'visible', timeout: 30_000 });
  return btn;
}

test('десктоп: у кнопці кошика — іконка кошика, не плюс', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const btn = await firstCartButton(page);
  const svg = btn.locator('svg').first();
  await expect(svg).toBeVisible();

  // lucide лишає назву іконки в класі: lucide-shopping-cart / lucide-plus
  const cls = (await svg.getAttribute('class')) ?? '';
  expect(cls).toContain('shopping-cart');
  expect(cls).not.toContain('lucide-plus');
});

test('мобільна ширина: кнопка іконкова, і це кошик', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const btn = await firstCartButton(page);
  const svg = btn.locator('svg').first();
  await expect(svg).toBeVisible();

  const cls = (await svg.getAttribute('class')) ?? '';
  expect(cls).toContain('shopping-cart');

  // Іконка не має схлопнутись у нуль на вузькій кнопці
  const box = await svg.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThan(8);
  expect(box?.height ?? 0).toBeGreaterThan(8);
});

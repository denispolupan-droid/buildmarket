import { test, expect } from '@playwright/test';

/**
 * Панель над списком на телефоні: вигляд, категорії, фільтри й «акція» мають
 * стояти ОДНИМ рядом. Раніше «🔥 Акція» з підписом не влазила й падала на власний
 * рядок, з'їдаючи екран перед товарами.
 *
 * Перевіряємо не ширини й не класи, а факт: у всіх кнопок групи однаковий top.
 */
test('мобільна панель магазину — контроли в один ряд', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto('/shop');
  await page.locator('.shop-topbar-actions').first().waitFor({ state: 'visible', timeout: 30_000 });

  // Порівнюємо ЦЕНТРИ, а не верхні краї: контроли можуть мати різну висоту й
  // вирівнюватись по центру — це нормально, а ось різні ряди — ні.
  const centers = await page.evaluate(() => {
    const bar = document.querySelector('.shop-topbar-actions')!;
    const btns = [...bar.querySelectorAll('.shop-view-toggle, .shop-mobile-filter-btn, .shop-sale-btn')];
    return btns.map(b => { const r = b.getBoundingClientRect(); return Math.round(r.top + r.height / 2); });
  });

  expect(centers.length).toBeGreaterThanOrEqual(4);     // вигляд + категорії + фільтри + акція
  expect(Math.max(...centers) - Math.min(...centers)).toBeLessThanOrEqual(2);
});

test('на телефоні в кнопці акції лишається лише іконка', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto('/shop');
  const btn = page.locator('.shop-sale-btn');
  await btn.waitFor({ state: 'visible', timeout: 30_000 });

  await expect(btn.locator('.shop-sale-btn__label')).toBeHidden();
  // Підпис лишається в DOM — для тултипа й екранного читача
  await expect(btn).toHaveAttribute('title', /Тільки акційні|Только акционные/);
});

test('на десктопі підпис «Акція» видно', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/shop');
  const label = page.locator('.shop-sale-btn__label');
  await label.waitFor({ state: 'visible', timeout: 30_000 });
  await expect(label).toBeVisible();
});

import { test, expect } from '@playwright/test';

// Зміна фільтра з глибокої прокрутки: список коротшає, і раніше браузер
// «прижимав» вʼюпорт до підвалу. Тепер сторінка має плавно піднятись до початку,
// а підвал — лишитись за межами екрана (lib/useLiftOnFilterChange).
// Кліки — лише через JS: Playwright click/hover сам підскролює до елемента.
test('вибір фільтра з підвалу піднімає сторінку до товарів, а не в футер', async ({ page }) => {
  await page.goto('/shop/vodoemiulsiyni-interierni');
  await page.locator('.shop-grid').first().waitFor();
  const before = await page.locator('.shop-grid .product-card, .shop-grid > *').count();
  expect(before).toBeGreaterThan(2);

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(300);
  const deep = await page.evaluate(() => window.scrollY);
  expect(deep).toBeGreaterThan(600);

  // Найрідше значення у групі «Основа» — список стане коротким
  const clicked = await page.evaluate(() => {
    const items = [...document.querySelectorAll('.shop-filter-check-item')] as HTMLElement[];
    const target = items.find(el => /Латексна|Силіконова/.test(el.textContent ?? ''));
    if (!target) return false;
    (target.querySelector('input') as HTMLInputElement).click();
    return true;
  });
  expect(clicked).toBe(true);

  await page.waitForTimeout(900); // підйом ≈ 550 мс + відпускання висоти
  const { scrollY, footerTop, innerHeight, after } = await page.evaluate(() => {
    const footer = document.querySelector('footer');
    return {
      scrollY: window.scrollY,
      footerTop: footer ? footer.getBoundingClientRect().top : Infinity,
      innerHeight: window.innerHeight,
      after: document.querySelectorAll('.shop-grid > *').length,
    };
  });
  expect(after).toBeLessThan(before);
  expect(scrollY).toBeLessThan(40);            // піднялись до початку
  expect(footerTop).toBeGreaterThan(innerHeight); // підвал не у вʼюпорті
});

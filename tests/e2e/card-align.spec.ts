import { test, expect } from '@playwright/test';

/**
 * Картка з акційною ціною має рядок закресленої старої ціни, якого немає в
 * звичайній. Поки цей рядок рендерився лише за наявності акції, акційна картка
 * була вища на рядок — і в парі з сусідньою по ній зʼїжджали ціна та кнопки
 * (виміряно: футер на 13px нижче за сусідній).
 *
 * Перевіряємо не наявність класу, а ФАКТИЧНУ геометрію: у межах одного ряду
 * низ картки й кнопки мають стояти на одній лінії незалежно від акції. Саме це
 * бачить покупець, і саме це ламається при будь-якій майбутній правці розмітки.
 */

type Row = { top: number; footer: number; promo: boolean };

async function cardRows(page: import('@playwright/test').Page, selector: string, footerSel: string): Promise<Row[]> {
  return page.evaluate(([sel, fSel]) => {
    return [...document.querySelectorAll(sel)].slice(0, 12).map(c => {
      const f = c.querySelector(fSel);
      const old = c.querySelector('[class*="price-old"]');
      return {
        top: Math.round(c.getBoundingClientRect().top),
        footer: f ? Math.round(f.getBoundingClientRect().top) : -1,
        // справжня акція — рядок є і він НЕ порожній
        promo: !!old && !old.className.includes('is-empty'),
      };
    });
  }, [selector, footerSel] as const);
}

/** Групуємо по рядах сітки (однаковий top) і звіряємо низ карток усередині ряду. */
function expectAligned(rows: Row[]) {
  const byTop = new Map<number, Row[]>();
  for (const r of rows) {
    if (r.footer < 0) continue;
    byTop.set(r.top, [...(byTop.get(r.top) ?? []), r]);
  }
  let checked = 0;
  for (const [, group] of byTop) {
    if (group.length < 2) continue;
    const footers = group.map(g => g.footer);
    expect(Math.max(...footers) - Math.min(...footers)).toBeLessThanOrEqual(1);
    checked++;
  }
  expect(checked).toBeGreaterThan(0);
}

for (const width of [390, 1280]) {
  test(`магазин: кнопки в ряду на одній лінії, ширина ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/shop');
    await page.locator('.shop-card').first().waitFor({ state: 'visible', timeout: 30_000 });
    await page.waitForTimeout(800);

    const rows = await cardRows(page, '.shop-card', '.shop-card__footer');
    // Перевірка має сенс лише коли на сторінці є і акційні, і звичайні картки
    expect(rows.some(r => r.promo)).toBe(true);
    expectAligned(rows);
  });
}

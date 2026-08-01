import { test, expect, type Page } from '@playwright/test';

declare global {
  interface Window { __minScrollY?: number; __scrollRec?: ReturnType<typeof setInterval> }
}

/**
 * Records the lowest window.scrollY reached over `ms`. Sampling inside the page rather than
 * polling from the test catches a jump even if something scrolled back down afterwards.
 */
async function lowestScrollOver(page: Page, ms: number): Promise<number> {
  await page.evaluate(() => {
    window.__minScrollY = window.scrollY;
    window.__scrollRec = setInterval(() => {
      window.__minScrollY = Math.min(window.__minScrollY ?? window.scrollY, window.scrollY);
    }, 50);
  });
  await page.waitForTimeout(ms);
  return page.evaluate(() => {
    clearInterval(window.__scrollRec);
    return window.__minScrollY ?? window.scrollY;
  });
}

/** Expands the first sidebar category that has children and selects its first child. */
async function openFirstSubcategory(page: Page) {
  const parent = page.locator('aside .cat-item').filter({ has: page.locator('svg').nth(1) }).first();
  await parent.click();
  const child = page.locator('aside .cat-item').filter({ hasText: /\S/ }).nth(1);
  await expect(child).toBeVisible();
  await child.click();
}

/** Scrolls down as far as the current page usefully allows; returns where it landed. */
async function scrollDown(page: Page): Promise<number> {
  const maxScroll = await page.evaluate(
    () => document.documentElement.scrollHeight - window.innerHeight,
  );
  test.skip(maxScroll < 200, 'category listing too short to scroll — nothing to observe');
  const target = Math.min(600, Math.floor(maxScroll * 0.8));
  await page.evaluate(y => window.scrollTo(0, y), target);
  return target;
}

test.describe('opt catalog — scroll position', () => {
  // /catalog is fully dynamic (auth + searchParams), so the Client Cache never serves it and
  // every router.replace('?category=…') refetches the RSC payload. That payload lands about a
  // second later with a fresh `products` array; an effect keyed on the derived `filtered` list
  // used to read that as "the user changed a filter" and yanked the page back to the top —
  // right in the middle of scrolling. These specs pin the position down for both entry paths.

  test('page stays put after switching to a subcategory', async ({ page }) => {
    await page.goto('/catalog');
    await openFirstSubcategory(page);

    // The click itself resets to the top on purpose; wait that out before measuring.
    await page.waitForTimeout(300);
    const target = await scrollDown(page);

    const lowest = await lowestScrollOver(page, 3000);
    expect(lowest).toBeGreaterThan(target * 0.5);
  });

  test('page stays put after switching via a top-level pill', async ({ page }) => {
    await page.goto('/catalog');
    await page.locator('.catalog-cat-pill').nth(1).click();

    await page.waitForTimeout(300);
    const target = await scrollDown(page);

    const lowest = await lowestScrollOver(page, 3000);
    expect(lowest).toBeGreaterThan(target * 0.5);
  });

  test('switching category still resets to the top immediately', async ({ page }) => {
    // The deliberate half of the behaviour — a new listing should start at its first row.
    await page.goto('/catalog');
    await page.evaluate(() => window.scrollTo(0, 600));
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(300);

    await openFirstSubcategory(page);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(50);
  });
});

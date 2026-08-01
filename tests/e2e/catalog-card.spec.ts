import { test, expect } from '@playwright/test';

test.describe('opt catalog — product card', () => {
  test.beforeEach(async ({ page }) => {
    // Card grid is opt-in and remembered in localStorage; the table view has no cards at all.
    await page.addInitScript(() => localStorage.setItem('catalog-view', 'grid'));
  });

  test('hovering a card reveals the rest of a clamped name without resizing the card', async ({ page }) => {
    await page.goto('/catalog');

    const cards = page.locator('.catalog-card');
    await expect(cards.first()).toBeVisible();

    // Only a name that's actually truncated proves anything, so find one.
    const count = await cards.count();
    let card = null;
    for (let i = 0; i < Math.min(count, 30); i++) {
      const name = cards.nth(i).locator('.catalog-card__name');
      const truncated = await name.evaluate(el => el.scrollHeight > el.clientHeight + 2);
      if (truncated) { card = cards.nth(i); break; }
    }
    test.skip(card === null, 'no card with a truncated name in the first 30 — nothing to reveal');

    const name = card!.locator('.catalog-card__name');
    const cardHeightBefore = (await card!.boundingBox())!.height;
    const nameHeightBefore = (await name.boundingBox())!.height;

    await card!.hover();

    await expect.poll(async () => (await name.boundingBox())!.height)
      .toBeGreaterThan(nameHeightBefore);

    // Fully revealed…
    expect(await name.evaluate(el => el.scrollHeight <= el.clientHeight + 2)).toBe(true);
    // …and the card (and therefore its whole grid row) didn't grow to make room.
    expect((await card!.boundingBox())!.height).toBeCloseTo(cardHeightBefore, 0);
  });

  test('name collapses back to two lines when the pointer leaves', async ({ page }) => {
    await page.goto('/catalog');

    const card = page.locator('.catalog-card').first();
    await expect(card).toBeVisible();
    const name = card.locator('.catalog-card__name');

    const collapsed = (await name.boundingBox())!.height;
    await card.hover();
    await page.mouse.move(0, 0);

    await expect.poll(async () => (await name.boundingBox())!.height).toBe(collapsed);
  });
});

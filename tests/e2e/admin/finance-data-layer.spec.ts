import { test, expect } from '@playwright/test';

/**
 * Екрани Фінансів на спільному шарі даних (lib/admin/api, етап 2 плану адмінки):
 * дані приходять і показуються, кнопка «Оновити» перечитує список, а не ламає кеш
 * подією кліку (пастка mutate як onClick), помилка API доходить до екрана.
 */
const pageErrors = (page: import('@playwright/test').Page) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(String(e)));
  return errors;
};
const isGet = (r: import('@playwright/test').Response, part: string) => r.url().includes(part) && r.request().method() === 'GET';

test('Закриття періодів: список місяців', async ({ page }) => {
  const errors = pageErrors(page);
  const res = page.waitForResponse(r => isGet(r, '/api/admin/finance/periods'));
  await page.goto('/admin/finance/periods');
  expect((await res).status()).toBe(200);
  await expect(page.getByText('Завантаження…')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('Повернення: «Оновити» перечитує, помилка API видима', async ({ page }) => {
  const errors = pageErrors(page);
  const first = page.waitForResponse(r => isGet(r, '/api/admin/finance/returns?'));
  await page.goto('/admin/finance/returns');
  expect((await first).status()).toBe(200);

  await page.route('**/api/admin/finance/returns?*', route => route.fulfill({ status: 500, json: { error: 'Тестовий збій', rid: 'e2e' } }));
  await page.getByRole('button', { name: 'Оновити' }).click();
  await expect(page.getByText('Тестовий збій')).toBeVisible();
  await page.unroute('**/api/admin/finance/returns?*');

  const again = page.waitForResponse(r => isGet(r, '/api/admin/finance/returns?'));
  await page.getByRole('button', { name: 'Оновити' }).click();
  expect((await again).status()).toBe(200);
  await expect(page.getByText('Тестовий збій')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('Коригування боргу: «Оновити» перечитує журнал', async ({ page }) => {
  const errors = pageErrors(page);
  const first = page.waitForResponse(r => isGet(r, '/api/admin/finance/debt-adjustments?limit'));
  await page.goto('/admin/finance/adjustments');
  expect((await first).status()).toBe(200);
  const again = page.waitForResponse(r => isGet(r, '/api/admin/finance/debt-adjustments?limit'));
  await page.getByRole('button', { name: 'Оновити' }).click();
  expect((await again).status()).toBe(200);
  await expect(page.getByText('Завантаження')).toHaveCount(0);
  expect(errors).toEqual([]);
});

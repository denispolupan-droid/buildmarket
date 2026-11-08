import { test, expect, type Page, type Response } from '@playwright/test';

/** Закупівля, Контрагенти, Ціни на спільному шарі даних (lib/admin/api, етап 2 плану адмінки). */
const pageErrors = (page: Page) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(String(e)));
  return errors;
};
const get = (page: Page, part: string): Promise<Response> =>
  page.waitForResponse(r => r.url().includes(part) && r.request().method() === 'GET');

test('Закупівля: список вантажить відправників', async ({ page }) => {
  const errors = pageErrors(page);
  const res = get(page, '/api/admin/procurement/senders');
  await page.goto('/admin/procurement');
  // Типовий фільтр на тестовій базі може дати порожньо, і тоді список не змонтований
  const reset = page.getByRole('button', { name: /Скинути|Очистити/ });
  if (await reset.count()) await reset.first().click();
  expect((await res).status()).toBe(200);
  expect(errors).toEqual([]);
});

test('Інвентаризація: склад за замовчуванням обрано, ручний вибір не злітає', async ({ page }) => {
  const errors = pageErrors(page);
  const res = get(page, '/api/admin/accounting/inventory');
  await page.goto('/admin/procurement/inventory');
  expect((await res).status()).toBe(200);
  const select = page.locator('select').first();
  await expect(select).not.toHaveValue('');
  const options = await select.locator('option').evaluateAll(o => o.map(x => (x as HTMLOptionElement).value).filter(Boolean));
  const other = options[options.length - 1];
  await select.selectOption(other);
  await expect(select).toHaveValue(other);
  expect(errors).toEqual([]);
});

test('Контрагент: картка вантажить договори й історію саме цього контрагента', async ({ page }) => {
  const errors = pageErrors(page);
  await page.goto('/admin/partners');
  const list = await page.evaluate(async () => (await fetch('/api/admin/customers/search?limit=1')).json()) as { id: string }[];
  expect(list.length).toBeGreaterThan(0);
  const id = list[0].id;
  const contracts = get(page, `/api/admin/contracts?customer_id=${id}`);
  const history = get(page, `/api/admin/partners/${id}/history`);
  await page.goto(`/admin/partners?open=${id}`);
  await page.getByRole('button', { name: 'Картка' }).first().click();
  expect((await contracts).status()).toBe(200);
  expect((await history).status()).toBe(200);
  expect(errors).toEqual([]);
});

test('Ціни: журнал переоцінок і акції МП', async ({ page }) => {
  const errors = pageErrors(page);
  await page.goto('/admin/prices');
  const log = get(page, '/api/admin/prices/log');
  await page.getByRole('button', { name: 'Журнал переоцінок' }).click();
  expect((await log).status()).toBe(200);
  await expect(page.getByText('Завантаження...')).toHaveCount(0);
  const adj = get(page, '/api/admin/prices/adjustments');
  await page.getByRole('button', { name: 'Акції МП' }).click();
  expect((await adj).status()).toBe(200);
  await expect(page.getByText('Завантаження...')).toHaveCount(0);
  expect(errors).toEqual([]);
});

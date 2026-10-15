import { test, expect, type APIRequestContext } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * П'ять ключових дій адмінки через СПРАВЖНІ роути під справжньою сесією адміна:
 * підтвердити → відвантажити → доставити; відредагувати позиції; скасувати.
 * Плюс запобіжник: «Відправлено» руками без РН має відмовити.
 *
 * Навіщо на рівні API, а не кліків: ці роути — і є бізнес-логіка (документи,
 * проводки, статуси), а кліки по 6300-рядковій адмінці ламаються від кожного
 * перейменування кнопки. Розпил адмінки (етап 2) і RBAC перевірятимуться
 * саме цим набором: якщо після рефакторингу хоч один крок дає інший результат —
 * CI червоний. Кліки для екранів додамо окремо, коли адмінку буде розрізано.
 *
 * Дані: тестова база (setup.ts відмовляється від прода). Після себе прибираємо:
 * замовлення видаляються, облік — reset_accounting_test_data (як у інтеграційних).
 */

let db: SupabaseClient;
let sku: string;
let supplierId: number;
const created: string[] = [];
const MAP_SKU = 'E2E-' + Date.now();

type OrderRow = { id: string; order_number: number; status: string; total_price: number; shipped_at: string | null; delivered_at: string | null; cancelled_at: string | null; confirmed_at: string | null; status_history: { status: string; via?: string }[] | null };

async function seedOrder(extra: Record<string, unknown> = {}): Promise<OrderRow> {
  const { data, error } = await db.from('orders').insert({
    contact: 'E2E адмінка', phone: '+380000000002', email: 'e2e@fixline.test',
    status: 'new', total_price: 200, channel_code: 'website', delivery_type: 'nova', payment_type: 'cod',
    items: [{ sku, name: 'E2E товар', brand: 'E2E', qty: 1, price: 200 }],
    ...extra,
  }).select('id, order_number, status, total_price, shipped_at, delivered_at, cancelled_at, confirmed_at, status_history').single();
  if (error) throw new Error('seed order: ' + error.message);
  created.push(data.id);
  return data as OrderRow;
}

async function readOrder(id: string): Promise<OrderRow> {
  const { data, error } = await db.from('orders')
    .select('id, order_number, status, total_price, shipped_at, delivered_at, cancelled_at, confirmed_at, status_history')
    .eq('id', id).single();
  if (error) throw new Error('read order: ' + error.message);
  return data as OrderRow;
}

async function json(res: Awaited<ReturnType<APIRequestContext['post']>>) {
  const body = await res.json().catch(() => ({}));
  return { status: res.status(), body };
}

test.beforeAll(async () => {
  db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const [{ data: prod }, { data: sup }] = await Promise.all([
    db.from('product_stock').select('sku').gt('price_retail', 0).gt('price_cost', 0).order('sku').limit(1),
    db.from('suppliers').select('id').order('id').limit(1),
  ]);
  sku = prod![0].sku as string;
  supplierId = sup![0].id as number;
  // SKU → постачальник: без мапи дропшип-борг при відгрузці не нарахується
  await db.from('supplier_sku_map').insert({ our_sku: sku, supplier_id: supplierId, supplier_sku: MAP_SKU });
});

test.afterAll(async () => {
  if (!db) return;
  // reset_accounting_test_data відмовляє, якщо є документи без meta.test=true, і
  // TRUNCATE-ить леджер (append-only тригери інакше не дають видалити). Тому:
  // позначити наші РН → скинути облік → видалити замовлення (FK на order_id
  // не дасть видалити їх раніше, поки на них є документи й проводки).
  if (created.length) {
    const { data: docs } = await db.from('acc_documents').select('id, meta').in('order_id', created);
    for (const d of docs ?? []) {
      await db.from('acc_documents').update({ meta: { ...((d.meta as object) ?? {}), test: true } }).eq('id', d.id);
    }
  }
  const { data: reset, error } = await db.rpc('reset_accounting_test_data');
  if (error || String(reset).startsWith('REFUSED')) console.error('cleanup reset:', error?.message ?? reset);
  if (created.length) {
    const { error: delErr } = await db.from('orders').delete().in('id', created);
    if (delErr) console.error('cleanup orders:', delErr.message);
  }
  await db.from('supplier_sku_map').delete().eq('supplier_sku', MAP_SKU);
});

test('підтвердити → відвантажити → доставити: статуси, мітки, РН і виручка', async ({ request }) => {
  const order = await seedOrder();

  // 1. Підтвердити (виконання постачальником)
  const confirm = await json(await request.post(`/api/admin/orders/${order.id}/confirm`, { data: { fulfillment_mode: 'supplier' } }));
  expect(confirm.status, JSON.stringify(confirm.body)).toBe(200);
  let o = await readOrder(order.id);
  expect(o.status).toBe('confirmed');
  expect(o.confirmed_at).toBeTruthy();
  expect(o.status_history?.at(-1)).toMatchObject({ status: 'confirmed', via: 'confirm' });

  // 2. Відвантажити з номером посилки → чернетка РН
  const ttn = '99' + String(Date.now()).slice(-12);
  const ship = await json(await request.post(`/api/admin/orders/${order.id}/ship`, { data: { ttn } }));
  expect(ship.status, JSON.stringify(ship.body)).toBe(200);
  expect(ship.body.fully_shipped).toBe(true);
  o = await readOrder(order.id);
  expect(o.status).toBe('shipped');
  expect(o.shipped_at).toBeTruthy();
  const { data: draft } = await db.from('acc_documents').select('id, status, tracking_number').eq('order_id', order.id).eq('doc_type', 'sale').single();
  expect(draft).toMatchObject({ status: 'draft', tracking_number: ttn });

  // 3. Доставлено (ручне «Виконано») → РН проведена, виручка в леджері
  const delivered = await json(await request.patch(`/api/admin/orders/${order.id}`, { data: { status: 'delivered' } }));
  expect(delivered.status, JSON.stringify(delivered.body)).toBe(200);
  o = await readOrder(order.id);
  expect(o.status).toBe('delivered');
  expect(o.delivered_at).toBeTruthy();
  expect(o.status_history?.at(-1)).toMatchObject({ status: 'delivered', via: 'order-card' });
  const { data: doc } = await db.from('acc_documents').select('status').eq('id', draft!.id).single();
  expect(doc?.status).toBe('confirmed');
  const { data: revenue } = await db.from('money_entries').select('amount').eq('doc_id', draft!.id).eq('account_type', 'revenue');
  expect(revenue?.length, 'виручка має бути проведена').toBeGreaterThan(0);
});

test('редагування позицій: сума рахується на сервері, клієнтський total ігнорується', async ({ request }) => {
  const order = await seedOrder();
  const res = await json(await request.patch(`/api/admin/orders/${order.id}`, {
    data: { items: [{ sku, name: 'E2E товар', brand: 'E2E', qty: 2, price: 150 }], total_price: 1 },
  }));
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  const o = await readOrder(order.id);
  expect(Number(o.total_price)).toBe(300);
});

test('«Відправлено» руками без РН — відмова; скасування нового — ок', async ({ request }) => {
  const order = await seedOrder();
  const shipped = await json(await request.patch(`/api/admin/orders/${order.id}`, { data: { status: 'shipped' } }));
  expect(shipped.status).toBe(409);
  expect(String(shipped.body.error)).toContain('видаткової');
  expect((await readOrder(order.id)).status).toBe('new');

  const cancelled = await json(await request.patch(`/api/admin/orders/${order.id}`, { data: { status: 'cancelled' } }));
  expect(cancelled.status, JSON.stringify(cancelled.body)).toBe(200);
  const o = await readOrder(order.id);
  expect(o.status).toBe('cancelled');
  expect(o.cancelled_at).toBeTruthy();
});

test('журнал замовлень відкривається під сесією адміна без 500', async ({ page }) => {
  const res = await page.goto('/admin', { waitUntil: 'domcontentloaded' });
  expect(res?.status(), 'сторінка журналу має віддати 200').toBe(200);
  await expect(page).toHaveURL(/\/admin/);
  // Серверна помилка рендера показує app/error.tsx — її тут бути не має
  await expect(page.locator('body')).not.toContainText(/Щось пішло не так|Something went wrong/i);
});

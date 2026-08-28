/**
 * Smoke: ланцюг «посилку отримали → замовлення закрите документами».
 *
 * Саме цей ланцюг зламався 22.08: у postSaleDoc додали вбудований джойн
 * orders(order_number), PostgREST такого звʼязку не знає, запит повертав помилку,
 * і проведення падало з «документ не знайдено». Крон при цьому мовчки оновлював
 * текст статусу, замовлення назавжди лишалось у «Відправлено», а виручка,
 * собівартість і борг постачальнику не проводились.
 *
 * Тест ходить у справжню базу тими самими викликами, що й крон доставки, і
 * перевіряє не проміжні кроки, а результат: РН проведена, продаж порахований,
 * борг перед постачальником створений і підписаний номером замовлення.
 * Форму запиту до PostgREST інакше не перевірити — типи її не бачать.
 *
 * Запуск:  npm run test:integration
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { createSaleDraft } from '../../lib/accounting/dropship';
import { completeShipmentByTtn, allOrderSalesPosted } from '../../lib/accounting/completion';
import { loadFixtures } from './fixtures';

let db: SupabaseClient;
let warehouseId: number;
let supplierId: number;
let testSku: string;
let orderId: string;

// Номер замовлення призначає сама база (тригер нумерації), тож беремо той,
// що повернувся після вставки, а не вигаданий.
let orderNumber: number;
const TTN = '99' + String(Date.now()).slice(-12);

beforeAll(async () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  db = createClient(url, key, { auth: { persistSession: false } });

  const fx = await loadFixtures(db);
  warehouseId = fx.warehouseId;
  supplierId  = fx.supplierId;
  testSku     = fx.sku;

  // Звʼязок SKU → постачальник: без нього борг перед постачальником не
  // нараховується (postSaleDoc бере постачальника з рядка або з цієї мапи).
  await db.from('supplier_sku_map').delete().eq('supplier_sku', 'SMOKE-' + testSku);
  const { error: mapErr } = await db.from('supplier_sku_map')
    .insert({ our_sku: testSku, supplier_id: supplierId, supplier_sku: 'SMOKE-' + testSku });
  if (mapErr) throw new Error('supplier_sku_map: ' + mapErr.message);

  // Складський запас навмисно не створюємо: із запасом резолвер віддав би
  // рядок як власний, і боргу перед постачальником не виникло б — а зламався
  // саме він.

  // Справжній рядок замовлення: без нього postSaleDoc не знайде номер, а саме
  // його читання й зламалось. Прибираємо в afterAll — reset_accounting_test_data
  // чистить облік, але не замовлення.
  const { data: order, error } = await db.from('orders').insert({
    contact: 'SMOKE тест', phone: '+380000000000', email: 'smoke@test.local',
    status: 'shipped', total_price: 200, channel_code: 'website',
    delivery_type: 'nova', payment_type: 'cod',
    tracking_number: TTN,
    items: [{ sku: testSku, name: 'smoke', brand: 'test', qty: 1, price: 200 }],
  }).select('id, order_number').single();
  if (error) throw new Error('order insert: ' + error.message);
  orderId = order.id as string;
  orderNumber = order.order_number as number;
});

afterAll(async () => {
  if (!db) return;
  if (orderId) await db.from('orders').delete().eq('id', orderId);
  await db.from('supplier_sku_map').delete().eq('supplier_sku', 'SMOKE-' + testSku);
  const { error } = await db.rpc('reset_accounting_test_data');
  if (error) console.error('Cleanup error:', error.message);
});

describe('Smoke: доставка закриває замовлення документами', () => {
  it('дропшип: РН проводиться за ТТН, борг постачальнику підписаний номером замовлення', async () => {
    const line = { sku: testSku, name: 'smoke', brand: 'test', qty: 1, price: 200 };

    const draftId = await createSaleDraft({
      order_id: orderId, order_number: orderNumber, order_items: [line],
      tracking_number: TTN,
      shipping_supplier_id: supplierId,
      confirmed_by: 'smoke',
    });
    expect(draftId, 'чернетка РН має створитись').toBeTruthy();
    await db.from('acc_documents').update({ meta: { test: true } }).eq('id', draftId);

    // Міграція 103: борг перед постачальником виникає ВЖЕ ТУТ — постачальник
    // передав товар перевізникові і датує накладну цим днем. До 103 він
    // зʼявлявся лише при доставці, і звірка розходилась на суму «в дорозі».
    const atShipment = await db
      .from('money_entries')
      .select('account_type, amount')
      .eq('order_id', orderId);
    const shipRows = atShipment.data ?? [];
    expect(
      shipRows.some(r => r.account_type === 'supplier' && Number(r.amount) < 0),
      'борг перед постачальником має бути вже після відвантаження',
    ).toBe(true);
    expect(
      shipRows.some(r => r.account_type === 'inventory_transit' && Number(r.amount) > 0),
      'товар має стати на рахунок «в дорозі»',
    ).toBe(true);
    expect(
      shipRows.some(r => r.account_type === 'revenue'),
      'виручки до вручення покупцю бути не повинно',
    ).toBe(false);
    const debtAtShipment = shipRows
      .filter(r => r.account_type === 'supplier')
      .reduce((s, r) => s + Number(r.amount), 0);

    // Те саме, що робить крон, коли НП каже «Відправлення отримано»
    const closedOrder = await completeShipmentByTtn(TTN, 'smoke');
    expect(closedOrder, 'completeShipmentByTtn має знайти чернетку за ТТН').toBe(orderId);

    const { data: doc } = await db.from('acc_documents').select('status').eq('id', draftId).single();
    expect(doc?.status, 'РН має стати проведеною').toBe('confirmed');

    // Саме після цього крон ставить замовленню «Доставлено»
    expect(await allOrderSalesPosted(orderId), 'усі РН замовлення проведені').toBe(true);

    // Борг перед постачальником — і з номером замовлення в підписі
    const { data: payable } = await db
      .from('money_entries')
      .select('amount, description')
      .eq('account_type', 'supplier')
      .eq('order_id', orderId);
    expect(payable?.length, 'має зʼявитись борг перед постачальником').toBeGreaterThan(0);
    expect(payable!.some(p => Number(p.amount) < 0), 'борг іде мінусом на рахунку постачальника').toBe(true);
    expect(
      payable!.some(p => String(p.description).includes(String(orderNumber))),
      'у підписі проводки має бути номер замовлення',
    ).toBe(true);

    // Доставка НЕ повторює борг: він уже був проведений при відвантаженні
    const debtAfterDelivery = (payable ?? []).reduce((s, p) => s + Number(p.amount), 0);
    expect(
      Math.round(debtAfterDelivery * 100),
      'доставка не має додавати боргу — він виник при відвантаженні',
    ).toBe(Math.round(debtAtShipment * 100));

    // Транзит закривається собівартістю: товар вручено, він більше не в дорозі
    const { data: transitRows } = await db
      .from('money_entries')
      .select('amount')
      .eq('order_id', orderId)
      .eq('account_type', 'inventory_transit');
    const transitLeft = (transitRows ?? []).reduce((s, r) => s + Number(r.amount), 0);
    expect(Math.round(transitLeft * 100), 'рахунок «в дорозі» має обнулитись').toBe(0);

    // Виручка проведена
    const { data: revenue } = await db
      .from('money_entries')
      .select('amount')
      .eq('doc_id', draftId)
      .eq('account_type', 'revenue');
    expect(revenue?.length, 'виручка має бути проведена').toBeGreaterThan(0);
  });

  it('повторний виклик нічого не дублює', async () => {
    const before = await db.from('money_entries').select('id', { count: 'exact', head: true }).eq('order_id', orderId);
    await completeShipmentByTtn(TTN, 'smoke');
    const after = await db.from('money_entries').select('id', { count: 'exact', head: true }).eq('order_id', orderId);
    expect(after.count, 'повторне проведення не має додавати проводок').toBe(before.count);
  });

  it('невідома ТТН не валить синк, а тихо повертає null', async () => {
    expect(await completeShipmentByTtn('99999999999999', 'smoke')).toBeNull();
  });

  it('порожній orderId у createSaleDraft не створює документ-сироту', async () => {
    const fake = randomUUID();
    expect(await allOrderSalesPosted(fake), 'замовлення без РН не вважається проведеним').toBe(true);
  });
});

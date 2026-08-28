/**
 * Integration test — Варіант 3: продаж проводиться при ДОСТАВЦІ, а не відгрузці.
 *
 * Перевіряє нову машинерію (Етап 2):
 *   createSaleDraft      — при відгрузці: РН-чернетка, резерв тримається. Проводок
 *                          немає для ВЛАСНОГО складу (саме такі тут сценарії);
 *                          для дропшипу з міграції 103 тут одразу зʼявляється борг
 *                          перед постачальником — це перевіряє delivery-smoke;
 *   applyCompletionEffects — при доставці: РН проводиться (виручка + FIFO/COGS),
 *                            резерв знімається; повторний виклик ідемпотентний.
 *
 * Запуск:  npm run test:integration
 * Вимоги:  .env.local з NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
 * Дані — meta.test=true, прибираються reset_accounting_test_data() у afterAll.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { createDocument, confirmDocument } from '../../lib/accounting/documents';
import { createReservation, hasActiveReservation } from '../../lib/accounting/reservations';
import { createSaleDraft } from '../../lib/accounting/dropship';
import { loadFixtures } from './fixtures';
import { applyCompletionEffects, completeShipmentByTtn, allOrderSalesPosted } from '../../lib/accounting/completion';

let db: SupabaseClient;
let warehouseId: number;
let supplierId: number;
let testSku: string;

async function assertInvariants() {
  const { data, error } = await db.rpc('check_invariants');
  expect(error, `check_invariants RPC error: ${error?.message}`).toBeNull();
  const failures = (data ?? []).filter((r: { status: string }) => r.status === 'FAIL');
  expect(
    failures,
    `Invariant violations:\n${failures.map((f: { invariant: string; details: string }) => `  ${f.invariant}: ${f.details}`).join('\n')}`,
  ).toHaveLength(0);
}

async function moneyEntries(docId: string) {
  const { data } = await db.from('money_entries').select('account_type, amount').eq('doc_id', docId);
  return data ?? [];
}

/** Доступний залишок = всього мінус резерв: саме він вирішує, чи можна продати ще раз. */
async function available(sku: string, warehouseId: number): Promise<number> {
  const { data } = await db
    .from('stock_balance')
    .select('qty_available')
    .eq('sku', sku)
    .eq('warehouse_id', warehouseId)
    .maybeSingle();
  return Number(data?.qty_available ?? 0);
}

beforeAll(async () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  db = createClient(url, key, { auth: { persistSession: false } });

  const fx = await loadFixtures(db);
  warehouseId = fx.warehouseId;
  supplierId  = fx.supplierId;
  testSku     = fx.sku;

  // Гарантуємо запас на складі (FIFO-партія) для списання при проведенні продажу.
  const receipt = await createDocument({
    doc_type: 'receipt', warehouse_id: warehouseId, supplier_id: supplierId,
    notes: '[TEST] stock for completion test', meta: { test: true },
    lines: [{ sku: testSku, qty: 10, price: 100, cost_price: 60 }],
  });
  await confirmDocument(receipt.id, 'test');
});

afterAll(async () => {
  if (!db) return;
  const { error } = await db.rpc('reset_accounting_test_data');
  if (error) console.error('Cleanup error:', error.message);
});

describe('Варіант 3 — продаж при доставці', () => {
  it('createSaleDraft: РН-чернетка, БЕЗ проводок, резерв тримається; applyCompletionEffects: проводить + знімає резерв; ідемпотентно', async () => {
    const orderId = randomUUID();
    const items = [{ sku: testSku, name: 'test', brand: 'test', qty: 2, price: 100 }];

    // Резерв (як після підтвердження замовлення)
    const resv = await createReservation({ order_id: orderId, warehouse_id: warehouseId, items: [{ sku: testSku, qty: 2 }] });
    expect(resv.success).toBe(true);
    expect(await hasActiveReservation(orderId)).toBe(true);

    // Відгрузка → чернетка РН, жодних проводок, резерв ще активний
    const docId = await createSaleDraft({
      order_id: orderId, order_number: 999999, order_items: items,
      channel_code: 'website', confirmed_by: 'test', tracking_number: '59TESTTRACK001',
    });
    const { data: draft } = await db.from('acc_documents').select('status, tracking_number, meta').eq('id', docId).single();
    // позначаємо тестовим, щоб прибралось
    await db.from('acc_documents').update({ meta: { ...(draft?.meta ?? {}), test: true } }).eq('id', docId);
    expect(draft?.status).toBe('draft');
    expect(draft?.tracking_number).toBe('59TESTTRACK001');
    expect(await moneyEntries(docId)).toHaveLength(0);          // ← власний склад: нічого не проведено
    expect(await hasActiveReservation(orderId)).toBe(true);     // ← резерв тримається

    // Доставка → проводимо РН: виручка + склад, резерв знімається
    await applyCompletionEffects(docId, 'test');
    const { data: posted } = await db.from('acc_documents').select('status').eq('id', docId).single();
    expect(posted?.status).toBe('confirmed');
    const entries = await moneyEntries(docId);
    expect(entries.some(e => e.account_type === 'revenue')).toBe(true);
    expect(entries.some(e => e.account_type === 'customer' || e.account_type === 'cash' || e.account_type === 'bank')).toBe(true);
    expect(await hasActiveReservation(orderId)).toBe(false);    // ← резерв знято

    // Ідемпотентність: повторний виклик нічого не додає
    const before = (await moneyEntries(docId)).length;
    await applyCompletionEffects(docId, 'test');
    expect((await moneyEntries(docId)).length).toBe(before);

    await assertInvariants();
  }, 30000);

  it('відгрузка БЕЗ попереднього резерву все одно тримає власний товар — він уже в дорозі', async () => {
    // Живий випадок 28.08: менеджер підтвердив замовлення як «постачальник», а
    // роутер при відгрузці взяв товар зі свого складу. Резерву не було, РН — ще
    // чернетка, тож списання не відбулось: залишок показував «доступно» на
    // коробку, яка вже їхала до покупця, і той самий товар можна було продати вдруге.
    const orderId = randomUUID();
    const items = [{ sku: testSku, name: 'test', brand: 'test', qty: 1, price: 100 }];

    // Тестова база не має правил маршрутизації взагалі, тож роутер завжди
    // відповідає «дропшип» — і гілка «свій склад» тут ніколи не перевірялась.
    // Ставимо те саме правило, що в проді (основний склад, пріоритет 1), і
    // прибираємо його за собою, щоб не змінити поведінку сусідніх тестів.
    const { data: rule } = await db.from('fulfillment_rules')
      .insert({ name: '[TEST] основний склад', warehouse_id: warehouseId, priority: 1, is_active: true })
      .select('id').single();

    try {
      const availBefore = await available(testSku, warehouseId);
      expect(await hasActiveReservation(orderId)).toBe(false);   // резерву свідомо немає

      const docId = await createSaleDraft({
        order_id: orderId, order_number: 999990, order_items: items,
        channel_code: 'website', confirmed_by: 'test', tracking_number: '59TESTNORESV1',
      });
      await db.from('acc_documents').update({ meta: { test: true } }).eq('id', docId);

      const { data: line } = await db.from('acc_document_lines')
        .select('fulfillment_type').eq('document_id', docId).maybeSingle();
      expect(line?.fulfillment_type, 'товар мав піти зі свого складу').toBe('own');

      expect(await hasActiveReservation(orderId), 'відвантажений власний товар має бути зарезервований').toBe(true);
      expect(await available(testSku, warehouseId), 'доступний залишок має зменшитись на відвантажене')
        .toBe(availBefore - 1);

      // Доставка списує товар і знімає резерв — подвійного утримання немає
      await applyCompletionEffects(docId, 'test');
      expect(await hasActiveReservation(orderId)).toBe(false);
      expect(await available(testSku, warehouseId)).toBe(availBefore - 1);

      await assertInvariants();
    } finally {
      if (rule?.id) await db.from('fulfillment_rules').delete().eq('id', rule.id);
    }
  }, 30000);

  it('часткова відгрузка: 2 посилки = 2 чернетки, проводяться окремо за своєю ТТН', async () => {
    const orderId = randomUUID();
    const line = { sku: testSku, name: 'test', brand: 'test', price: 100 };

    const resv = await createReservation({ order_id: orderId, warehouse_id: warehouseId, items: [{ sku: testSku, qty: 4 }] });
    expect(resv.success).toBe(true);

    // Посилка 1 — 2 шт, ТТН A
    const doc1 = await createSaleDraft({
      order_id: orderId, order_number: 999998, order_items: [{ ...line, qty: 2 }],
      channel_code: 'website', confirmed_by: 'test', tracking_number: '59TESTA0001',
    });
    await db.from('acc_documents').update({ meta: { test: true } }).eq('id', doc1);
    // Посилка 2 — 2 шт, ТТН B
    const doc2 = await createSaleDraft({
      order_id: orderId, order_number: 999998, order_items: [{ ...line, qty: 2 }],
      channel_code: 'website', confirmed_by: 'test', tracking_number: '59TESTB0002',
    });
    await db.from('acc_documents').update({ meta: { test: true } }).eq('id', doc2);

    // Доставили посилку 1 → проведена лише вона, замовлення ще не повністю
    const oid1 = await completeShipmentByTtn('59TESTA0001', 'test');
    expect(oid1).toBe(orderId);
    expect(await allOrderSalesPosted(orderId)).toBe(false);
    const { data: d1 } = await db.from('acc_documents').select('status').eq('id', doc1).single();
    const { data: d2 } = await db.from('acc_documents').select('status').eq('id', doc2).single();
    expect(d1?.status).toBe('confirmed');
    expect(d2?.status).toBe('draft');

    // Доставили посилку 2 → все проведено
    await completeShipmentByTtn('59TESTB0002', 'test');
    expect(await allOrderSalesPosted(orderId)).toBe(true);

    await assertInvariants();
  }, 30000);

  // Дзеркальний випадок до попереднього: не одне замовлення в двох посилках, а
  // ДВА замовлення в одній. Живий кейс #26081005 + #26081006 — спільна ТТН
  // 20451502111156; через maybeSingle() по ній не проводилось нічого, і обидва
  // замовлення лишились доставленими з чернеткою РН (інваріант I7).
  it('одна посилка на два замовлення: проводяться обидві чернетки', async () => {
    const orderA = randomUUID();
    const orderB = randomUUID();
    const line = { sku: testSku, name: 'test', brand: 'test', price: 100 };
    const TTN = '59TESTMERGED01';

    expect((await createReservation({ order_id: orderA, warehouse_id: warehouseId, items: [{ sku: testSku, qty: 1 }] })).success).toBe(true);
    expect((await createReservation({ order_id: orderB, warehouse_id: warehouseId, items: [{ sku: testSku, qty: 1 }] })).success).toBe(true);

    const docA = await createSaleDraft({
      order_id: orderA, order_number: 999996, order_items: [{ ...line, qty: 1 }],
      channel_code: 'website', confirmed_by: 'test', tracking_number: TTN,
    });
    const docB = await createSaleDraft({
      order_id: orderB, order_number: 999995, order_items: [{ ...line, qty: 1 }],
      channel_code: 'website', confirmed_by: 'test', tracking_number: TTN,
    });
    await db.from('acc_documents').update({ meta: { test: true } }).in('id', [docA, docB]);

    await completeShipmentByTtn(TTN, 'test');

    const { data: a } = await db.from('acc_documents').select('status').eq('id', docA).single();
    const { data: b } = await db.from('acc_documents').select('status').eq('id', docB).single();
    expect(a?.status).toBe('confirmed');
    expect(b?.status).toBe('confirmed');
    expect(await allOrderSalesPosted(orderA)).toBe(true);
    expect(await allOrderSalesPosted(orderB)).toBe(true);

    await assertInvariants();
  }, 30000);
});

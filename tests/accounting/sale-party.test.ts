/**
 * Integration test — Варіант B: дебітор продажу визначається каналом грошей.
 *
 * Розбір 2026-09-05: продаж лягав на клієнта, а збір наложки — на np:cod, і
 * 194 клієнти «заборгували» 152 тис. Тут перевіряємо, що продаж і погашення
 * лягають на ОДНУ сторону:
 *   • наложка через НП з карткою клієнта → np:cod, при доставці np:cod = 0;
 *   • наложка через Rozetka Доставка     → mp:rozetka, НоваПей нічого не збирає;
 *   • оплата по замовленню йде за продажем (mp:prom, а не клієнт).
 *
 * Запуск:  npm run test:integration (тестова БД з .env.test).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createDocument, confirmDocument } from '../../lib/accounting/documents';
import { createSaleDraft } from '../../lib/accounting/dropship';
import { completeShipmentByTtn } from '../../lib/accounting/completion';
import { applyOrderPayment } from '../../lib/accounting/order-payment';
import { loadFixtures } from './fixtures';

let db: SupabaseClient;
let warehouseId: number;
let supplierId: number;
let testSku: string;
let customerId: string | null;
const orderIds: string[] = [];

async function assertInvariants() {
  const { data, error } = await db.rpc('check_invariants');
  expect(error, `check_invariants RPC error: ${error?.message}`).toBeNull();
  const failures = (data ?? []).filter((r: { status: string }) => r.status === 'FAIL');
  expect(failures, failures.map((f: { invariant: string; details: string }) => `${f.invariant}: ${f.details}`).join('\n')).toHaveLength(0);
}

async function customerEntries(orderId: string) {
  const { data } = await db
    .from('money_entries')
    .select('account_type, counterparty_id, amount, doc_type')
    .eq('order_id', orderId)
    .order('created_at');
  return data ?? [];
}

/** Усі документи замовлення → meta.test=true, інакше reset відмовить. */
async function markOrderDocsAsTest(orderId: string) {
  const { data: docs } = await db.from('acc_documents').select('id, meta').eq('order_id', orderId);
  for (const d of docs ?? []) {
    await db.from('acc_documents').update({ meta: { ...(d.meta ?? {}), test: true } }).eq('id', d.id);
  }
}

async function makeOrder(fields: Record<string, unknown>, ttn: string) {
  const { data, error } = await db.from('orders').insert({
    contact: 'SALE-PARTY тест', phone: '+380000000001', email: 'sale-party@test.local',
    status: 'shipped', total_price: 300, tracking_number: ttn,
    items: [{ sku: testSku, name: 'test', brand: 'test', qty: 1, price: 300 }],
    ...fields,
  }).select('id, order_number').single();
  if (error) throw new Error('order insert: ' + error.message);
  orderIds.push(data.id as string);
  return { id: data.id as string, number: data.order_number as number };
}

async function shipAndDeliver(order: { id: string; number: number }, ttn: string) {
  const docId = await createSaleDraft({
    order_id: order.id, order_number: order.number,
    order_items: [{ sku: testSku, name: 'test', brand: 'test', qty: 1, price: 300 }],
    channel_code: 'website', confirmed_by: 'test', tracking_number: ttn,
  });
  const { data: draft } = await db.from('acc_documents').select('meta').eq('id', docId).single();
  await db.from('acc_documents').update({ meta: { ...(draft?.meta ?? {}), test: true } }).eq('id', docId);
  const closed = await completeShipmentByTtn(ttn, 'test');
  expect(closed).toBe(order.id);
  return docId;
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
  customerId  = fx.customerId;

  const receipt = await createDocument({
    doc_type: 'receipt', warehouse_id: warehouseId, supplier_id: supplierId,
    notes: '[TEST] stock for sale-party test', meta: { test: true },
    lines: [{ sku: testSku, qty: 10, price: 100, cost_price: 60 }],
  });
  await confirmDocument(receipt.id, 'test');
});

afterAll(async () => {
  if (!db) return;
  for (const id of orderIds) await markOrderDocsAsTest(id);
  if (orderIds.length) await db.from('orders').delete().in('id', orderIds);
  const { data, error } = await db.rpc('reset_accounting_test_data');
  // reset повертає 'REFUSED: …' текстом, а не помилкою — інакше відмова непомітна
  if (error || String(data).startsWith('REFUSED')) console.error('Cleanup error:', error?.message ?? data);
});

describe('Варіант B — дебітор продажу за каналом грошей', () => {
  it('наложка через НП з карткою клієнта: продаж на np:cod, борг лишається до РЕАЛЬНОЇ виплати з виписки NovaPay', async () => {
    const ttn = '59SALEPARTY001';
    const order = await makeOrder({ channel_code: 'phone', delivery_type: 'nova', payment_type: 'cod', customer_id: customerId }, ttn);
    await shipAndDeliver(order, ttn);

    const entries = await customerEntries(order.id);
    const sale = entries.find(e => e.account_type === 'customer' && e.doc_type === 'sale');
    expect(sale?.counterparty_id).toBe('np:cod');
    if (customerId) expect(entries.some(e => e.counterparty_id === customerId)).toBe(false);

    // Жодного фіктивного «COD зібрано НоваПей» при врученні: np:cod = брутто наложки,
    // novapay не чіпається — закриє виписка (np-payout) і утримання (np-deduction)
    expect(entries.some(e => e.account_type === 'novapay')).toBe(false);
    const npCodNet = entries.filter(e => e.account_type === 'customer' && e.counterparty_id === 'np:cod')
      .reduce((s, e) => s + Number(e.amount), 0);
    expect(npCodNet).toBe(300);

    await assertInvariants();
  }, 30000);

  it('наложка через Rozetka Доставка: продаж на mp:rozetka, НоваПей нічого не збирає', async () => {
    const ttn = '59SALEPARTY002';
    const order = await makeOrder({ channel_code: 'rozetka', delivery_type: 'rozetka_delivery', payment_type: 'cod', customer_id: customerId }, ttn);
    await shipAndDeliver(order, ttn);

    const entries = await customerEntries(order.id);
    const sale = entries.find(e => e.account_type === 'customer' && e.doc_type === 'sale');
    expect(sale?.counterparty_id).toBe('mp:rozetka');
    expect(entries.some(e => e.account_type === 'novapay')).toBe(false);
    // Борг лишається на mp:rozetka до пакетної виплати площадки
    const mpNet = entries.filter(e => e.account_type === 'customer' && e.counterparty_id === 'mp:rozetka')
      .reduce((s, e) => s + Number(e.amount), 0);
    expect(mpNet).toBe(300);
  }, 30000);

  it('оплата йде за продажем: Пром-оплата → продаж і оплата на mp:prom, а не на клієнта', async () => {
    const ttn = '59SALEPARTY003';
    const order = await makeOrder({ channel_code: 'prom', delivery_type: 'nova_poshta', payment_type: 'prepaid', customer_id: customerId }, ttn);
    await shipAndDeliver(order, ttn);

    const res = await applyOrderPayment(db, { orderId: order.id, amount: 300, paymentMode: 'transfer', createdBy: 'test' });
    expect(res.ok).toBe(true);
    // ПКО-ваучер створюється без мітки test — без неї reset_accounting_test_data
    // ВІДМОВЛЯЄ (повертає текст, не помилку) і сміття лишається на наступні прогони.
    await markOrderDocsAsTest(order.id);

    const entries = await customerEntries(order.id);
    const sale = entries.find(e => e.account_type === 'customer' && e.doc_type === 'sale');
    const pay  = entries.find(e => e.account_type === 'customer' && e.doc_type === 'customer_payment');
    expect(sale?.counterparty_id).toBe('mp:prom');
    expect(pay?.counterparty_id).toBe('mp:prom');
    const net = entries.filter(e => e.account_type === 'customer' && e.counterparty_id === 'mp:prom')
      .reduce((s, e) => s + Number(e.amount), 0);
    expect(net).toBe(0);

    await assertInvariants();
  }, 30000);
});

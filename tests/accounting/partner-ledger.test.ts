/**
 * Integration test — дропшип-партнер у леджері (рахунок partner, 09.2026).
 *
 * Сценарій кабінету: поповнення карткою → замовлення з наложкою (списання закупки з
 * балансу) → відвантаження → вручення. Перевіряємо, що:
 *   • продаж іде на партнера (не «гість») і за ЗАКУПКОЮ (не за ціною його клієнта);
 *   • борг продажу закривається балансом партнера (customer[P] = 0);
 *   • наложка лягає np:cod (НоваПей винна нам) / partner (ми винні партнеру) з
 *     утриманою комісією;
 *   • рахунок partner у леджері = баланс кабінету (після вручення);
 *   • скасування проведеного продажу сторнує залік.
 *
 * Запуск:  npm run test:integration (тестова БД з .env.test).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createDocument, confirmDocument } from '../../lib/accounting/documents';
import { createSaleDraft, reverseDropshipLedgerExtras } from '../../lib/accounting/dropship';
import { completeShipmentByTtn } from '../../lib/accounting/completion';
import { recordPartnerCardTopup } from '../../lib/accounting/partner-ledger';
import { loadFixtures } from './fixtures';

let db: SupabaseClient;
let testSku: string;
let partnerId: string;
const orderIds: string[] = [];

const COST = 382;
const SELL = 450;

async function assertInvariants() {
  const { data, error } = await db.rpc('check_invariants');
  expect(error, `check_invariants RPC error: ${error?.message}`).toBeNull();
  const failures = (data ?? []).filter((r: { status: string }) => r.status === 'FAIL');
  expect(failures, failures.map((f: { invariant: string; details: string }) => `${f.invariant}: ${f.details}`).join('\n')).toHaveLength(0);
}

const sum = (rows: { amount: number | string }[]) => Math.round(rows.reduce((s, r) => s + Number(r.amount), 0) * 100) / 100;

async function ledger(filter: { account: string; party?: string | null; orderId?: string }) {
  let q = db.from('money_entries').select('amount, doc_type, counterparty_id').eq('account_type', filter.account);
  if (filter.party !== undefined) q = filter.party === null ? q.is('counterparty_id', null) : q.eq('counterparty_id', filter.party);
  if (filter.orderId) q = q.eq('order_id', filter.orderId);
  const { data } = await q.limit(1000);
  return data ?? [];
}

async function markOrderDocsAsTest(orderId: string) {
  const { data: docs } = await db.from('acc_documents').select('id, meta').eq('order_id', orderId);
  for (const d of docs ?? []) {
    await db.from('acc_documents').update({ meta: { ...(d.meta ?? {}), test: true } }).eq('id', d.id);
  }
}

async function placeDropshipOrder(paymentType: 'cod' | 'prepaid', ttn: string) {
  const id = crypto.randomUUID();
  const { data: charge } = await db.rpc('charge_partner_balance', {
    p_customer_id: partnerId, p_amount: COST, p_order_id: id, p_description: 'test charge',
  });
  expect(charge?.success).toBe(true);
  const items = [{ sku: testSku, name: 'test', brand: 'test', qty: 1, price: SELL, cost_price: COST }];
  const { data, error } = await db.from('orders').insert({
    id, contact: 'PARTNER-LEDGER тест', phone: '+380000000002', email: 'partner-ledger@test.local',
    status: 'shipped', channel_code: 'dropship', price_type: 'drop', partner_code: partnerId,
    delivery_type: 'nova', payment_type: paymentType, total_price: SELL, tracking_number: ttn, items,
  }).select('id, order_number').single();
  if (error) throw new Error('order insert: ' + error.message);
  orderIds.push(id);

  const docId = await createSaleDraft({
    order_id: id, order_number: data.order_number as number, order_items: items,
    channel_code: 'dropship', confirmed_by: 'test', tracking_number: ttn,
  });
  const { data: draft } = await db.from('acc_documents').select('meta').eq('id', docId).single();
  await db.from('acc_documents').update({ meta: { ...(draft?.meta ?? {}), test: true } }).eq('id', docId);
  return { id, docId };
}

beforeAll(async () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  db = createClient(url, key, { auth: { persistSession: false } });

  const fx = await loadFixtures(db);
  testSku = fx.sku;

  const receipt = await createDocument({
    doc_type: 'receipt', warehouse_id: fx.warehouseId, supplier_id: fx.supplierId,
    notes: '[TEST] stock for partner-ledger test', meta: { test: true },
    lines: [{ sku: testSku, qty: 10, price: 300, cost_price: 200 }],
  });
  await confirmDocument(receipt.id, 'test');

  const { data: partner, error } = await db.from('customers')
    .insert({ name: '[TEST] Дропшип-партнер', type: 'dropship_partner', is_active: true })
    .select('id').single();
  if (error) throw new Error('partner insert: ' + error.message);
  partnerId = partner.id as string;

  // Поповнення карткою: баланс кабінету (як у вебхуку) + проводка
  await db.from('partner_balance_transactions').insert({
    customer_id: partnerId, tx_type: 'top_up', amount: 1000, description: 'test topup',
    created_by: 'monobank_webhook', external_ref: `mono:topup:TEST-${partnerId}`,
  });
  await recordPartnerCardTopup({ customerId: partnerId, amount: 1000, invoiceId: `TEST-${partnerId}` });
});

afterAll(async () => {
  if (!db) return;
  for (const id of orderIds) await markOrderDocsAsTest(id);
  if (orderIds.length) await db.from('orders').delete().in('id', orderIds);
  if (partnerId) await db.from('customers').delete().eq('id', partnerId);
  const { data, error } = await db.rpc('reset_accounting_test_data');
  if (error || String(data).startsWith('REFUSED')) console.error('Cleanup error:', error?.message ?? data);
});

describe('Дропшип-партнер у леджері', () => {
  it('поповнення карткою: аванс партнера на еквайрингу', async () => {
    expect(sum(await ledger({ account: 'partner', party: partnerId }))).toBe(-1000);
    // повтор вебхука не задвоює
    await recordPartnerCardTopup({ customerId: partnerId, amount: 1000, invoiceId: `TEST-${partnerId}` });
    expect(sum(await ledger({ account: 'partner', party: partnerId }))).toBe(-1000);
  }, 30000);

  it('наложка: продаж на партнера за закупкою, залік балансу, наложка й комісія — леджер = баланс кабінету', async () => {
    const ttn = '59PARTNERLDG001';
    const order = await placeDropshipOrder('cod', ttn);

    const { data: lines } = await db.from('acc_document_lines').select('price, qty').eq('document_id', order.docId);
    expect(Number(lines?.[0]?.price)).toBe(COST);

    const closed = await completeShipmentByTtn(ttn, 'test');
    expect(closed).toBe(order.id);

    // Продаж: дебітор — партнер, виручка = закупка, борг закритий балансом
    const custP = await ledger({ account: 'customer', party: partnerId, orderId: order.id });
    const sale = custP.find(e => e.doc_type === 'sale' && Number(e.amount) > 0);
    expect(Number(sale?.amount)).toBe(COST);
    expect(sum(custP)).toBe(0);
    expect((await ledger({ account: 'customer', party: 'guest', orderId: order.id })).length).toBe(0);
    expect(sum(await ledger({ account: 'revenue', orderId: order.id }))).toBe(-COST);

    // Наложка: НоваПей винна нам брутто
    expect(sum(await ledger({ account: 'customer', party: 'np:cod', orderId: order.id }))).toBe(SELL);

    // Баланс кабінету = рахунок partner у леджері (з протилежним знаком)
    const { data: cust } = await db.from('customers').select('balance').eq('id', partnerId).single();
    const partnerLedger = sum(await ledger({ account: 'partner', party: partnerId }));
    expect(partnerLedger).toBe(-Number(cust?.balance));
    const { data: txs } = await db.from('partner_balance_transactions').select('tx_type, amount').eq('order_id', order.id);
    const fee = -sum((txs ?? []).filter(t => t.tx_type === 'np_fee'));
    expect(fee).toBeGreaterThan(0);
    expect(sum(await ledger({ account: 'logistics', party: 'np', orderId: order.id }))).toBe(-fee);

    // Повторне вручення нічого не задвоює
    await completeShipmentByTtn(ttn, 'test');
    expect(sum(await ledger({ account: 'partner', party: partnerId }))).toBe(partnerLedger);

    await assertInvariants();
  }, 60000);

  it('скасування проведеного продажу сторнує залік балансу партнера', async () => {
    const ttn = '59PARTNERLDG002';
    const order = await placeDropshipOrder('prepaid', ttn);
    await completeShipmentByTtn(ttn, 'test');
    expect(sum(await ledger({ account: 'customer', party: partnerId, orderId: order.id }))).toBe(0);
    const partnerBefore = sum(await ledger({ account: 'partner', party: partnerId }));

    await reverseDropshipLedgerExtras({ orderId: order.id, docId: order.docId, createdBy: 'test' });
    // Залік знято: борг продажу знову на партнері, аванс повернувся на рахунок partner
    expect(sum(await ledger({ account: 'customer', party: partnerId, orderId: order.id }))).toBe(COST);
    expect(sum(await ledger({ account: 'partner', party: partnerId }))).toBe(Math.round((partnerBefore - COST) * 100) / 100);

    // повторне сторно нічого не робить
    await reverseDropshipLedgerExtras({ orderId: order.id, docId: order.docId, createdBy: 'test' });
    expect(sum(await ledger({ account: 'customer', party: partnerId, orderId: order.id }))).toBe(COST);

    await assertInvariants();
  }, 60000);
});

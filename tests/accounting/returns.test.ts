/**
 * Integration — документ «Повернення»: ланцюжок РН → ПВ (заявка → отримано)
 * → ПП (відправлено → прийнято) і скасування у зворотному порядку.
 *
 * Запуск:  npm run test:integration -- tests/accounting/returns.test.ts
 * Дані — meta.test=true, прибираються reset_accounting_test_data() в afterAll.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createDocument, confirmDocument } from '../../lib/accounting/documents';
import {
  createCustomerReturn, receiveCustomerReturn, createSupplierReturn, acceptSupplierReturn,
  cancelReturn, getReturnCard, getReturnableItems, listReturns,
} from '../../lib/accounting/returns';
import { loadFixtures, createTestOrder, deleteTestOrders } from './fixtures';

let db: SupabaseClient;
let warehouseId: number;
let supplierId: number;
let sku: string;

async function assertInvariants() {
  const { data, error } = await db.rpc('check_invariants');
  expect(error, `check_invariants RPC error: ${error?.message}`).toBeNull();
  const failures = (data ?? []).filter((r: { status: string }) => r.status === 'FAIL');
  expect(failures, `Invariant violations:\n${failures.map((f: { invariant: string; details: string }) => `  ${f.invariant}: ${f.details}`).join('\n')}`).toHaveLength(0);
}
async function entries(docId: string) {
  const { data } = await db.from('money_entries').select('account_type, amount, doc_type, idempotency_key').eq('doc_id', docId);
  return data ?? [];
}
async function available(): Promise<number> {
  const { data } = await db.from('stock_balance').select('qty_available').eq('sku', sku).eq('warehouse_id', warehouseId).maybeSingle();
  return Number(data?.qty_available ?? 0);
}
async function docStatus(id: string) {
  const { data } = await db.from('acc_documents').select('status, meta').eq('id', id).single();
  return { status: data?.status as string, stage: (data?.meta as { return?: { stage?: string } })?.return?.stage };
}

beforeAll(async () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  db = createClient(url, key, { auth: { persistSession: false } });
  const fx = await loadFixtures(db);
  warehouseId = fx.warehouseId; supplierId = fx.supplierId; sku = fx.sku;
  // Дефолтний склад потрібен createCustomerReturn — у тестовій базі перший і є дефолтним
  await db.from('warehouses').update({ is_default: true }).eq('id', warehouseId);

  const receipt = await createDocument({
    doc_type: 'receipt', warehouse_id: warehouseId, supplier_id: supplierId,
    notes: '[TEST] stock for returns test', meta: { test: true },
    lines: [{ sku, qty: 10, price: 100, cost_price: 60 }],
  });
  await confirmDocument(receipt.id, 'test');
});

afterAll(async () => {
  if (!db) return;
  const { error } = await db.rpc('reset_accounting_test_data');
  if (error) console.error('Cleanup error:', error.message);
  await deleteTestOrders(db);
});

describe('Повернення: РН → ПВ → ПП і скасування', () => {
  it('повний ланцюжок на власному товарі', async () => {
    const orderId = await createTestOrder(db, sku, 2, 100);
    const sale = await createDocument({
      doc_type: 'sale', warehouse_id: warehouseId, order_id: orderId, channel_code: 'website',
      notes: '[TEST] sale', meta: { test: true },
      lines: [{ sku, qty: 2, price: 100, cost_price: 60, fulfillment_type: 'own', warehouse_id: warehouseId }],
    });
    await confirmDocument(sale.id, 'test');
    const stockAfterSale = await available();

    // ── ПВ: заявка без проводок, кількість заброньована ─────────────────
    const pv = await createCustomerReturn({
      orderId, items: [{ sku, qty: 1 }], reason: 'surplus', reasonText: 'одна зайва', createdBy: 'test', meta: { test: true },
    });
    expect(pv.doc_number).toMatch(/^ПВ-/);
    expect(pv.total).toBe(100);
    expect((await docStatus(pv.id))).toEqual({ status: 'draft', stage: 'awaiting' });
    expect(await entries(pv.id)).toHaveLength(0);
    expect(await available()).toBe(stockAfterSale);

    const ret = await getReturnableItems(orderId);
    expect(ret.items[0]).toMatchObject({ shipped: 2, returned: 1, available: 1 });
    expect(ret.existing.map(e => e.stage)).toEqual(['awaiting']);
    await expect(createCustomerReturn({ orderId, items: [{ sku, qty: 2 }], reason: 'surplus', createdBy: 'test', meta: { test: true } }))
      .rejects.toThrow(/доступно 1, запитано 2/);

    // ── ПВ: товар отримано → проводки, склад +1, кошти повернуто з банку ──
    const recv = await receiveCustomerReturn({ docId: pv.id, receivedAt: new Date().toISOString().slice(0, 10), refund: { method: 'bank' }, confirmedBy: 'test' });
    expect(recv).toMatchObject({ total: 100, commission_reversed: 0, refunded: 100 });
    expect((await docStatus(pv.id))).toEqual({ status: 'confirmed', stage: 'received' });
    expect(await available()).toBe(stockAfterSale + 1);
    const pvEntries = await entries(pv.id);
    expect(pvEntries.find(e => e.account_type === 'revenue' && Number(e.amount) > 0)?.amount).toBeTruthy();   // DR виручка
    expect(pvEntries.find(e => e.account_type === 'inventory_asset' && Number(e.amount) > 0)).toBeTruthy();   // DR склад
    expect(pvEntries.find(e => e.account_type === 'bank' && Number(e.amount) < 0)).toBeTruthy();              // CR банк (refund)
    expect(Number(pvEntries.find(e => e.account_type === 'inventory_asset' && Number(e.amount) > 0)?.amount)).toBe(60);

    const card = await getReturnCard(pv.id);
    expect(card?.kind).toBe('customer');
    expect(card?.actions).toMatchObject({ receive: false, supplierReturn: true, cancel: true });
    expect(card?.lines[0].supplier_returnable).toBe(1);
    expect(card?.chain.sales.map(s => s.id)).toContain(sale.id);
    expect(card?.entries.length).toBe(3);
    expect(card?.suppliers.length).toBeGreaterThan(0);

    // ── ПП на підставі ПВ: склад −1, борг постачальнику −60 ───────────────
    const pp = await createSupplierReturn({
      basis: { kind: 'customer_return', docId: pv.id }, supplierId, lines: [{ sku, qty: 1 }],
      reason: 'surplus', ttn: '20450000000001', createdBy: 'test', meta: { test: true },
    });
    expect(pp.total).toBe(60);
    expect((await docStatus(pp.id))).toEqual({ status: 'confirmed', stage: 'sent' });
    expect(await available()).toBe(stockAfterSale);
    const ppEntries = await entries(pp.id);
    expect(Number(ppEntries.find(e => e.account_type === 'supplier')?.amount)).toBe(60);
    expect(Number(ppEntries.find(e => e.account_type === 'inventory_asset')?.amount)).toBe(-60);
    await expect(createSupplierReturn({ basis: { kind: 'customer_return', docId: pv.id }, supplierId, lines: [{ sku, qty: 1 }], reason: 'surplus', createdBy: 'test', meta: { test: true } }))
      .rejects.toThrow(/доступно 0/);

    await acceptSupplierReturn(pp.id, null);
    expect((await docStatus(pp.id)).stage).toBe('accepted');

    const pvCard = await getReturnCard(pv.id);
    expect(pvCard?.chain.children.map(c => c.id)).toEqual([pp.id]);
    expect(pvCard?.actions.cancel).toBe(false);
    expect(pvCard?.lines[0].supplier_returnable).toBe(0);

    const { rows, kpi } = await listReturns({ limit: 50 });
    expect(rows.find(r => r.id === pv.id)?.children.map(c => c.doc_number)).toEqual([pp.doc_number]);
    expect(rows.find(r => r.id === pp.id)?.parent?.doc_number).toBe(pv.doc_number);
    expect(kpi.awaiting.count).toBe(0);
    await assertInvariants();

    // ── Скасування: спочатку ПП, потім ПВ (разом зі сторно refund) ────────
    await expect(cancelReturn(pv.id, null, 'test')).rejects.toThrow(/Спочатку скасуйте/);
    await cancelReturn(pp.id, 'помилково', 'test');
    expect((await docStatus(pp.id)).status).toBe('cancelled');
    expect(await available()).toBe(stockAfterSale + 1);

    await cancelReturn(pv.id, null, 'test');
    expect((await docStatus(pv.id)).status).toBe('cancelled');
    expect(await available()).toBe(stockAfterSale);
    const after = await entries(pv.id);
    expect(after.find(e => e.idempotency_key === `refund-storno:${pv.id}`)).toBeTruthy();
    // Замовлення знову можна повертати повністю
    expect((await getReturnableItems(orderId)).items[0].available).toBe(2);
    await assertInvariants();
  }, 60000);

  it('дропшип-рядок приходується на наш склад; борг постачальнику не чіпається до ПП', async () => {
    const orderId = await createTestOrder(db, sku, 1, 100);
    const sale = await createDocument({
      doc_type: 'sale', warehouse_id: warehouseId, order_id: orderId, channel_code: 'website',
      notes: '[TEST] dropship sale', meta: { test: true },
      lines: [{ sku, qty: 1, price: 100, cost_price: 70, fulfillment_type: 'dropship', supplier_id: supplierId }],
    });
    await confirmDocument(sale.id, 'test');
    const stockBefore = await available();

    const pv = await createCustomerReturn({ orderId, items: [{ sku, qty: 1 }], reason: 'not_fit', createdBy: 'test', meta: { test: true } });
    await receiveCustomerReturn({ docId: pv.id, confirmedBy: 'test' });
    expect(await available()).toBe(stockBefore + 1);                         // дропшип → наш склад
    const pvEntries = await entries(pv.id);
    expect(pvEntries.some(e => e.account_type === 'supplier')).toBe(false);  // борг постачальнику не змінено
    expect(Number(pvEntries.find(e => e.account_type === 'inventory_asset' && Number(e.amount) > 0)?.amount)).toBe(70);

    const card = await getReturnCard(pv.id);
    expect(card?.lines[0]).toMatchObject({ origin_fulfillment: 'dropship', supplier_id: supplierId, supplier_returnable: 1 });
    expect(card?.suppliers.map(s => s.id)).toContain(supplierId);

    const pp = await createSupplierReturn({ basis: { kind: 'customer_return', docId: pv.id }, supplierId, lines: [{ sku, qty: 1 }], reason: 'not_fit', createdBy: 'test', meta: { test: true } });
    expect(Number((await entries(pp.id)).find(e => e.account_type === 'supplier')?.amount)).toBe(70);
    expect(await available()).toBe(stockBefore);
    await assertInvariants();
  }, 60000);

  it('ПП по приходу: межа — кількість приходу мінус попередні повернення', async () => {
    const receipt = await createDocument({
      doc_type: 'receipt', warehouse_id: warehouseId, supplier_id: supplierId, notes: '[TEST] receipt for pp', meta: { test: true },
      lines: [{ sku, qty: 2, price: 100, cost_price: 55 }],
    });
    await confirmDocument(receipt.id, 'test');
    const pp1 = await createSupplierReturn({ basis: { kind: 'receipt', docId: receipt.id }, supplierId, lines: [{ sku, qty: 1 }], reason: 'defect', reasonText: 'тріснута', createdBy: 'test', meta: { test: true } });
    expect(pp1.total).toBe(55);
    await expect(createSupplierReturn({ basis: { kind: 'receipt', docId: receipt.id }, supplierId, lines: [{ sku, qty: 2 }], reason: 'defect', createdBy: 'test', meta: { test: true } }))
      .rejects.toThrow(/доступно 1, запитано 2/);
    const card = await getReturnCard(pp1.id);
    expect(card?.parent?.doc_number).toBe(receipt.doc_number);
    expect(card?.kind).toBe('supplier');
    await assertInvariants();
  }, 60000);
});

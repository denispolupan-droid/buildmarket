/**
 * Integration tests — повний цикл облікових документів.
 *
 * Запуск:  npm run test:integration
 * Вимоги:  .env.local з NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 *
 * Після кожного тесту запускається check_invariants() — якщо хоча б один
 * інваріант FAIL, тест провалюється.
 *
 * Дані маркуються meta.test=true і прибираються в afterAll через
 * reset_accounting_test_data() (безпечна SQL-функція).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createDocument, confirmDocument, cancelDocument } from '../../lib/accounting/documents';
import { createReservation, releaseReservation } from '../../lib/accounting/reservations';
import { recordSupplierPayment, recordCOGS, recordTxn } from '../../lib/accounting/money';
import { reverseDropshipLedgerExtras } from '../../lib/accounting/dropship';
import { loadFixtures } from './fixtures';

// ── Фікстури (знаходяться динамічно в beforeAll) ──────────────────────────────

let db:           SupabaseClient;
let warehouseId:  number;
let warehouseId2: number;
let supplierId:   number;
let testSku:      string;
let customerId:   string;

// IDs документів, що створюються в тестах
let poDocId:      string;
let receiptDocId: string;
let saleDocId:    string;

// ── Допоміжні функції ─────────────────────────────────────────────────────────

async function assertInvariants() {
  const { data, error } = await db.rpc('check_invariants');
  expect(error, `check_invariants RPC error: ${error?.message}`).toBeNull();
  const failures = (data ?? []).filter((r: { status: string }) => r.status === 'FAIL');
  expect(
    failures,
    `Invariant violations:\n${failures.map((f: { invariant: string; details: string }) => `  ${f.invariant}: ${f.details}`).join('\n')}`,
  ).toHaveLength(0);
}

async function getStockBalance(sku: string, whId: number) {
  const { data } = await db
    .from('stock_balance')
    .select('qty_total, qty_reserved, qty_available')
    .eq('sku', sku)
    .eq('warehouse_id', whId)
    .maybeSingle();
  return data;
}

async function getMoneyEntries(docId: string) {
  const { data } = await db
    .from('money_entries')
    .select('account_type, amount, txn_id')
    .eq('doc_id', docId);
  return data ?? [];
}

// ── Setup / Teardown ──────────────────────────────────────────────────────────

beforeAll(async () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error(
    'Missing env vars: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required',
  );

  db = createClient(url, key, { auth: { persistSession: false } });

  // Реальний склад, постачальник, SKU і клієнт — із повтором на транзиторній
  // відмові тестової бази (див. коментар у fixtures.ts).
  const fx = await loadFixtures(db);
  warehouseId = fx.warehouseId;
  supplierId  = fx.supplierId;
  testSku     = fx.sku;
  customerId  = fx.customerId ?? '';

  // Знаходимо другий склад (для тестів transfer)
  const { data: wh2 } = await db
    .from('warehouses').select('id').order('id').neq('id', warehouseId).limit(1).maybeSingle();
  warehouseId2 = wh2?.id ?? 0;

  console.log(`Fixtures: wh=${warehouseId} wh2=${warehouseId2} sup=${supplierId} sku=${testSku} cust=${customerId}`);
});

afterAll(async () => {
  if (!db) return;
  const { data, error } = await db.rpc('reset_accounting_test_data');
  if (error) console.error('Cleanup error:', error.message);
  else       console.log('Cleanup:', data);
});

// ── Тести ─────────────────────────────────────────────────────────────────────

describe('Purchase Order', () => {
  it('creates PO as draft — no stock movements', async () => {
    const doc = await createDocument({
      doc_type:    'purchase_order',
      warehouse_id: warehouseId,
      supplier_id:  supplierId,
      notes:        '[TEST] PO smoke test',
      meta:         { test: true },
      lines: [{
        sku:        testSku,
        qty:        10,
        price:      100,
        cost_price: 100,
      }],
    });

    poDocId = doc.id;
    expect(doc.status).toBe('draft');

    // PO не рухає склад
    const { count } = await db
      .from('stock_movements')
      .select('id', { count: 'exact', head: true })
      .eq('document_id', doc.id);
    expect(count).toBe(0);
  });
});

describe('Receipt — товар приходить на склад', () => {
  it('confirms receipt: stock +10, FIFO batch created, supplier debt recorded', async () => {
    const balanceBefore = await getStockBalance(testSku, warehouseId);
    const qtyBefore = balanceBefore?.qty_total ?? 0;

    const doc = await createDocument({
      doc_type:     'receipt',
      warehouse_id:  warehouseId,
      supplier_id:   supplierId,
      parent_doc_id: poDocId,
      notes:         '[TEST] Receipt from PO',
      meta:          { test: true },
      lines: [{
        sku:        testSku,
        qty:        10,
        price:      100,
        cost_price: 100,
      }],
    });
    receiptDocId = doc.id;

    await confirmDocument(receiptDocId, 'test-user');

    // Склад збільшився на 10
    const balanceAfter = await getStockBalance(testSku, warehouseId);
    expect(balanceAfter?.qty_total).toBe(qtyBefore + 10);

    // FIFO партія створена
    const { data: batches } = await db
      .from('stock_batches')
      .select('initial_qty, remaining_qty, cost_price')
      .eq('document_id', receiptDocId);
    expect(batches).toHaveLength(1);
    expect(Number(batches![0].initial_qty)).toBe(10);
    expect(Number(batches![0].remaining_qty)).toBe(10);
    expect(Number(batches![0].cost_price)).toBe(100);

    // Борг перед постачальником записаний в леджер
    const entries = await getMoneyEntries(receiptDocId);
    const debit  = entries.find(e => e.account_type === 'inventory_asset');
    const credit = entries.find(e => e.account_type === 'supplier');
    expect(debit,  'inventory_asset debit missing').toBeTruthy();
    expect(credit, 'supplier credit missing').toBeTruthy();
    expect(Number(debit!.amount)).toBe(1000);   // 10 * 100
    expect(Number(credit!.amount)).toBe(-1000);

    await assertInvariants();
  });
});

describe('Sale — товар іде з складу', () => {
  it('confirms sale: stock -5, FIFO consumed, revenue + COGS recorded', async () => {
    const balanceBefore = await getStockBalance(testSku, warehouseId);
    const qtyBefore = balanceBefore?.qty_total ?? 0;

    const doc = await createDocument({
      doc_type:    'sale',
      warehouse_id: warehouseId,
      customer_id:  customerId || undefined,
      notes:        '[TEST] Sale test',
      meta:         { test: true },
      lines: [{
        sku:        testSku,
        qty:        5,
        price:      200,
        cost_price: 100,
      }],
    });
    saleDocId = doc.id;

    await confirmDocument(saleDocId, 'test-user');

    // Склад зменшився на 5
    const balanceAfter = await getStockBalance(testSku, warehouseId);
    expect(balanceAfter?.qty_total).toBe(qtyBefore - 5);

    // FIFO партія списана на 5
    const { data: batches } = await db
      .from('stock_batches')
      .select('remaining_qty')
      .eq('document_id', receiptDocId);
    expect(Number(batches![0].remaining_qty)).toBe(5); // залишилось 5 з 10

    // Виручка та COGS записані
    const entries = await getMoneyEntries(saleDocId);
    const revenue = entries.find(e => e.account_type === 'revenue');
    const cogs    = entries.find(e => e.account_type === 'cogs');
    expect(revenue, 'revenue entry missing').toBeTruthy();
    expect(cogs,    'cogs entry missing').toBeTruthy();
    expect(Number(revenue!.amount)).toBe(-1000); // credit revenue: 5 * 200
    expect(Number(cogs!.amount)).toBe(500);      // debit cogs: 5 * 100 FIFO

    await assertInvariants();
  });
});

describe('Storno — відміна підтвердженого документу', () => {
  // Порядок важливий: спочатку сторнуємо продаж (+5 назад),
  // потім прихід (–10). Інакше баланс піде в мінус.

  it('cancels sale: stock +5 restored, revenue reversed', async () => {
    const balanceBefore = await getStockBalance(testSku, warehouseId);
    const qtyBefore = balanceBefore?.qty_total ?? 0;  // = 5 після продажу

    await cancelDocument(saleDocId, 'test-user', 'Тест сторно продажу');

    const balanceAfter = await getStockBalance(testSku, warehouseId);
    expect(balanceAfter?.qty_total).toBe(qtyBefore + 5);  // 5 + 5 = 10

    const { data: reversal } = await db
      .from('acc_documents')
      .select('id, status')
      .eq('reversal_of', saleDocId)
      .single();
    expect(reversal?.status).toBe('confirmed');

    if (customerId) {
      const reversalEntries = await getMoneyEntries(reversal!.id);
      const revenueDebit = reversalEntries.find(e => e.account_type === 'revenue' && Number(e.amount) > 0);
      expect(revenueDebit, 'revenue debit (storno) missing').toBeTruthy();
    }

    await assertInvariants();
  });

  it('cancels receipt: stock –10, supplier debt reversed', async () => {
    // На цей момент баланс = 10 (після сторно продажу)
    const balanceBefore = await getStockBalance(testSku, warehouseId);
    const qtyBefore = balanceBefore?.qty_total ?? 0;  // = 10

    await cancelDocument(receiptDocId, 'test-user', 'Тест сторно приходу');

    const balanceAfter = await getStockBalance(testSku, warehouseId);
    expect(balanceAfter?.qty_total ?? 0).toBe(qtyBefore - 10);  // 10 – 10 = 0

    const { data: orig } = await db
      .from('acc_documents').select('status').eq('id', receiptDocId).single();
    expect(orig?.status).toBe('cancelled');

    const { data: reversal } = await db
      .from('acc_documents')
      .select('id, status')
      .eq('reversal_of', receiptDocId)
      .single();
    expect(reversal?.status).toBe('confirmed');

    const reversalEntries = await getMoneyEntries(reversal!.id);
    const supplierDebit = reversalEntries.find(e => e.account_type === 'supplier' && Number(e.amount) > 0);
    expect(supplierDebit, 'supplier debit (storno) missing').toBeTruthy();

    await assertInvariants();
  });
});

// recordDropshipSale() records COGS and the supplier payable via standalone recordTxn/recordCOGS
// calls, OUTSIDE the document's own buildMovements flow (dropship lines never touch our stock,
// so buildMovements skips them). cancelDocument() reverses whatever confirmDocument auto-posted
// for the doc's lines (revenue), but has no idea these two extra entries exist — that's exactly
// the bug reverseDropshipLedgerExtras() fixes. Bypasses the fulfillment router (which needs real
// supplier_stock/supplier_sku_map fixtures to classify a line as dropship) and instead reproduces
// the exact entries recordDropshipSale() would have posted, to test the reversal in isolation.
describe('Dropship cancel — reverses COGS and supplier payable left outside the document flow', () => {
  it('reverseDropshipLedgerExtras nets the cogs and supplier entries to zero', async () => {
    const testOrderId = crypto.randomUUID();

    const doc = await createDocument({
      doc_type:     'sale',
      warehouse_id: warehouseId,
      customer_id:  customerId || undefined,
      order_id:     testOrderId,
      notes:        '[TEST] Dropship sale test',
      meta:         { test: true },
      lines: [{
        sku:              testSku,
        qty:              2,
        price:            300,
        cost_price:       150,
        fulfillment_type: 'dropship',
        supplier_id:      supplierId,
      }],
    });
    await confirmDocument(doc.id, 'test-user');

    // Mimic recordDropshipSale()'s two extra postings for a dropship line.
    await recordCOGS({
      amount: 300, docId: doc.id, orderId: testOrderId,
      idempotencyKey: `cogs:${testOrderId}:${doc.id}`,
    });
    await recordTxn({
      debitAccount: 'inventory_asset', creditAccount: 'supplier', creditParty: String(supplierId),
      amount: 300, docId: doc.id, docType: 'sale', orderId: testOrderId,
      description:    'Дропшип: борг перед постачальником (тест)',
      idempotencyKey: `dropship-payable:${testOrderId}:${supplierId}`,
    });

    const before = await getMoneyEntries(doc.id);
    expect(before.filter(e => e.account_type === 'cogs')).toHaveLength(1);
    expect(before.filter(e => e.account_type === 'supplier')).toHaveLength(1);

    await reverseDropshipLedgerExtras({ orderId: testOrderId, docId: doc.id, createdBy: 'test-user' });

    const after = await getMoneyEntries(doc.id);
    const cogsSum     = after.filter(e => e.account_type === 'cogs').reduce((s, e) => s + Number(e.amount), 0);
    const supplierSum = after.filter(e => e.account_type === 'supplier').reduce((s, e) => s + Number(e.amount), 0);
    expect(cogsSum,     'cogs entries should net to zero after reversal').toBe(0);
    expect(supplierSum, 'supplier entries should net to zero after reversal').toBe(0);

    // Idempotency: reversing twice must not double-post
    await reverseDropshipLedgerExtras({ orderId: testOrderId, docId: doc.id, createdBy: 'test-user' });
    const afterTwice = await getMoneyEntries(doc.id);
    expect(afterTwice.length).toBe(after.length);

    await assertInvariants();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Reservations — резервування та захист від oversell
// ══════════════════════════════════════════════════════════════════════════════

describe('Reservations', () => {
  let reservationOrderId: string;

  beforeAll(async () => {
    // Попередні тести скинули баланс в 0 — поповнюємо
    const doc = await createDocument({
      doc_type:    'receipt',
      warehouse_id: warehouseId,
      supplier_id:  supplierId,
      notes:        '[TEST] Receipt for reservation tests',
      meta:         { test: true },
      lines: [{ sku: testSku, qty: 20, price: 80, cost_price: 80 }],
    });
    await confirmDocument(doc.id, 'test-user');
  });

  it('reserves 7 units: qty_reserved=7, qty_available=13', async () => {
    reservationOrderId = crypto.randomUUID();

    const result = await createReservation({
      order_id:     reservationOrderId,
      warehouse_id: warehouseId,
      items:        [{ sku: testSku, qty: 7 }],
    });

    expect(result.success).toBe(true);
    expect(result.reserved).toHaveLength(1);
    expect(result.insufficient).toHaveLength(0);

    const bal = await getStockBalance(testSku, warehouseId);
    expect(Number(bal?.qty_reserved)).toBe(7);
    expect(Number(bal?.qty_available)).toBe(13);

    await assertInvariants();
  });

  it('refuses oversell: request 15 with only 13 available', async () => {
    const result = await createReservation({
      order_id:     crypto.randomUUID(),
      warehouse_id: warehouseId,
      items:        [{ sku: testSku, qty: 15 }],
    });

    expect(result.success).toBe(false);
    expect(result.insufficient).toHaveLength(1);
    expect(result.insufficient[0].sku).toBe(testSku);
    expect(Number(result.insufficient[0].requested)).toBe(15);
    expect(Number(result.insufficient[0].available)).toBe(13);

    // Баланс не змінився після невдалої спроби
    const bal = await getStockBalance(testSku, warehouseId);
    expect(Number(bal?.qty_reserved)).toBe(7);

    await assertInvariants();
  });

  it('sale with order_id: reservation released on confirm', async () => {
    const balBefore = await getStockBalance(testSku, warehouseId);

    const doc = await createDocument({
      doc_type:    'sale',
      warehouse_id: warehouseId,
      customer_id:  customerId || undefined,
      order_id:     reservationOrderId,
      notes:        '[TEST] Sale of reserved stock',
      meta:         { test: true },
      lines: [{ sku: testSku, qty: 7, price: 160, cost_price: 80 }],
    });
    await confirmDocument(doc.id, 'test-user');

    const balAfter = await getStockBalance(testSku, warehouseId);
    expect(Number(balAfter?.qty_total)).toBe(Number(balBefore?.qty_total) - 7);

    // Резерв знято
    const { data: res } = await db
      .from('stock_reservations')
      .select('reservation_status, release_reason')
      .eq('order_id', reservationOrderId)
      .limit(1).single();
    expect(res?.reservation_status).toBe('released');
    expect(res?.release_reason).toBe('shipped');

    // qty_reserved = 0
    expect(Number((await getStockBalance(testSku, warehouseId))?.qty_reserved)).toBe(0);

    await assertInvariants();
  });

  it('cancel reservation: qty_available restored without stock movement', async () => {
    const orderId = crypto.randomUUID();
    await createReservation({
      order_id: orderId, warehouse_id: warehouseId, items: [{ sku: testSku, qty: 3 }],
    });
    expect(Number((await getStockBalance(testSku, warehouseId))?.qty_reserved)).toBe(3);

    // Відміна резерву не створює рухів складу
    await releaseReservation(orderId, 'cancelled');
    const balAfter = await getStockBalance(testSku, warehouseId);
    expect(Number(balAfter?.qty_reserved)).toBe(0);

    const { count } = await db
      .from('stock_movements')
      .select('id', { count: 'exact', head: true })
      .eq('order_id', orderId);
    expect(count).toBe(0);  // резерв — не рух

    await assertInvariants();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Transfer — переміщення між складами з FIFO
// ══════════════════════════════════════════════════════════════════════════════

describe('Transfer between warehouses', () => {
  beforeAll(async () => {
    if (!warehouseId2) return;
    const doc = await createDocument({
      doc_type:    'receipt',
      warehouse_id: warehouseId,
      supplier_id:  supplierId,
      notes:        '[TEST] Receipt for transfer test',
      meta:         { test: true },
      lines: [{ sku: testSku, qty: 12, price: 90, cost_price: 90 }],
    });
    await confirmDocument(doc.id, 'test-user');
  });

  it('transfers 4 units wh1→wh2: balances correct, FIFO cost preserved', async () => {
    if (!warehouseId2) {
      console.log('Only 1 warehouse — skipping transfer test');
      return;
    }

    const [wh1Before, wh2Before] = await Promise.all([
      getStockBalance(testSku, warehouseId),
      getStockBalance(testSku, warehouseId2),
    ]);

    // FIFO спише найстарішу партію — запам'ятовуємо її собівартість до трансферу
    const { data: oldestBatch } = await db
      .from('stock_batches')
      .select('cost_price')
      .eq('sku', testSku)
      .eq('warehouse_id', warehouseId)
      .gt('remaining_qty', 0)
      .order('received_at', { ascending: true })
      .limit(1)
      .single();
    const expectedCost = Number(oldestBatch?.cost_price ?? 0);

    const doc = await createDocument({
      doc_type:        'transfer',
      warehouse_id:     warehouseId,
      warehouse_to_id:  warehouseId2,
      notes:            '[TEST] Transfer wh1→wh2',
      meta:             { test: true },
      lines: [{ sku: testSku, qty: 4, price: 90, cost_price: 90 }],
    });
    await confirmDocument(doc.id, 'test-user');

    const [wh1After, wh2After] = await Promise.all([
      getStockBalance(testSku, warehouseId),
      getStockBalance(testSku, warehouseId2),
    ]);

    expect(Number(wh1After?.qty_total)).toBe(Number(wh1Before?.qty_total) - 4);
    expect(Number(wh2After?.qty_total)).toBe((Number(wh2Before?.qty_total) || 0) + 4);

    // FIFO партія на wh2 — собівартість рівна найстарішій партії wh1
    const { data: batches } = await db
      .from('stock_batches')
      .select('remaining_qty, cost_price')
      .eq('sku', testSku)
      .eq('warehouse_id', warehouseId2)
      .gt('remaining_qty', 0)
      .order('received_at', { ascending: false })
      .limit(1);
    expect(batches?.length).toBeGreaterThan(0);
    expect(Number(batches![0].cost_price)).toBe(expectedCost);

    await assertInvariants();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Supplier payment — оплата постачальнику закриває борг
// ══════════════════════════════════════════════════════════════════════════════

describe('Supplier payment', () => {
  it('pays half the debt: supplier balance reduces, I2+I3 hold', async () => {
    const { data: before } = await db
      .from('counterparty_balances')
      .select('balance')
      .eq('counterparty_id', String(supplierId))
      .eq('account_type', 'supplier')
      .maybeSingle();

    const debt = Math.abs(Number(before?.balance ?? 0));
    if (debt === 0) {
      console.log('No supplier debt found — skipping');
      return;
    }

    const payAmount = Math.round(debt / 2 * 100) / 100;
    await recordSupplierPayment({
      supplierId:    String(supplierId),
      amount:        payAmount,
      paymentMethod: 'bank',
      description:   '[TEST] Partial supplier payment',
    });

    const { data: after } = await db
      .from('counterparty_balances')
      .select('balance')
      .eq('counterparty_id', String(supplierId))
      .eq('account_type', 'supplier')
      .maybeSingle();

    // Борг зменшився
    expect(Math.abs(Number(after?.balance ?? 0))).toBeLessThan(debt);

    await assertInvariants();
  });
});

// ── Клієнтське повернення (return_in) — новий грошовий потік ──────────────────
// Потік: прихід +10 → продаж −6 → повернення +2.
// Очікування: склад +2 новою FIFO-партією; гроші: DR revenue / CR customer
// (сторно виручки) та DR inventory_asset / CR cogs (повернення собівартості).
describe('Customer return (return_in)', () => {
  let retReceiptId: string;
  let retSaleId:    string;
  let returnDocId:  string;

  it('receipt +10 and sale -6 as fixtures', async () => {
    const receipt = await createDocument({
      doc_type:     'receipt',
      warehouse_id: warehouseId,
      supplier_id:  supplierId,
      notes:        '[TEST] Receipt for return flow',
      meta:         { test: true },
      lines: [{ sku: testSku, qty: 10, price: 100, cost_price: 100 }],
    });
    retReceiptId = receipt.id;
    await confirmDocument(retReceiptId, 'test-user');

    const sale = await createDocument({
      doc_type:     'sale',
      warehouse_id: warehouseId,
      customer_id:  customerId || undefined,
      notes:        '[TEST] Sale for return flow',
      meta:         { test: true },
      lines: [{ sku: testSku, qty: 6, price: 200, cost_price: 100 }],
    });
    retSaleId = sale.id;
    await confirmDocument(retSaleId, 'test-user');

    await assertInvariants();
  });

  it('return_in +2: restock + revenue storno + COGS reversal', async () => {
    const balanceBefore = await getStockBalance(testSku, warehouseId);
    const qtyBefore = balanceBefore?.qty_total ?? 0;

    const ret = await createDocument({
      doc_type:     'return_in',
      warehouse_id: warehouseId,
      customer_id:  customerId || undefined,
      notes:        '[TEST] Customer return',
      meta:         { test: true },
      lines: [{ sku: testSku, qty: 2, price: 200, cost_price: 100 }],
    });
    returnDocId = ret.id;
    await confirmDocument(returnDocId, 'test-user');

    // Склад +2
    const balanceAfter = await getStockBalance(testSku, warehouseId);
    expect(balanceAfter?.qty_total).toBe(qtyBefore + 2);

    // Нова FIFO-партія на 2 шт
    const { data: batches } = await db
      .from('stock_batches')
      .select('initial_qty, remaining_qty')
      .eq('document_id', returnDocId);
    expect(batches).toHaveLength(1);
    expect(Number(batches![0].initial_qty)).toBe(2);

    // Гроші: сторно виручки (DR revenue +400) + собівартість на склад (DR inventory +200 / CR cogs −200)
    const entries = await getMoneyEntries(returnDocId);
    const revenueDebit   = entries.find(e => e.account_type === 'revenue' && Number(e.amount) > 0);
    const inventoryDebit = entries.find(e => e.account_type === 'inventory_asset' && Number(e.amount) > 0);
    const cogsCredit     = entries.find(e => e.account_type === 'cogs' && Number(e.amount) < 0);
    expect(revenueDebit,   'revenue debit (storno виручки) missing').toBeTruthy();
    expect(Number(revenueDebit!.amount)).toBe(400);   // 2 * 200
    expect(inventoryDebit, 'inventory_asset debit missing').toBeTruthy();
    expect(Number(inventoryDebit!.amount)).toBe(200); // 2 * 100
    expect(cogsCredit,     'cogs credit missing').toBeTruthy();
    expect(Number(cogsCredit!.amount)).toBe(-200);

    await assertInvariants();
  });

  it('cleanup: cancel return, sale, receipt', async () => {
    await cancelDocument(returnDocId,  'test-user', 'Тест: прибирання');
    await cancelDocument(retSaleId,    'test-user', 'Тест: прибирання');
    await cancelDocument(retReceiptId, 'test-user', 'Тест: прибирання');
    await assertInvariants();
  });
});

// ── Інвентаризація (inventory) ────────────────────────────────────────────────
// Потік: прихід +10 (cost 100) → інвентаризація: факт 8 (нестача 2), потім
// друга: факт 9 (надлишок 1). Очікування: склад коригується, гроші йдуть
// на рахунок variance за FIFO-собівартістю.
describe('Inventory count (inventory doc)', () => {
  let invReceiptId: string;
  let invShortageId: string;
  let invSurplusId: string;

  it('fixture: receipt +10 @100', async () => {
    const receipt = await createDocument({
      doc_type:     'receipt',
      warehouse_id: warehouseId,
      supplier_id:  supplierId,
      notes:        '[TEST] Receipt for inventory flow',
      meta:         { test: true },
      lines: [{ sku: testSku, qty: 10, price: 100, cost_price: 100 }],
    });
    invReceiptId = receipt.id;
    await confirmDocument(invReceiptId, 'test-user');
    await assertInvariants();
  });

  it('shortage: fact 8 → stock -2, DR variance / CR inventory_asset = 200', async () => {
    const before = await getStockBalance(testSku, warehouseId);
    const qtyBefore = before?.qty_total ?? 0;

    const doc = await createDocument({
      doc_type:     'inventory',
      warehouse_id: warehouseId,
      notes:        '[TEST] Inventory shortage',
      meta:         { test: true },
      lines: [{ sku: testSku, qty: -2, price: 0, cost_price: 100 }],
    });
    invShortageId = doc.id;
    await confirmDocument(invShortageId, 'test-user');

    const after = await getStockBalance(testSku, warehouseId);
    expect(after?.qty_total).toBe(qtyBefore - 2);

    const entries = await getMoneyEntries(invShortageId);
    const varianceDebit = entries.find(e => e.account_type === 'variance' && Number(e.amount) > 0);
    const invCredit     = entries.find(e => e.account_type === 'inventory_asset' && Number(e.amount) < 0);
    expect(varianceDebit, 'variance debit missing').toBeTruthy();
    // Сума = ФАКТИЧНА FIFO-собівартість списаних партій (не обов'язково 2*100:
    // сусідні тести могли лишити старіші партії з іншою ціною)
    const { data: shortMoves } = await db
      .from('stock_movements').select('batch_cost').eq('document_id', invShortageId).lt('qty', 0);
    const fifoCost = (shortMoves ?? []).reduce((s, m) => s + Math.abs(Number(m.batch_cost ?? 0)), 0);
    expect(fifoCost).toBeGreaterThan(0);
    expect(Number(varianceDebit!.amount)).toBeCloseTo(Math.round(fifoCost * 100) / 100, 2);
    expect(invCredit, 'inventory_asset credit missing').toBeTruthy();
    expect(Number(invCredit!.amount)).toBeCloseTo(-Math.round(fifoCost * 100) / 100, 2);

    await assertInvariants();
  });

  it('surplus: +1 → stock +1, DR inventory_asset / CR variance = 100', async () => {
    const before = await getStockBalance(testSku, warehouseId);
    const qtyBefore = before?.qty_total ?? 0;

    const doc = await createDocument({
      doc_type:     'inventory',
      warehouse_id: warehouseId,
      notes:        '[TEST] Inventory surplus',
      meta:         { test: true },
      lines: [{ sku: testSku, qty: 1, price: 0, cost_price: 100 }],
    });
    invSurplusId = doc.id;
    await confirmDocument(invSurplusId, 'test-user');

    const after = await getStockBalance(testSku, warehouseId);
    expect(after?.qty_total).toBe(qtyBefore + 1);

    const entries = await getMoneyEntries(invSurplusId);
    const invDebit       = entries.find(e => e.account_type === 'inventory_asset' && Number(e.amount) > 0);
    const varianceCredit = entries.find(e => e.account_type === 'variance' && Number(e.amount) < 0);
    expect(invDebit, 'inventory_asset debit missing').toBeTruthy();
    expect(Number(invDebit!.amount)).toBe(100);
    expect(varianceCredit, 'variance credit missing').toBeTruthy();

    await assertInvariants();
  });

  it('cleanup: cancel surplus, shortage-restock, receipt', async () => {
    // Порядок: сторно надлишку (−1) → сторно нестачі (+2) → сторно приходу (−10)
    await cancelDocument(invSurplusId,  'test-user', 'Тест: прибирання');
    await cancelDocument(invShortageId, 'test-user', 'Тест: прибирання');
    await cancelDocument(invReceiptId,  'test-user', 'Тест: прибирання');
    await assertInvariants();
  });
});

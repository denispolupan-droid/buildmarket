/**
 * Integration test — «Коригування боргу» (КБ, міграція 120).
 *
 * Живий кейс 17.09.2026: посилка загубилась, замовлення скопіювали й відправили
 * повторно; оплату 1 326 ₴ треба перенести з оригіналу на копію. Перевіряємо:
 *   • перенесення між замовленнями: леджер по кожному замовленню («₴ ВИПЛАЧЕНО»),
 *     сальдо клієнта незмінне, order_payments/amount_paid обох замовлень;
 *   • межі: зняти більше отриманого — відмова, нічого не записано;
 *   • взаємозалік клієнт ↔ постачальник і списання;
 *   • скасування документа обертає проводки і шар замовлення;
 *   • інваріанти обліку після кожного кроку.
 *
 * Запуск:  npm run test:integration (тестова БД з .env.test).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { recordTxn } from '../../lib/accounting/money';
import { applyOrderPayment } from '../../lib/accounting/order-payment';
import { createDebtAdjustment, cancelDebtAdjustment, listDebtAdjustments, sideState, openItems } from '../../lib/accounting/debt-adjustment';
import { loadFixtures } from './fixtures';

let db: SupabaseClient;
let supplierId: number;
let testSku: string;
let customerId: string;
let partnerId: string | null = null;
const orderIds: string[] = [];
const docIds: string[] = [];

const sum = (rows: { amount: number | string }[]) => Math.round(rows.reduce((s, r) => s + Number(r.amount), 0) * 100) / 100;

async function assertInvariants() {
  const { data, error } = await db.rpc('check_invariants');
  expect(error, `check_invariants RPC error: ${error?.message}`).toBeNull();
  const failures = (data ?? []).filter((r: { status: string }) => r.status === 'FAIL');
  expect(failures, failures.map((f: { invariant: string; details: string }) => `${f.invariant}: ${f.details}`).join('\n')).toHaveLength(0);
}

async function customerLedger(orderId?: string) {
  let q = db.from('money_entries').select('amount, order_id, doc_type').eq('account_type', 'customer').eq('counterparty_id', customerId);
  if (orderId) q = q.eq('order_id', orderId);
  const { data } = await q.limit(1000);
  return data ?? [];
}

async function orderPaid(orderId: string) {
  const { data } = await db.from('orders').select('amount_paid, payment_confirmed').eq('id', orderId).single();
  return { paid: Number(data?.amount_paid ?? 0), confirmed: !!data?.payment_confirmed };
}

/** Замовлення клієнта з проведеним продажем (борг 1 326) — без складу, лише леджер. */
async function makeSoldOrder(total: number): Promise<string> {
  const id = randomUUID();
  const { data, error } = await db.from('orders').insert({
    id, contact: 'DEBT-ADJ тест', phone: '+380000000003', email: 'debt-adj@test.local',
    status: 'shipped', channel_code: 'website', payment_type: 'invoice', customer_id: customerId,
    delivery_type: 'nova', total_price: total, items: [{ sku: testSku, name: 'test', brand: 'test', qty: 1, price: total }],
  }).select('id').single();
  if (error || !data) throw new Error('order insert: ' + error?.message);
  orderIds.push(id);
  await recordTxn({
    debitAccount: 'customer', debitParty: customerId, creditAccount: 'revenue', amount: total,
    docType: 'sale', orderId: id, description: '[TEST] продаж', idempotencyKey: `test-sale:${id}`, createdBy: 'test',
  });
  return id;
}

async function markTestDocs() {
  const { data: docs } = await db.from('acc_documents').select('id, meta').in('doc_type', ['debt_adjustment', 'customer_payment', 'customer_payment_reversal']);
  for (const d of docs ?? []) await db.from('acc_documents').update({ meta: { ...(d.meta ?? {}), test: true } }).eq('id', d.id);
}

beforeAll(async () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  db = createClient(url, key, { auth: { persistSession: false } });
  const fx = await loadFixtures(db);
  supplierId = fx.supplierId;
  testSku = fx.sku;
  if (!fx.customerId) throw new Error('У тестовій базі немає жодного клієнта');
  customerId = fx.customerId;
});

afterAll(async () => {
  if (!db) return;
  await markTestDocs();
  if (orderIds.length) await db.from('orders').delete().in('id', orderIds);
  const { data, error } = await db.rpc('reset_accounting_test_data');
  if (error || String(data).startsWith('REFUSED')) console.error('Cleanup error:', error?.message ?? data);
  // Партнера — лише після reset: на нього посилаються acc_documents.customer_id (FK)
  if (partnerId) {
    await db.from('partner_balance_transactions').delete().eq('customer_id', partnerId);
    const { error: pErr } = await db.from('customers').delete().eq('id', partnerId);
    if (pErr) console.error('Cleanup partner error:', pErr.message);
  }
});

describe('КБ — перенесення оплати між замовленнями (кейс 17.09.2026)', () => {
  let lost: string, copy: string;

  it('оплачений оригінал + неоплачена копія: перенесення 1 326 закриває копію і відкриває оригінал', async () => {
    lost = await makeSoldOrder(1326);
    copy = await makeSoldOrder(1326);
    const pay = await applyOrderPayment(db, { orderId: lost, amount: 1326, paymentMode: 'card', createdBy: 'test' });
    expect(pay.ok).toBe(true);
    expect((await orderPaid(lost)).confirmed).toBe(true);
    expect((await orderPaid(copy)).paid).toBe(0);

    const before = sum(await customerLedger());
    const items = await openItems(db, { account: 'customer', party: customerId });
    expect(items.find(i => i.order_id === lost)?.received).toBe(1326);
    expect(items.find(i => i.order_id === copy)?.open).toBe(1326);

    const res = await createDebtAdjustment({
      lines: [{ op: 'transfer', from: { account: 'customer', party: customerId, orderId: lost }, to: { account: 'customer', party: customerId, orderId: copy }, amount: 1326, note: 'посилка загубилась' }],
      notes: '[TEST] перенесення', createdBy: 'test',
    });
    docIds.push(res.id);
    expect(res.doc_number).toMatch(/^КБ-\d{4}-\d{4}$/);

    // Леджер по замовленнях: копія закрита, оригінал знову відкритий
    expect(sum(await customerLedger(copy))).toBe(0);
    expect(sum(await customerLedger(lost))).toBe(1326);
    // Сальдо клієнта не змінилось — гроші лише перейшли між замовленнями
    expect(sum(await customerLedger())).toBe(before);
    const st = await sideState(db, { account: 'customer', party: customerId, orderId: copy });
    expect(st).toMatchObject({ received: 1326, open: 0 });

    // Шар замовлення
    expect(await orderPaid(copy)).toEqual({ paid: 1326, confirmed: true });
    expect(await orderPaid(lost)).toEqual({ paid: 0, confirmed: false });
    const { data: rows } = await db.from('order_payments').select('order_id, amount, payment_mode, doc_id').in('order_id', [lost, copy]).eq('payment_mode', 'adjustment');
    expect(rows).toHaveLength(2);
    expect(rows!.every(r => r.doc_id === res.id)).toBe(true);

    await assertInvariants();
  }, 30000);

  it('межа: зняти більше, ніж отримано по замовленню — відмова без запису', async () => {
    const countBefore = (await listDebtAdjustments(db, { limit: 500 })).length;
    await expect(createDebtAdjustment({
      lines: [{ op: 'transfer', from: { account: 'customer', party: customerId, orderId: copy }, to: { account: 'customer', party: customerId, orderId: lost }, amount: 2000 }],
      createdBy: 'test',
    })).rejects.toThrow(/отримано лише/);
    expect((await listDebtAdjustments(db, { limit: 500 })).length).toBe(countBefore);
    expect(sum(await customerLedger(copy))).toBe(0);
  }, 30000);

  it('скасування обертає проводки і шар замовлення', async () => {
    const before = sum(await customerLedger());
    await cancelDebtAdjustment(docIds[0], 'test', 'помилково');
    expect(sum(await customerLedger(copy))).toBe(1326);   // копія знову винна
    expect(sum(await customerLedger(lost))).toBe(0);      // оригінал знову оплачений
    expect(sum(await customerLedger())).toBe(before);
    expect(await orderPaid(copy)).toEqual({ paid: 0, confirmed: false });
    expect(await orderPaid(lost)).toEqual({ paid: 1326, confirmed: true });
    const [doc] = await listDebtAdjustments(db, { id: docIds[0] });
    expect(doc.status).toBe('cancelled');
    expect(doc.lines[0].reversed).toBe(true);
    // Повторне скасування — відмова, повторних проводок немає
    await expect(cancelDebtAdjustment(docIds[0], 'test')).rejects.toThrow(/уже скасовано/);
    await assertInvariants();
  }, 30000);
});

describe('КБ — взаємозалік і списання', () => {
  it('взаємозалік: борг клієнта гаситься нашим боргом постачальнику; межа — наш борг', async () => {
    const order = await makeSoldOrder(500);
    // Ми винні постачальнику 300 (як дропшип-борг при відвантаженні)
    await recordTxn({
      debitAccount: 'inventory_transit', creditAccount: 'supplier', creditParty: String(supplierId), amount: 300,
      docType: 'sale', description: '[TEST] борг постачальнику', idempotencyKey: `test-payable:${order}`, createdBy: 'test',
    });
    const supBefore = (await sideState(db, { account: 'supplier', party: String(supplierId) })).balance;

    await expect(createDebtAdjustment({
      lines: [{ op: 'offset', customer: { account: 'customer', party: customerId, orderId: order }, supplier: { account: 'supplier', party: String(supplierId) }, amount: 400 }],
      createdBy: 'test',
    })).rejects.toThrow(/ми винні лише/);

    const res = await createDebtAdjustment({
      lines: [{ op: 'offset', customer: { account: 'customer', party: customerId, orderId: order }, supplier: { account: 'supplier', party: String(supplierId) }, amount: 300 }],
      createdBy: 'test',
    });
    docIds.push(res.id);
    expect(sum(await customerLedger(order))).toBe(200);
    expect((await sideState(db, { account: 'supplier', party: String(supplierId) })).balance).toBe(Math.round((supBefore + 300) * 100) / 100);
    expect((await orderPaid(order)).paid).toBe(300);   // залік = «оплачено» на 300
    await assertInvariants();
  }, 30000);

  it('списання: прощення залишку боргу по замовленню — DR bad_debt (витрата) / CR клієнт; повторне — відмова', async () => {
    const order = await makeSoldOrder(120);
    const res = await createDebtAdjustment({
      lines: [{ op: 'write_off', side: { account: 'customer', party: customerId, orderId: order }, kind: 'forgive', amount: 120, note: 'копійки' }],
      createdBy: 'test',
    });
    docIds.push(res.id);
    expect(sum(await customerLedger(order))).toBe(0);
    const { data: corr } = await db.from('money_entries').select('amount').eq('doc_id', res.id).eq('account_type', 'bad_debt');
    expect(sum(corr ?? [])).toBe(120);
    await expect(createDebtAdjustment({
      lines: [{ op: 'write_off', side: { account: 'customer', party: customerId, orderId: order }, kind: 'forgive', amount: 1 }],
      createdBy: 'test',
    })).rejects.toThrow(/відкритий борг по замовленню лише/);
    await assertInvariants();
  }, 30000);
});

describe('КБ — сторона «партнер» (баланс дропшипера, міграція 121)', () => {
  let order: string;
  let docId: string;

  async function cabinet(): Promise<number> {
    const { data } = await db.from('customers').select('balance').eq('id', partnerId!).single();
    return Number(data?.balance ?? 0);
  }
  async function partnerLedger(): Promise<number> {
    const { data } = await db.from('money_entries').select('amount').eq('account_type', 'partner').eq('counterparty_id', partnerId!).limit(1000);
    return sum(data ?? []);
  }

  it('партнер поповнив баланс на 500 (кабінет і леджер узгоджені)', async () => {
    const { data: p, error } = await db.from('customers').insert({
      name: '[TEST] Дропшипер КБ', type: 'dropship_partner', price_tier: 'drop', phone: '+380000000004',
    }).select('id').single();
    if (error || !p) throw new Error('partner insert: ' + error?.message);
    partnerId = p.id as string;
    // Поповнення переказом: рядок кабінету (тригер підніме customers.balance) + проводка DR bank / CR partner
    const { error: tErr } = await db.from('partner_balance_transactions').insert({
      customer_id: partnerId, tx_type: 'top_up', amount: 500, description: '[TEST] поповнення', created_by: 'test', external_ref: `test-topup:${partnerId}`,
    });
    if (tErr) throw new Error('top_up insert: ' + tErr.message);
    await recordTxn({
      debitAccount: 'bank', creditAccount: 'partner', creditParty: partnerId, amount: 500,
      docType: 'partner_topup', description: '[TEST] поповнення', idempotencyKey: `test-topup:${partnerId}`, createdBy: 'test',
    });
    expect(await cabinet()).toBe(500);
    expect(await partnerLedger()).toBe(-500);
    // Тригера-дзеркала більше немає: рядок кабінету не породив зайвих проводок
    const { data: mirrored } = await db.from('money_entries').select('id').eq('counterparty_id', partnerId).eq('account_type', 'partner');
    expect(mirrored).toHaveLength(1);
    const st = await sideState(db, { account: 'partner', party: partnerId });
    expect(st).toEqual({ balance: -500, cabinet: 500 });
  }, 30000);

  it('балансом партнера закрити замовлення клієнта на 300: кабінет 200, замовлення оплачене на 300', async () => {
    order = await makeSoldOrder(450);
    const res = await createDebtAdjustment({
      lines: [{ op: 'transfer', from: { account: 'partner', party: partnerId! }, to: { account: 'customer', party: customerId, orderId: order }, amount: 300, note: 'за рахунок балансу' }],
      notes: '[TEST] партнер → клієнт', createdBy: 'test',
    });
    docId = res.id; docIds.push(res.id);
    expect(await cabinet()).toBe(200);
    expect(await partnerLedger()).toBe(-200);
    expect(sum(await customerLedger(order))).toBe(150);
    expect(await orderPaid(order)).toEqual({ paid: 300, confirmed: false });
    const { data: adj } = await db.from('partner_balance_transactions').select('tx_type, amount, external_ref').eq('customer_id', partnerId!).eq('tx_type', 'adjustment');
    expect(adj?.map(a => ({ ...a, amount: Number(a.amount) }))).toEqual([{ tx_type: 'adjustment', amount: -300, external_ref: `debt-adj:${res.id}:1:${partnerId}` }]);
    await assertInvariants();
  }, 30000);

  it('межа — баланс кабінету: ще 300 зняти не можна', async () => {
    await expect(createDebtAdjustment({
      lines: [{ op: 'transfer', from: { account: 'partner', party: partnerId! }, to: { account: 'customer', party: customerId, orderId: order }, amount: 300 }],
      createdBy: 'test',
    })).rejects.toThrow(/на балансі партнера лише 200,00/);
    // Звичайний клієнт стороною «партнер» — відмова
    await expect(createDebtAdjustment({
      lines: [{ op: 'write_off', side: { account: 'partner', party: customerId }, kind: 'forgive', amount: 1 }],
      createdBy: 'test',
    })).rejects.toThrow(/не дропшип-партнер/);
    expect(await cabinet()).toBe(200);
  }, 30000);

  it('компенсація партнеру 50: DR bad_debt / CR partner, кабінет 250', async () => {
    const res = await createDebtAdjustment({
      lines: [{ op: 'write_off', side: { account: 'partner', party: partnerId! }, kind: 'forgive', amount: 50, note: 'загублена посилка' }],
      createdBy: 'test',
    });
    docIds.push(res.id);
    expect(await cabinet()).toBe(250);
    expect(await partnerLedger()).toBe(-250);
    const { data: bd } = await db.from('money_entries').select('amount').eq('doc_id', res.id).eq('account_type', 'bad_debt');
    expect(sum(bd ?? [])).toBe(50);
    const [doc] = await listDebtAdjustments(db, { id: res.id });
    expect(doc.lines[0].debit.label).toMatch(/Списання боргів/);
    expect(doc.lines[0].credit.label).toMatch(/партнер/);
    await assertInvariants();
  }, 30000);

  it('скасування перенесення повертає баланс партнера і відкриває замовлення', async () => {
    await cancelDebtAdjustment(docId, 'test', 'помилково');
    expect(await cabinet()).toBe(550);
    expect(await partnerLedger()).toBe(-550);
    expect(sum(await customerLedger(order))).toBe(450);
    expect(await orderPaid(order)).toEqual({ paid: 0, confirmed: false });
    const { data: adj } = await db.from('partner_balance_transactions').select('amount, external_ref').eq('customer_id', partnerId!).eq('tx_type', 'adjustment').order('id');
    expect(adj?.map(a => Number(a.amount))).toEqual([-300, 50, 300]);
    expect(adj?.[2].external_ref).toBe(`debt-adj-rev:${docId}:1:${partnerId}`);
    await assertInvariants();
  }, 30000);
});

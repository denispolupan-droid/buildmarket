/**
 * Integration test — переадресація посилки в інше замовлення.
 *
 * Живий кейс 15.10.2026 (#26101011 → #26101063): покупець не забрав посилку, її
 * переадресували іншому покупцю, і нове замовлення відвантажили з тією самою ЕН.
 * Нова РН нарахувала другий борг перед постачальником за один фізичний товар.
 * redirectTransit має зняти транзит і борг СТАРОГО замовлення, лишивши рівно
 * один борг — на новій РН, і скасувати стару чернетку.
 *
 * Запуск:  npm run test:integration
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createSaleDraft } from '../../lib/accounting/dropship';
import { redirectTransit, transitBalanceForOrder } from '../../lib/accounting/transit';
import { loadFixtures } from './fixtures';

let db: SupabaseClient;
let supplierId: number;
let testSku: string;
const createdOrders: string[] = [];

beforeAll(async () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  db = createClient(url, key, { auth: { persistSession: false } });
  const fx = await loadFixtures(db);
  supplierId = fx.supplierId;
  testSku    = fx.sku;
});

afterAll(async () => {
  if (!db) return;
  if (createdOrders.length) await db.from('orders').delete().in('id', createdOrders);
  const { error } = await db.rpc('reset_accounting_test_data');
  if (error) console.error('Cleanup error:', error.message);
});

async function shipParcel(ttn: string, status: 'shipped' | 'cancelled', price = 300) {
  const { data: order, error } = await db.from('orders').insert({
    contact: 'REDIRECT тест', phone: '+380000000000', email: 'redirect@test.local',
    status: 'shipped', total_price: price, channel_code: 'website',
    delivery_type: 'nova', payment_type: 'cod', tracking_number: ttn,
    items: [{ sku: testSku, name: 'redirect', brand: 'test', qty: 1, price }],
  }).select('id, order_number').single();
  if (error) throw new Error('order insert: ' + error.message);
  createdOrders.push(order.id as string);

  const docId = await createSaleDraft({
    order_id: order.id as string,
    order_number: order.order_number as number,
    order_items: [{ sku: testSku, name: 'redirect', brand: 'test', qty: 1, price }],
    tracking_number: ttn,
    shipping_supplier_id: supplierId,
    confirmed_by: 'redirect-test',
  });
  await db.from('acc_documents').update({ meta: { test: true } }).eq('id', docId);
  if (status === 'cancelled') await db.from('orders').update({ status }).eq('id', order.id);
  return { orderId: order.id as string, orderNumber: order.order_number as number, docId };
}

async function netByAccount(orderId: string, account: string) {
  const { data } = await db.from('money_entries').select('amount').eq('order_id', orderId).eq('account_type', account);
  return Math.round((data ?? []).reduce((s, r) => s + Number(r.amount), 0) * 100) / 100;
}

describe('Переадресація посилки: один товар — один борг', () => {
  it('борг і транзит старого замовлення знімаються, нова РН лишається єдиною', async () => {
    const ttn = '95' + String(Date.now()).slice(-12);
    const old = await shipParcel(ttn, 'cancelled');
    const fresh = await shipParcel(ttn, 'shipped');

    // До: два борги за один пістолет
    expect(await netByAccount(old.orderId, 'supplier')).toBeLessThan(0);
    expect(await netByAccount(fresh.orderId, 'supplier')).toBeLessThan(0);

    const moved = await redirectTransit({
      fromOrderId:   old.orderId,
      toOrderNumber: fresh.orderNumber,
      toDocId:       fresh.docId,
      createdBy:     'redirect-test',
    });
    expect(moved.docIds).toEqual([old.docId]);
    expect(moved.released).toBeGreaterThan(0);

    expect(await netByAccount(old.orderId, 'supplier'), 'борг старого має обнулитись').toBe(0);
    expect(await transitBalanceForOrder(old.orderId), 'транзит старого має закритись').toBe(0);
    expect(await netByAccount(fresh.orderId, 'supplier'), 'борг нового лишається').toBeLessThan(0);
    expect(await transitBalanceForOrder(fresh.orderId), 'транзит нового лишається').toBeGreaterThan(0);

    // Сторно погасило стару накладну в рознесенні
    const { data: charge } = await db.from('money_entries').select('id, amount')
      .eq('doc_id', old.docId).eq('account_type', 'supplier').lt('amount', 0).limit(1).maybeSingle();
    const { data: allocs } = await db.from('supplier_payment_allocations').select('amount').eq('charge_entry_id', charge!.id);
    expect(Math.round((allocs ?? []).reduce((s, a) => s + Number(a.amount), 0) * 100))
      .toBe(Math.round(Math.abs(Number(charge!.amount)) * 100));

    const { data: oldDoc } = await db.from('acc_documents').select('status').eq('id', old.docId).single();
    expect(oldDoc?.status, 'стара чернетка скасована').toBe('cancelled');
    const { data: newDoc } = await db.from('acc_documents').select('status').eq('id', fresh.docId).single();
    expect(newDoc?.status, 'нова чернетка живе далі').toBe('draft');

    // Повтор — ідемпотентний: нічого не висить, нічого не дублюється
    const again = await redirectTransit({ fromOrderId: old.orderId, toOrderNumber: fresh.orderNumber, toDocId: fresh.docId });
    expect(again.docIds).toEqual([]);
    expect(await netByAccount(old.orderId, 'supplier')).toBe(0);
  }, 60000);
});

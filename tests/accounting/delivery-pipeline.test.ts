/**
 * Конвеєр синку доставки (lib/delivery/sync.ts, DeliveryProvider) на тестовій базі
 * з ФІКТИВНИМ перевізником: без мережі, але з живими РН, леджером і outbox.
 *  - «вручено» → РН посилки проведена за ЕН, витрата перевізника записана з ключем
 *    по ЕН, замовлення «Доставлено», покупцю — події outbox (email);
 *  - повторний прогін нічого не дублює (замовлення вже не shipped, ключ витрати той самий).
 *
 * Запуск: npm run test:integration
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createSaleDraft } from '../../lib/accounting/dropship';
import { syncDeliveryStatuses } from '../../lib/delivery/sync';
import type { DeliveryProvider } from '../../lib/delivery/types';
import { loadFixtures } from './fixtures';

let db: SupabaseClient;
let supplierId: number;
let testSku: string;
let orderId: string;
let orderNumber: number;
const TTN = '98' + String(Date.now()).slice(-12);
const DELIVERY_TYPE = 'pipeline_test_carrier';

const fakeProvider: DeliveryProvider = {
  code: 'np',  // код лише для лічильників результату
  label: 'Тестовий перевізник',
  handles: t => t === DELIVERY_TYPE,
  notifiesParcelEvents: false,
  async track(orders) {
    return new Map(orders.map(o => [o.id, {
      statusText: 'TEST: вручено', phase: 'delivered' as const, carrierAccepted: true,
      deliveredAt: new Date().toISOString(),
      patch: { np_delivery_cost: 15 },
      expenses: [{ amount: 15, creditParty: 'test:carrier', docType: 'delivery_cost', idempotencyKey: `test-delivery:${TTN}`, description: 'Тестова доставка за наш рахунок' }],
    }]));
  },
};

beforeAll(async () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  db = createClient(url, key, { auth: { persistSession: false } });
  const fx = await loadFixtures(db);
  supplierId = fx.supplierId;
  testSku = fx.sku;
  await db.from('supplier_sku_map').delete().eq('supplier_sku', 'PIPE-' + testSku);
  const { error: mapErr } = await db.from('supplier_sku_map').insert({ our_sku: testSku, supplier_id: supplierId, supplier_sku: 'PIPE-' + testSku });
  if (mapErr) throw new Error('supplier_sku_map: ' + mapErr.message);

  const { data: order, error } = await db.from('orders').insert({
    contact: 'PIPELINE тест', phone: '+380000000004', email: 'pipeline@test.local',
    status: 'shipped', channel_code: 'website', delivery_type: DELIVERY_TYPE, payment_type: 'cod',
    tracking_number: TTN, shipped_at: new Date().toISOString(),
    items: [{ sku: testSku, name: 'pipeline', brand: 'test', qty: 1, price: 200 }],
  }).select('id, order_number').single();
  if (error) throw new Error('order insert: ' + error.message);
  orderId = order.id as string;
  orderNumber = order.order_number as number;
  await createSaleDraft({ order_id: orderId, order_number: orderNumber, order_items: [{ sku: testSku, name: 'pipeline', brand: 'test', qty: 1, price: 200 }], tracking_number: TTN, shipping_supplier_id: supplierId, confirmed_by: 'pipeline' });
});

afterAll(async () => {
  if (!db) return;
  if (orderId) {
    await db.from('outbox_events').delete().eq('aggregate_id', orderId);
    await db.from('orders').delete().eq('id', orderId);
  }
  await db.from('supplier_sku_map').delete().eq('supplier_sku', 'PIPE-' + testSku);
  const { error } = await db.rpc('reset_accounting_test_data');
  if (error) console.error('Cleanup error:', error.message);
});

describe('конвеєр доставки з фіктивним перевізником', () => {
  it('вручено → РН проведена, витрата записана, «Доставлено», події outbox покупцю', async () => {
    const r = await syncDeliveryStatuses('test:pipeline', { providers: [fakeProvider] });
    expect(r.updated).toBeGreaterThanOrEqual(1);

    const { data: o } = await db.from('orders').select('status, carrier_status_text, carrier_accepted_at, carrier_delivered_at, np_delivery_cost, delivered_at').eq('id', orderId).single();
    expect(o).toMatchObject({ status: 'delivered', carrier_status_text: 'TEST: вручено', np_delivery_cost: 15 });
    expect(o!.carrier_accepted_at).toBeTruthy();
    expect(o!.carrier_delivered_at).toBeTruthy();
    expect(o!.delivered_at).toBeTruthy();

    const { data: docs } = await db.from('acc_documents').select('status').eq('order_id', orderId).eq('doc_type', 'sale');
    expect(docs!.map(d => d.status)).toEqual(['confirmed']);

    const { data: exp } = await db.from('money_entries').select('amount, account_type').eq('idempotency_key', `test-delivery:${TTN}`);
    expect(exp!.some(e => e.account_type === 'logistics' && Number(e.amount) === 15)).toBe(true);

    const { data: ev } = await db.from('outbox_events').select('handler, payload, status').eq('aggregate_id', orderId);
    const notify = (ev ?? []).filter(e => e.handler === 'customer.notify_status');
    expect(notify.map(e => (e.payload as { via: string }).via).sort()).toEqual(['email']);   // telegram_chat_id немає
    expect(notify.every(e => (e.payload as { status: string }).status === 'delivered')).toBe(true);
  });

  it('повторний прогін нічого не дублює', async () => {
    const r = await syncDeliveryStatuses('test:pipeline', { providers: [fakeProvider] });
    expect(r.updated).toBe(0);
    const { count } = await db.from('money_entries').select('id', { count: 'exact', head: true }).eq('idempotency_key', `test-delivery:${TTN}`);
    expect(count).toBe(1);
  });
});

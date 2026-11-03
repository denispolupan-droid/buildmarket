/**
 * importMarketplaceOrder (lib/marketplace/import-order) — спільний імпорт
 * замовлення площадки, який замінив три копії в prom/rozetka/epicentr-sync.
 * Перевіряємо в живій базі те, чого не бачать типи: рядок створюється з
 * потрібними колонками, повторний імпорт того ж externalId — «exists» без
 * дубля, клієнт за тим самим телефоном не дублюється, знімок має _commission.
 *
 * Запуск: npm run test:integration
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { importMarketplaceOrder } from '../../lib/marketplace/import-order';
import type { MarketplaceAdapter } from '../../lib/marketplace/adapter';

type Raw = { id: number; phone: string; name: string; cancelled?: boolean };

const PHONE = '+380000000' + String(Date.now()).slice(-3);
const adapter: MarketplaceAdapter<Raw> = {
  code: 'prom',
  idColumn: 'prom_order_id',
  dataColumn: 'prom_data',
  externalId: r => r.id,
  label: r => String(r.id),
  cancelledOnImport: r => !!r.cancelled,
  mapOrder: r => ({
    contact: r.name, phone: r.phone, email: '', delivery_type: 'nova', delivery_subtype: 'warehouse',
    delivery_address: 'м. Тест, відділення 1', delivery_city_name: 'Тест', payment_type: 'cod', paid: false,
    comment: null, items: [{ sku: 'TEST-MP', name: '[TEST] товар', brand: 'test', qty: 2, price: 150 }], total_price: 300,
  }),
  snapshot: r => ({ id: r.id, status: 'pending', _test: true }),
  estimateCommission: async items => ({ total_commission: items.reduce((s, i) => s + i.qty * i.price, 0) * 0.1 }),
};

let db: SupabaseClient;
const base = 900_000_000 + (Date.now() % 10_000_000);
const orderIds: string[] = [];
let customerId: string | null = null;

beforeAll(() => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  db = createClient(url, key, { auth: { persistSession: false } });
});

afterAll(async () => {
  if (orderIds.length) await db.from('orders').delete().in('id', orderIds);
  if (customerId) await db.from('customers').delete().eq('id', customerId);
});

describe('importMarketplaceOrder — спільний імпорт замовлень площадок (03.11.2026)', () => {
  it('створює замовлення з колонками площадки, клієнтом і знімком _commission', async () => {
    const res = await importMarketplaceOrder(db, adapter, { id: base + 1, phone: PHONE, name: '[TEST] MP buyer' });
    expect(res.status).toBe('created');
    if (res.status !== 'created') return;
    orderIds.push(res.orderId); customerId = res.customerId;
    expect(customerId).toBeTruthy();

    const { data: o } = await db.from('orders')
      .select('channel_code, status, prom_order_id, prom_data, customer_id, contact, phone, total_price, payment_confirmed, amount_paid, items')
      .eq('id', res.orderId).single();
    expect(o).toMatchObject({ channel_code: 'prom', status: 'new', prom_order_id: base + 1, customer_id: customerId, contact: '[TEST] MP buyer', phone: PHONE, total_price: 300, payment_confirmed: false, amount_paid: 0 });
    expect((o!.prom_data as { _commission: { total_commission: number } })._commission.total_commission).toBe(30);
    expect((o!.items as unknown[]).length).toBe(1);
  });

  it('повторний імпорт того ж externalId → exists, без другого рядка', async () => {
    const res = await importMarketplaceOrder(db, adapter, { id: base + 1, phone: PHONE, name: '[TEST] MP buyer' });
    expect(res).toEqual({ status: 'exists', orderId: orderIds[0] });
    const { count } = await db.from('orders').select('id', { count: 'exact', head: true }).eq('prom_order_id', base + 1);
    expect(count).toBe(1);
  });

  it('той самий телефон у іншому замовленні → той самий клієнт', async () => {
    const res = await importMarketplaceOrder(db, adapter, { id: base + 2, phone: PHONE.replace('+38', ''), name: '[TEST] MP buyer' });
    expect(res.status).toBe('created');
    if (res.status !== 'created') return;
    orderIds.push(res.orderId);
    expect(res.customerId).toBe(customerId);
  });

  it('скасоване до імпорту — skipped, рядок не створюється', async () => {
    const res = await importMarketplaceOrder(db, adapter, { id: base + 3, phone: PHONE, name: '[TEST] MP buyer', cancelled: true });
    expect(res).toEqual({ status: 'skipped', reason: 'cancelled' });
    const { count } = await db.from('orders').select('id', { count: 'exact', head: true }).eq('prom_order_id', base + 3);
    expect(count).toBe(0);
  });
});

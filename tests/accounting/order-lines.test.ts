/**
 * order_lines, етап C (міграція 160) на тестовій базі:
 *  - insert замовлення з items: total_price ставить BEFORE-тригер з рядків, а не код;
 *  - order_set_lines: рядки замінено, items перебудовано з рядків (канонічна форма),
 *    total_price перераховано, patch (discount_pct) записано тим самим запитом;
 *  - невалідні рядки / невідома колонка patch — помилка і жодних змін;
 *  - дзеркало items→lines (136) далі працює для прямого UPDATE items (страховка).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { setOrderLines } from '../../lib/orders/lines';

let db: SupabaseClient;
let orderId: string;

beforeAll(async () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  db = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await db.from('orders').insert({
    contact: 'LINES тест', phone: '+380000000002', email: 'lines@test.local',
    status: 'new', channel_code: 'website', delivery_type: 'nova_poshta', payment_type: 'cod',
    // Сума від клієнта навмисно неправильна — база має поставити свою
    total_price: 999,
    items: [{ sku: 'TEST', name: 'lines', brand: 'test', qty: 2, price: 10.5 }],
  }).select('id, total_price').single();
  if (error) throw new Error('order insert: ' + error.message);
  orderId = data.id as string;
  expect(Number(data.total_price)).toBe(21);
});

afterAll(async () => {
  if (orderId) await db.from('orders').delete().eq('id', orderId);
});

const lines = (id: string) => db.from('order_lines').select('sort_order, sku, qty, price, price_base, is_bonus, meta').eq('order_id', id).order('sort_order');

describe('order_set_lines', () => {
  it('замінює рядки, перебудовує items і total_price, пише patch', async () => {
    const total = await setOrderLines(db, orderId, [
      { sku: 'TEST', name: 'lines', brand: 'test', qty: 1, price: 90, price_base: 100, cost_price: 70 },
      { sku: '', name: 'Доставка', qty: 1, price: 0, is_bonus: true },
    ], { discount_pct: 10 });
    expect(total).toBe(90);

    const { data: o } = await db.from('orders').select('total_price, discount_pct, items').eq('id', orderId).single();
    expect(Number(o!.total_price)).toBe(90);
    expect(Number(o!.discount_pct)).toBe(10);
    const items = o!.items as Record<string, unknown>[];
    expect(items).toHaveLength(2);
    // Канонічна форма з рядків: числа числами, допоміжні ключі з meta збережені
    expect(items[0]).toMatchObject({ sku: 'TEST', qty: 1, price: 90, price_base: 100, cost_price: 70, is_bonus: false });
    expect(items[1]).toMatchObject({ sku: '', name: 'Доставка', qty: 1, price: 0, is_bonus: true });
    expect('price_base' in items[1]).toBe(false);

    const { data: ls } = await lines(orderId);
    expect(ls).toHaveLength(2);
    expect(ls![0]).toMatchObject({ sku: 'TEST', price_base: 100 });
    expect((ls![0].meta as Record<string, unknown>).cost_price).toBe(70);
  });

  it('невалідні рядки — помилка, нічого не змінено', async () => {
    const { error } = await db.rpc('order_set_lines', { p_order_id: orderId, p_lines: [{ sku: 'TEST', qty: 0, price: 1 }], p_patch: {} });
    expect(error?.message).toContain('кількість');
    const { error: e2 } = await db.rpc('order_set_lines', { p_order_id: orderId, p_lines: [], p_patch: {} });
    expect(e2?.message).toContain('непорожній');
    const { data: o } = await db.from('orders').select('total_price').eq('id', orderId).single();
    expect(Number(o!.total_price)).toBe(90);
  });

  it('patch з невідомою колонкою або з items/total_price — відмова', async () => {
    const { error } = await db.rpc('order_set_lines', { p_order_id: orderId, p_lines: [{ sku: 'TEST', qty: 1, price: 5 }], p_patch: { nope: 1 } });
    expect(error?.message).toContain('невідому колонку');
    const { error: e2 } = await db.rpc('order_set_lines', { p_order_id: orderId, p_lines: [{ sku: 'TEST', qty: 1, price: 5 }], p_patch: { total_price: 1 } });
    expect(e2?.message).toContain('невідому колонку');
    const { data: o } = await db.from('orders').select('total_price').eq('id', orderId).single();
    expect(Number(o!.total_price)).toBe(90);
  });

  it('прямий UPDATE items (страховка): дзеркало будує рядки, тригер ставить суму', async () => {
    await db.from('orders').update({ items: [{ sku: 'TEST', name: 'x', brand: 'y', qty: 3, price: 2 }], total_price: 1 }).eq('id', orderId);
    const { data: o } = await db.from('orders').select('total_price').eq('id', orderId).single();
    expect(Number(o!.total_price)).toBe(6);
    const { data: ls } = await lines(orderId);
    expect(ls).toHaveLength(1);
    expect(Number(ls![0].qty)).toBe(3);
  });
});

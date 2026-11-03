/**
 * Outbox (docs/OUTBOX-PLAN.md, фаза 0–1) на тестовій базі:
 *  - order_transition_outbox пише статус і подію атомарно; невідома колонка —
 *    помилка і жодного рядка outbox; дубль dedupe_key мовчки пропускається;
 *  - outbox_claim бере по одній найстарішій pending-події на замовлення, орендує
 *    її і збільшує attempts; заорендовану другий раз не віддає;
 *  - sweepOutbox: подія для скасованого замовлення стає skipped (обробник не
 *    ходить на площадку).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { sweepOutbox } from '../../lib/outbox/sweeper';

let db: SupabaseClient;
let orderId: string;
const K = `t-${Date.now()}`;

beforeAll(async () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  db = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await db.from('orders').insert({
    contact: 'OUTBOX тест', phone: '+380000000001', email: 'outbox@test.local',
    status: 'confirmed', total_price: 100, channel_code: 'website', delivery_type: 'nova_poshta', payment_type: 'cod',
    items: [{ sku: 'TEST', name: 'outbox', brand: 'test', qty: 1, price: 100 }],
  }).select('id').single();
  if (error) throw new Error('order insert: ' + error.message);
  orderId = data.id as string;
});

afterAll(async () => {
  await db.from('outbox_events').delete().like('dedupe_key', `${K}%`);
  if (orderId) await db.from('orders').delete().eq('id', orderId);
});

describe('order_transition_outbox', () => {
  it('статус і подія — разом; дубль dedupe_key не плодить рядків', async () => {
    const ev = { event: 'order.shipped', handler: 'mp.push_ttn', payload: { channel: 'prom', external_id: 1, order_number: 1, ttn: '2045', delivery_type: 'nova_poshta', status: 'shipped', fully_shipped: true, cabinet_status: null }, dedupe_key: `${K}:a` };
    const { data: n, error } = await db.rpc('order_transition_outbox', { p_order_id: orderId, p_patch: { status: 'shipped', shipped_at: new Date().toISOString() }, p_events: [ev] });
    expect(error).toBeNull();
    expect(n).toBe(1);
    const { data: o } = await db.from('orders').select('status, shipped_at').eq('id', orderId).single();
    expect(o?.status).toBe('shipped');
    expect(o?.shipped_at).not.toBeNull();

    const { data: again } = await db.rpc('order_transition_outbox', { p_order_id: orderId, p_patch: {}, p_events: [ev] });
    expect(again).toBe(0);
    const { count } = await db.from('outbox_events').select('id', { count: 'exact', head: true }).eq('dedupe_key', `${K}:a`);
    expect(count).toBe(1);
  });

  it('невідома колонка — помилка, подія не записується', async () => {
    const { error } = await db.rpc('order_transition_outbox', { p_order_id: orderId, p_patch: { no_such_column: 1 }, p_events: [{ event: 'order.shipped', handler: 'mp.push_ttn', payload: {}, dedupe_key: `${K}:bad` }] });
    expect(error?.message).toMatch(/невідому колонку/);
    const { count } = await db.from('outbox_events').select('id', { count: 'exact', head: true }).eq('dedupe_key', `${K}:bad`);
    expect(count).toBe(0);
  });

  it('подія без handler — помилка', async () => {
    const { error } = await db.rpc('order_transition_outbox', { p_order_id: orderId, p_patch: {}, p_events: [{ event: 'x', dedupe_key: `${K}:nohandler` }] });
    expect(error?.message).toMatch(/без event\/handler\/dedupe_key/);
  });
});

describe('outbox_claim і sweeper', () => {
  it('claim: по одній події на замовлення, оренда й attempts; повторний claim не віддає заорендовану', async () => {
    await db.rpc('order_transition_outbox', { p_order_id: orderId, p_patch: {}, p_events: [
      { event: 'order.shipped', handler: 'mp.push_ttn', payload: { channel: 'prom', ttn: 'x' }, dedupe_key: `${K}:c1` },
      { event: 'order.shipped', handler: 'mp.push_ttn', payload: { channel: 'rozetka', ttn: 'x' }, dedupe_key: `${K}:c2` },
    ] });
    // подія з першого тесту вже є pending (a) — найстаріша для цього замовлення
    const { data: first, error } = await db.rpc('outbox_claim', { p_limit: 50, p_lease_seconds: 300 });
    expect(error).toBeNull();
    const mine = (first as { aggregate_id: string; dedupe_key: string; attempts: number; locked_until: string | null }[]).filter(r => r.aggregate_id === orderId);
    expect(mine.length).toBe(1);
    expect(mine[0].dedupe_key).toBe(`${K}:a`);
    expect(mine[0].attempts).toBe(1);
    expect(mine[0].locked_until).not.toBeNull();

    const { data: second } = await db.rpc('outbox_claim', { p_limit: 50, p_lease_seconds: 300 });
    const mine2 = (second as { aggregate_id: string }[]).filter(r => r.aggregate_id === orderId);
    expect(mine2.length).toBe(0); // замовлення зайняте орендою — наступну не віддаємо
    // звільняємо оренду, щоб sweeper нижче міг узяти
    await db.from('outbox_events').update({ locked_until: null }).like('dedupe_key', `${K}%`);
  });

  it('sweeper: скасоване замовлення — події skipped, на площадку не ходимо', async () => {
    await db.from('orders').update({ status: 'cancelled' }).eq('id', orderId);
    // три проходи — по одній події на замовлення за тік
    for (let i = 0; i < 3; i++) await sweepOutbox(db as never, 50);
    const { data: rows } = await db.from('outbox_events').select('dedupe_key, status, last_error').like('dedupe_key', `${K}:%`).in('dedupe_key', [`${K}:a`, `${K}:c1`, `${K}:c2`]);
    expect(rows?.length).toBe(3);
    for (const r of rows ?? []) {
      expect(r.status).toBe('skipped');
      expect(r.last_error).toMatch(/скасовано/);
    }
  });
});

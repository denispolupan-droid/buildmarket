import { describe, it, expect } from 'vitest';
import { RETRY_DELAYS_MIN, MAX_ATTEMPTS, isExhausted, nextDelayMinutes, nextAttemptAt } from '../lib/outbox/backoff';
import { ttnPushEvents } from '../lib/outbox/enqueue';

describe('outbox backoff (рішення власника 03.11: 1/5/15/30 хв, 5 спроб)', () => {
  it('паузи між спробами — 1, 5, 15, 30 хв, після 5-ї спроб немає', () => {
    expect(RETRY_DELAYS_MIN).toEqual([1, 5, 15, 30]);
    expect(MAX_ATTEMPTS).toBe(5);
    expect(nextDelayMinutes(1)).toBe(1);
    expect(nextDelayMinutes(2)).toBe(5);
    expect(nextDelayMinutes(3)).toBe(15);
    expect(nextDelayMinutes(4)).toBe(30);
    expect(nextDelayMinutes(5)).toBeNull();
    expect(isExhausted(4)).toBe(false);
    expect(isExhausted(5)).toBe(true);
  });
  it('разом ≈ година до failed', () => {
    expect(RETRY_DELAYS_MIN.reduce((s, m) => s + m, 0)).toBe(51);
  });
  it('nextAttemptAt рахує від now', () => {
    const now = Date.parse('2026-11-03T10:00:00Z');
    expect(nextAttemptAt(2, now)).toBe('2026-11-03T10:05:00.000Z');
    expect(nextAttemptAt(5, now)).toBeNull();
  });
});

describe('ttnPushEvents — події «ЕН на площадку» з /ship', () => {
  const base = { order_number: 26110001, prom_order_id: null, rozetka_order_id: null, epicentr_order_id: null, delivery_type: 'nova_poshta', rozetka_cabinet_status: null };

  it('без ЕН подій немає', () => {
    expect(ttnPushEvents('o1', { ...base, prom_order_id: 1 }, null, 'shipped', true)).toEqual([]);
  });
  it('сайтове замовлення без площадок — подій немає', () => {
    expect(ttnPushEvents('o1', base, '2045', 'shipped', true)).toEqual([]);
  });
  it('Prom: лише для перевізників, які приймають ЕН; Rozetka: лише повна відгрузка', () => {
    const ev = ttnPushEvents('o1', { ...base, prom_order_id: 7, rozetka_order_id: 9, epicentr_order_id: 'e1' }, '2045', 'shipped', true);
    expect(ev.map(e => e.payload.channel)).toEqual(['prom', 'epicentr', 'rozetka']);
    expect(ev.every(e => e.handler === 'mp.push_ttn' && e.event === 'order.shipped')).toBe(true);
    expect(new Set(ev.map(e => e.dedupe_key)).size).toBe(3);

    const partial = ttnPushEvents('o1', { ...base, prom_order_id: 7, rozetka_order_id: 9 }, '2045', 'shipped', false);
    expect(partial.map(e => e.payload.channel)).toEqual(['prom']);
    expect(partial[0].payload.fully_shipped).toBe(false);

    // «Магазини Rozetka» через Prom (PRM-…) — Prom веде сам, пушити не можна
    expect(ttnPushEvents('o1', { ...base, prom_order_id: 7, delivery_type: 'rozetka_delivery' }, 'PRM-1', 'shipped', true)).toEqual([]);
  });
  it('dedupe_key: та сама ЕН — той самий ключ, нова ЕН — новий', () => {
    const a = ttnPushEvents('o1', { ...base, prom_order_id: 7 }, '2045', 'shipped', true)[0].dedupe_key;
    const b = ttnPushEvents('o1', { ...base, prom_order_id: 7 }, '2045', 'shipped', true)[0].dedupe_key;
    const c = ttnPushEvents('o1', { ...base, prom_order_id: 7 }, '2046', 'shipped', true)[0].dedupe_key;
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toContain('o1');
  });
  it('підказка статусу кабінету Rozetka їде в payload', () => {
    const ev = ttnPushEvents('o1', { ...base, rozetka_order_id: 9, rozetka_cabinet_status: 26 }, '2045', 'delivered', true);
    expect(ev[0].payload).toMatchObject({ channel: 'rozetka', cabinet_status: 26, status: 'delivered' });
  });
});

import { describe, it, expect } from 'vitest';
import { RETRY_DELAYS_MIN, MAX_ATTEMPTS, isExhausted, nextDelayMinutes, nextAttemptAt } from '../lib/outbox/backoff';
import { ttnPushEvents, ttnReplacedEvents, statusPushEvents, customerNotifyEvents } from '../lib/outbox/enqueue';
import type { NotifyStatusPayload, PushStatusPayload, PushTtnPayload } from '../lib/outbox/types';

const ttnP = (e: { payload: unknown }) => e.payload as PushTtnPayload;
const stP  = (e: { payload: unknown }) => e.payload as PushStatusPayload;
const ntP  = (e: { payload: unknown }) => e.payload as NotifyStatusPayload;

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
    expect(ev.map(e => ttnP(e).channel)).toEqual(['prom', 'epicentr', 'rozetka']);
    expect(ev.every(e => e.handler === 'mp.push_ttn' && e.event === 'order.shipped')).toBe(true);
    expect(new Set(ev.map(e => e.dedupe_key)).size).toBe(3);

    const partial = ttnPushEvents('o1', { ...base, prom_order_id: 7, rozetka_order_id: 9 }, '2045', 'shipped', false);
    expect(partial.map(e => ttnP(e).channel)).toEqual(['prom']);
    expect(ttnP(partial[0]).fully_shipped).toBe(false);

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
  it('заміна ЕН: подія order.ttn_replaced з force_ttn для всіх каналів', () => {
    const ev = ttnReplacedEvents('o1', { ...base, prom_order_id: 7, rozetka_order_id: 9 }, '2099');
    expect(ev.map(e => e.event)).toEqual(['order.ttn_replaced', 'order.ttn_replaced']);
    expect(ev.every(e => ttnP(e).force_ttn === true && ttnP(e).ttn === '2099')).toBe(true);
  });
});

describe('statusPushEvents — статус на площадку з /confirm і картки (фаза 2)', () => {
  const base = { order_number: 26110001, prom_order_id: null, rozetka_order_id: null, epicentr_order_id: null, delivery_type: 'nova_poshta', rozetka_cabinet_status: 5 };
  const at = new Date('2026-11-08T10:00:30Z');

  it('по події на кожну площадку замовлення; назва події — за статусом', () => {
    const ev = statusPushEvents('o1', { ...base, prom_order_id: 7, rozetka_order_id: 9, epicentr_order_id: 'e1' }, 'confirmed', { at });
    expect(ev.map(e => stP(e).channel)).toEqual(['prom', 'rozetka', 'epicentr']);
    expect(ev.every(e => e.handler === 'mp.push_status' && e.event === 'order.confirmed')).toBe(true);
    expect(stP(ev[1]).cabinet_status).toBe(5);
    expect(statusPushEvents('o1', { ...base, prom_order_id: 7 }, 'cancelled', { at })[0].event).toBe('order.cancelled');
    expect(statusPushEvents('o1', { ...base, prom_order_id: 7 }, 'picking', { at })[0].event).toBe('order.status_changed');
  });
  it('сайтове замовлення — подій немає', () => {
    expect(statusPushEvents('o1', base, 'confirmed', { at })).toEqual([]);
  });
  it('причина скасування Rozetka і ЕН їдуть у payload', () => {
    const ev = statusPushEvents('o1', { ...base, rozetka_order_id: 9 }, 'cancelled', { cancelReason: 17, ttn: '2045', at });
    expect(stP(ev[0])).toMatchObject({ channel: 'rozetka', status: 'cancelled', cancel_reason: 17, ttn: '2045' });
  });
  it('dedupe: той самий статус у ту саму хвилину — один ключ; інша хвилина — новий', () => {
    const a = statusPushEvents('o1', { ...base, prom_order_id: 7 }, 'confirmed', { at })[0].dedupe_key;
    const b = statusPushEvents('o1', { ...base, prom_order_id: 7 }, 'confirmed', { at: new Date('2026-11-08T10:00:59Z') })[0].dedupe_key;
    const c = statusPushEvents('o1', { ...base, prom_order_id: 7 }, 'confirmed', { at: new Date('2026-11-08T10:01:00Z') })[0].dedupe_key;
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});

describe('customerNotifyEvents — сповіщення покупцю по каналах (фаза 2)', () => {
  const o = { order_number: 26110001, tracking_number: '2045', delivery_type: 'nova_poshta', telegram_chat_id: '123', email: 'a@b.ua', phone: '+380501112233', contact: 'Іван', company: null, channel_code: 'website', total_price: 1500 };
  const at = new Date('2026-11-08T10:00:30Z');

  it('окрема подія на кожен канал; канал без адресата пропускається без рядка', () => {
    const ev = customerNotifyEvents('o1', o, 'shipped', ['telegram', 'email', 'sms'], at);
    expect(ev.map(e => ntP(e).via)).toEqual(['telegram', 'email', 'sms']);
    expect(ev.every(e => e.handler === 'customer.notify_status' && e.event === 'order.shipped')).toBe(true);
    expect(ntP(ev[0])).toMatchObject({ order_number: 26110001, ttn: '2045', telegram_chat_id: '123', total_price: 1500 });
    const noTg = customerNotifyEvents('o1', { ...o, telegram_chat_id: null, email: null }, 'confirmed', ['telegram', 'email', 'sms'], at);
    expect(noTg.map(e => ntP(e).via)).toEqual(['sms']);
  });
  it('dedupe по каналу, статусу й хвилині', () => {
    const [tg, em] = customerNotifyEvents('o1', o, 'confirmed', ['telegram', 'email'], at);
    expect(tg.dedupe_key).not.toBe(em.dedupe_key);
    expect(tg.dedupe_key).toContain('telegram');
    expect(customerNotifyEvents('o1', o, 'confirmed', ['telegram'], at)[0].dedupe_key).toBe(tg.dedupe_key);
  });
});

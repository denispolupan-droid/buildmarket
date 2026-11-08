import { describe, it, expect } from 'vitest';
import { providerFor, DELIVERY_PROVIDERS } from '../lib/delivery/registry';
import { npDocUpdate, npPhase } from '../lib/delivery/providers/nova-poshta';
import { rzTrackUpdate } from '../lib/delivery/providers/rz-delivery';
import { rozetkaPointsUpdates, rzSettled } from '../lib/delivery/providers/rozetka-points';
import type { TrackedOrder } from '../lib/delivery/types';

const order = (over: Partial<TrackedOrder> = {}): TrackedOrder => ({
  id: 'o1', order_number: 26110001, status: 'shipped', tracking_number: '2045', carrier_accepted_at: null,
  channel_code: 'website', partner_code: null, rozetka_order_id: null, delivery_type: 'nova_poshta',
  telegram_chat_id: null, flags: [], phone: null, email: null, contact: null, company: null, total_price: 100,
  rz_payment_fee: null, rz_delivery_cost: null, rz_delivery_payer: null, ...over,
});

describe('реєстр перевізників', () => {
  it('delivery_type → провайдер; невідомі типи — Нова Пошта (історична поведінка)', () => {
    expect(providerFor('rozetka_delivery').code).toBe('rozetka');
    expect(providerFor('rz_delivery').code).toBe('rzOwn');
    expect(providerFor('ukrposhta').code).toBe('manual');
    expect(providerFor('meest').code).toBe('manual');
    expect(providerFor('nova_poshta').code).toBe('np');
    expect(providerFor('nova').code).toBe('np');
    expect(providerFor('pickup').code).toBe('np');
    expect(providerFor(null).code).toBe('np');
    expect(new Set(DELIVERY_PROVIDERS.map(p => p.code)).size).toBe(DELIVERY_PROVIDERS.length);
  });
});

describe('Нова Пошта: документ трекінгу → оновлення', () => {
  it('фази за кодами: 1 — створено, 7 — прибула, 9/10/11 — вручено, решта — в дорозі', () => {
    expect(npPhase('1')).toBe('created');
    expect(npPhase('7')).toBe('arrived');
    expect(npPhase('9')).toBe('delivered');
    expect(npPhase('11')).toBe('delivered');
    expect(npPhase('5')).toBe('in_transit');
  });
  it('вартість і платник — у patch; доставка за наш рахунок — витрата з ключем по ЕН; час вручення', () => {
    const u = npDocUpdate({ Number: '2045', StatusCode: '9', Status: 'Отримано', DocumentCost: '85', PayerType: 'Sender', RecipientDateTime: '04.11.2026 12:30:00' }, order());
    expect(u.phase).toBe('delivered');
    expect(u.carrierAccepted).toBe(true);
    expect(u.statusText).toBe('Отримано');
    expect(u.patch).toMatchObject({ np_delivery_cost: 85, np_delivery_payer: 'Sender' });
    expect(u.expenses).toHaveLength(1);
    expect(u.expenses![0]).toMatchObject({ amount: 85, creditParty: 'np:delivery', idempotencyKey: 'np-delivery:2045' });
    expect(u.deliveredAt).toBeTruthy();
    expect(u.onAccepted).toBeUndefined();
  });
  it('платить отримувач — витрати немає; код 1 — не прийнято; Rozetka з ЕН НП — гак статусу 3 до вручення', () => {
    const u = npDocUpdate({ Number: '2045', StatusCode: '1', Status: 'Створено', DocumentCost: '85', PayerType: 'Recipient' }, order({ channel_code: 'rozetka', rozetka_order_id: 77 }));
    expect(u.carrierAccepted).toBe(false);
    expect(u.expenses).toEqual([]);
    expect(typeof u.onAccepted).toBe('function');
    const d = npDocUpdate({ Number: '2045', StatusCode: '9' }, order({ channel_code: 'rozetka', rozetka_order_id: 77 }));
    expect(d.onAccepted).toBeUndefined();
  });
});

describe('ROZETKA Доставка (власний договір)', () => {
  it('комісія за переказ післяплати й доставка за наш рахунок — витрати з ключами по ЕН', () => {
    const u = rzTrackUpdate({ track_id: 'RZ1', last_status: { status: 10030, status_name: 'Видано', date: '' } },
      { tracking_number: 'RZ1', rz_payment_fee: 12.5, rz_delivery_cost: 60, rz_delivery_payer: 'sender' });
    expect(u.statusText).toBe('Видано');
    expect(u.expenses!.map(e => e.idempotencyKey)).toEqual(['rz-payment-fee:RZ1', 'rz-delivery:RZ1']);
    const v = rzTrackUpdate({ track_id: 'RZ1', last_status: { status: 10030, status_name: 'Видано', date: '' } },
      { tracking_number: 'RZ1', rz_payment_fee: null, rz_delivery_cost: 60, rz_delivery_payer: 'recipient' });
    expect(v.expenses).toEqual([]);
  });
});

describe('точки видачі Rozetka: лідер об’єднаної посилки', () => {
  const info = (status: number, title = `st ${status}`) => ({ status, statusGroup: null, title, ttn: 'RMP-1' });
  it('текст і «прийнято» — за лідером; сусід у тій самій коробці вручається разом із лідером', () => {
    const a = order({ id: 'a', tracking_number: 'RMP-1', rozetka_order_id: 1 });
    const b = order({ id: 'b', tracking_number: 'RMP-1', rozetka_order_id: 2 });
    const upd = rozetkaPointsUpdates([a, b], new Map([['a', info(6, 'Виконано')], ['b', info(26, 'Обробляється')]]));
    expect(upd.get('a')).toMatchObject({ phase: 'delivered', carrierAccepted: true, statusText: 'Виконано' });
    expect(upd.get('b')).toMatchObject({ phase: 'delivered', carrierAccepted: true, statusText: 'Виконано' });
  });
  it('посилка в дорозі — in_transit; без інформації кабінету — оновлення немає; вирішене повернення пропускається', () => {
    const a = order({ id: 'a', tracking_number: 'RMP-2', rozetka_order_id: 1 });
    const upd = rozetkaPointsUpdates([a], new Map([['a', info(4)]]));
    expect(upd.get('a')).toMatchObject({ phase: 'in_transit', carrierAccepted: true });
    expect(rozetkaPointsUpdates([a], new Map()).size).toBe(0);
    expect(rzSettled(order({ status: 'cancelled', flags: ['return_received'] }))).toBe(true);
    expect(rzSettled(order({ status: 'cancelled', flags: [] }))).toBe(false);
  });
});

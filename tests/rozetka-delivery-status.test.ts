import { describe, it, expect } from 'vitest';
import { rozetkaDeliveryPhase, isRozetkaCarrierAccepted, pickLeadingRozetkaInfo } from '../lib/rozetka-delivery-status';

describe('pickLeadingRozetkaInfo — об’єднана посилка', () => {
  // Живий кейс 26091246 (20 ₴, у кабінеті вічно 26) + 26091247 (445 ₴, «Доставляється»)
  // з одним RMP-889472948: рух посилки беремо з того, хто зайшов найдалі.
  it('бере статус того замовлення, чия посилка вже рухається', () => {
    const frozen = { status: 26, title: 'Обробляється менеджером' };
    const moving = { status: 4, title: 'Доставляється' };
    expect(pickLeadingRozetkaInfo([frozen, moving])).toBe(moving);
    expect(pickLeadingRozetkaInfo([moving, frozen])).toBe(moving);
  });

  it('виконано і повернення сильніші за «в дорозі»', () => {
    const done = { status: 6 }, moving = { status: 4 }, back = { status: 12 };
    expect(pickLeadingRozetkaInfo([moving, done])).toBe(done);
    expect(pickLeadingRozetkaInfo([moving, back])).toBe(back);
  });

  it('одне замовлення — його ж статус; порожньо — null', () => {
    const only = { status: 26 };
    expect(pickLeadingRozetkaInfo([only])).toBe(only);
    expect(pickLeadingRozetkaInfo([null, undefined])).toBeNull();
    expect(pickLeadingRozetkaInfo([])).toBeNull();
  });
});

describe('rozetkaDeliveryPhase', () => {
  // Драбина знята з живого замовлення 901698980 (GET /orders/{id}?expand=order_status_history)
  it('накладна створена, посилка ще в нас', () => {
    expect(rozetkaDeliveryPhase(61)).toBe('created');  // Заплановано передачу перевізникові
    expect(rozetkaDeliveryPhase(80)).toBe('created');  // Очікує отримання від продавця
    expect(rozetkaDeliveryPhase(1)).toBe('created');
    expect(rozetkaDeliveryPhase(26)).toBe('created');
  });

  it('перевізник узяв посилку — далі скасування вже не прибирає її зі шляху', () => {
    expect(rozetkaDeliveryPhase(81)).toBe('accepted');  // Прийнято від продавця
    expect(rozetkaDeliveryPhase(3)).toBe('accepted');   // Передано до служби доставки
    expect(rozetkaDeliveryPhase(82)).toBe('accepted');  // Знаходиться в РЦ
    expect(rozetkaDeliveryPhase(4)).toBe('accepted');   // Доставляється
    expect(rozetkaDeliveryPhase(5)).toBe('accepted');   // Очікує в пункті самовивозу
  });

  it('виконано — єдиний статус, за яким проводимо продаж', () => {
    expect(rozetkaDeliveryPhase(6)).toBe('delivered');
  });

  it('не забрали / відмовились / повернено — це НЕ доставлено', () => {
    expect(rozetkaDeliveryPhase(11)).toBe('returning'); // Не прийшов за замовленням
    expect(rozetkaDeliveryPhase(12)).toBe('returning'); // Відмова при отриманні
    expect(rozetkaDeliveryPhase(19)).toBe('returning'); // Замовлення повернено
  });

  it('на порожньому чи смітті не падає', () => {
    expect(rozetkaDeliveryPhase(null)).toBeNull();
    expect(rozetkaDeliveryPhase(undefined)).toBeNull();
    expect(rozetkaDeliveryPhase(NaN)).toBeNull();
  });
});

describe('isRozetkaCarrierAccepted', () => {
  it('до передачі перевізникові — ні', () => {
    for (const s of [1, 26, 61, 80]) expect(isRozetkaCarrierAccepted(s)).toBe(false);
  });

  it('після передачі — так, включно з поверненнями', () => {
    for (const s of [81, 3, 82, 4, 5, 6, 11, 12, 19]) expect(isRozetkaCarrierAccepted(s)).toBe(true);
  });

  it('без статусу — ні', () => {
    expect(isRozetkaCarrierAccepted(null)).toBe(false);
  });
});

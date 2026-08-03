import { describe, it, expect } from 'vitest';
import { rozetkaStatusLabel, isRozetkaAhead, isRozetkaBackwards } from '../lib/rozetka-status';

describe('rozetkaStatusLabel', () => {
  it('знає статуси цього кабінету', () => {
    expect(rozetkaStatusLabel(1)).toBe('Нове замовлення');
    expect(rozetkaStatusLabel(26)).toBe('Обробляється менеджером');
    expect(rozetkaStatusLabel(6)).toBe('Замовлення виконано');
  });

  it('незнайомий статус не ховає, а показує номер', () => {
    expect(rozetkaStatusLabel(999)).toBe('Статус 999');
  });

  it('порожнє значення — порожня плашка, а не «Статус null»', () => {
    expect(rozetkaStatusLabel(null)).toBeNull();
    expect(rozetkaStatusLabel(undefined)).toBeNull();
  });
});

describe('isRozetkaBackwards', () => {
  // Драбина проміжних статусів лікує відмову переходу кроком 26. Якщо замовлення
  // вже стоїть на 61, цей крок веде НАЗАД — покупець побачить, що замовлення
  // повернулося в обробку. Живий випадок: ТТН пушиться при створенні накладної,
  // а потім ще раз при «Відправити».
  it('26 після 61 — це назад', () => {
    expect(isRozetkaBackwards(26, 61)).toBe(true);
  });

  it('крок на місці теж не годиться', () => {
    expect(isRozetkaBackwards(26, 26)).toBe(true);
    expect(isRozetkaBackwards(61, 3)).toBe(true);   // обидва «передали перевізникові»
  });

  it('нормальний крок уперед дозволений', () => {
    expect(isRozetkaBackwards(26, 1)).toBe(false);
    expect(isRozetkaBackwards(61, 26)).toBe(false);
  });

  it('невідомий поточний статус не блокує драбину — працює як раніше', () => {
    expect(isRozetkaBackwards(26, null)).toBe(false);
    expect(isRozetkaBackwards(26, undefined)).toBe(false);
    expect(isRozetkaBackwards(26, 13)).toBe(false);  // скасування поза воронкою
  });
});

describe('isRozetkaAhead', () => {
  it('живий випадок: у кабінеті прийняли, у нас висить новим', () => {
    expect(isRozetkaAhead(26, 'new')).toBe(true);
  });

  it('однакове становище у воронці — не «попереду»', () => {
    expect(isRozetkaAhead(1, 'new')).toBe(false);
    expect(isRozetkaAhead(26, 'confirmed')).toBe(false);
    expect(isRozetkaAhead(6, 'delivered')).toBe(false);
  });

  it('коли попереду МИ — теж false, це інший випадок (його лікує re-push)', () => {
    expect(isRozetkaAhead(1, 'confirmed')).toBe(false);
    expect(isRozetkaAhead(26, 'shipped')).toBe(false);
  });

  it('різні щаблі всередині однієї стадії не дають хибного «попереду»', () => {
    // 26 і 2 — обидва «взяли в роботу»; confirmed/picking — теж одна стадія в нас
    expect(isRozetkaAhead(2, 'picking')).toBe(false);
    expect(isRozetkaAhead(5, 'shipped')).toBe(false);
  });

  it('доставка в кабінеті випереджає наше «підтверджено»', () => {
    expect(isRozetkaAhead(3, 'confirmed')).toBe(true);
    expect(isRozetkaAhead(6, 'shipped')).toBe(true);
  });

  it('скасування не вважається просуванням — ним займаються окремі сторожі', () => {
    for (const cancelled of [11, 12, 13, 16, 19, 25]) {
      expect(isRozetkaAhead(cancelled, 'new')).toBe(false);
    }
  });

  it('невідомий статус із будь-якого боку не вмикає плашку', () => {
    expect(isRozetkaAhead(999, 'new')).toBe(false);
    expect(isRozetkaAhead(26, 'cancelled')).toBe(false);
    expect(isRozetkaAhead(null, 'new')).toBe(false);
  });
});

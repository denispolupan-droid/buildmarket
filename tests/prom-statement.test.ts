import { describe, it, expect } from 'vitest';
import {
  parsePromAmount, parsePromDate, classifyPromNote, parsePromStatement, summarizePromStatement,
} from '../lib/prom-statement';

// Фрагмент живої виписки з кабінету (04.08.2026)
const SAMPLE = `04.08.2026
-45,59 ₴
Оплата за доступ к онлайн Каталогу ProSale Prom.ua по заказу 419549833
Списание
29.07.2026
-10 ₴
Компенсация стоимости услуги по организации перевозки отправок Новой Почтой, заказ № 418085643
Списание
24.07.2026
37,72 ₴
Возврат оплаты за доступ к онлайн Каталогу ProSale Prom.ua по заказу 417362914
Отмена списания
24.07.2026
-57,09 ₴
Оплата за доступ к онлайн Каталогу ProSale Prom.ua по заказу 417506371
Списание
30.06.2026
-3 487,18 ₴
Списание бонусных средств за услугу Prom микс 1 000
Списание
30.06.2026
2 000 ₴
Пополнение Баланса для работы на Маркетплейсе
Пополнение`;

describe('parsePromAmount', () => {
  it('кома як десятковий роздільник', () => {
    expect(parsePromAmount('-45,59 ₴')).toBe(-45.59);
    expect(parsePromAmount('37,72 ₴')).toBe(37.72);
  });

  it('пробіли-роздільники тисяч не ріжуть число', () => {
    // звичайний parseFloat на «-3 487,18» дав би -3
    expect(parsePromAmount('-3 487,18 ₴')).toBe(-3487.18);
    expect(parsePromAmount('2 000 ₴')).toBe(2000);
  });

  it('нерозривний пробіл теж', () => {
    expect(parsePromAmount('-4 000 ₴')).toBe(-4000);
  });

  it('ціле без копійок', () => {
    expect(parsePromAmount('-10 ₴')).toBe(-10);
  });
});

describe('parsePromDate', () => {
  it('дд.мм.рррр → ISO', () => {
    expect(parsePromDate('04.08.2026')).toBe('2026-08-04');
    expect(parsePromDate('30.06.2026')).toBe('2026-06-30');
  });
});

describe('classifyPromNote', () => {
  it('ProSale — це комісія, і з неї видно номер замовлення', () => {
    expect(classifyPromNote('Оплата за доступ к онлайн Каталогу ProSale Prom.ua по заказу 419549833'))
      .toEqual({ kind: 'commission', promOrderId: 419549833 });
  });

  it('повернення комісії відрізняємо від самої комісії', () => {
    // обидва згадують ProSale — тому перевірка на «Возврат» мусить іти першою
    expect(classifyPromNote('Возврат оплаты за доступ к онлайн Каталогу ProSale Prom.ua по заказу 417362914').kind)
      .toBe('commission_refund');
  });

  it('«дешева доставка» — компенсація організації перевезення', () => {
    expect(classifyPromNote('Компенсация стоимости услуги по организации перевозки отправок Новой Почтой, заказ № 418085643'))
      .toEqual({ kind: 'np_delivery', promOrderId: 418085643 });
  });

  it('пакети й поповнення до витрат по замовленнях не належать', () => {
    expect(classifyPromNote('Списание бонусных средств за услугу Prom микс 1 000').kind).toBe('package');
    expect(classifyPromNote('Пополнение Баланса для работы на Маркетплейсе').kind).toBe('topup');
  });
});

describe('parsePromStatement', () => {
  const rows = parsePromStatement(SAMPLE);

  it('читає всі записи', () => {
    expect(rows).toHaveLength(6);
  });

  it('розкладає рядок на дату, суму, тип і статтю', () => {
    expect(rows[0]).toMatchObject({
      date: '2026-08-04', amount: -45.59, kind: 'commission',
      promOrderId: 419549833, type: 'Списание',
    });
  });

  it('не плутає повернення з комісією', () => {
    const refund = rows.find(r => r.promOrderId === 417362914);
    expect(refund).toMatchObject({ kind: 'commission_refund', amount: 37.72, type: 'Отмена списания' });
  });

  it('порожній чи сміттєвий текст не ламає розбір', () => {
    expect(parsePromStatement('')).toEqual([]);
    expect(parsePromStatement('просто текст без таблиці')).toEqual([]);
  });
});

describe('summarizePromStatement', () => {
  const s = summarizePromStatement(parsePromStatement(SAMPLE));

  it('витрати рахує додатними — як у нашому обліку', () => {
    // 45.59 + 57.09 − 37.72 (повернення)
    expect(s.commission).toBe(64.96);
    expect(s.npDelivery).toBe(10);
  });

  it('поповнення й пакети в витрати не потрапляють', () => {
    expect(s.topup).toBe(2000);
    expect(s.packages).toBe(-3487.18);
  });
});

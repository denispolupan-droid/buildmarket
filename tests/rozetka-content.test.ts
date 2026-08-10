import { describe, it, expect } from 'vitest';
import { classifyReason, isAutoFixable, buildContentSummary } from '../lib/rozetka-content';

// Формулювання причин узяті з реальних відповідей кабінету — від них залежить,
// чи запропонує адмінка кнопку «перегенерувати опис», чи скаже «руками».
describe('classifyReason', () => {
  it('текстові причини лікуються генерацією', () => {
    expect(classifyReason('Посилання/згадка стороннього ресурсу в текстовому описі')).toBe('text');
    expect(classifyReason('Заборонено використання стоп-слiв на сайтi Rozetka')).toBe('text');
    expect(isAutoFixable('Посилання/згадка стороннього ресурсу в текстовому описі')).toBe(true);
  });

  it('фото кнопкою не лікується', () => {
    expect(classifyReason('Фото не відповідає вимогам')).toBe('photo');
    expect(classifyReason('Відсутнє фото товару')).toBe('photo');
    expect(isAutoFixable('Фото не відповідає вимогам')).toBe(false);
  });

  it('характеристики — окремий тип, не «текст»', () => {
    expect(classifyReason('Некоректна характеристика товару (помилки та невідповідності у значеннях)')).toBe('chars');
    expect(isAutoFixable('Некоректна характеристика товару')).toBe(false);
  });

  it('незнайоме формулювання не видається за виправне', () => {
    expect(classifyReason('Товар дублює іншу позицію')).toBe('other');
    expect(isAutoFixable('Товар дублює іншу позицію')).toBe(false);
  });
});

// Джерел два: заявки (доля наших правок) і самі позиції (за що знято поле).
// Зведення має показувати обидва, інакше «709 заявок у черзі» приховає сотні
// карток із давно відхиленим описом.
describe('buildContentSummary', () => {
  const change = (sku: string, status: string, reasons: string[] = [], fields = { description_ua: true }) => ({
    price_offer_id: sku, rz_item_id: 1, name: `Товар ${sku}`, url: null, photo: null,
    upload_status_title: 'Активний', blocked_reason: null,
    changes: { changed_fields: fields, status, reasons, change_date: '2026-08-10 13:43:14' },
  });
  const good = (sku: string, titles: string[]) => ({
    price_offer_id: sku, rz_item_id: 1, name: `Товар ${sku}`, url: null, photo: null,
    upload_status_title: 'Не пройшов модерацію',
    blocked_reason: titles.map((title, i) => ({ reason_id: i, title })),
    changes: null,
  });

  it('рахує чергу і відмови окремо', () => {
    const s = buildContentSummary(
      [change('A', 'Очікує підтвердження'), change('B', 'Відхилено', ['Фото не відповідає вимогам'])],
      [], '2026-08-10T13:00:00Z',
    );
    expect(s.pending).toBe(1);
    expect(s.rejected).toBe(1);
    expect(s.byField).toEqual({ description_ua: 2 });
  });

  it('проблеми з обох джерел зводяться в один рядок на товар', () => {
    const s = buildContentSummary(
      [change('A', 'Відхилено', ['Відсутнє фото товару'])],
      [good('A', ['Посилання/згадка стороннього ресурсу в текстовому описі'])],
      '2026-08-10T13:00:00Z',
    );
    expect(s.problems).toHaveLength(1);
    expect(s.problems[0].reasons).toHaveLength(2);
    expect(s.problems[0].kinds.sort()).toEqual(['photo', 'text']);
    expect(s.problems[0].autoFixable).toBe(true);   // текстову частину кнопка полагодить
  });

  it('поки виправлення в черзі — кнопку не пропонуємо', () => {
    // Опис уже замінений і поданий; друга генерація подала б ту саму правку вдруге.
    const s = buildContentSummary(
      [change('A', 'Очікує підтвердження')],
      [good('A', ['Посилання/згадка стороннього ресурсу в текстовому описі'])],
      '2026-08-10T13:00:00Z',
    );
    expect(s.problems[0].pending).toBe(true);
    expect(s.problems[0].autoFixable).toBe(false);
  });

  it('позиції, що чекають модерації, проблемами не рахуються', () => {
    const s = buildContentSummary([change('A', 'Очікує підтвердження')], [], '2026-08-10T13:00:00Z');
    expect(s.problems).toHaveLength(0);
  });

  it('причини впорядковані за кількістю', () => {
    const s = buildContentSummary([], [
      good('A', ['Фото не відповідає вимогам']),
      good('B', ['Фото не відповідає вимогам']),
      good('C', ['Відсутнє фото товару']),
    ], '2026-08-10T13:00:00Z');
    expect(s.byReason[0]).toEqual({ title: 'Фото не відповідає вимогам', count: 2, kind: 'photo' });
  });
});

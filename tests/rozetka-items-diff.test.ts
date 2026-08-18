import { describe, it, expect } from 'vitest';
import { itemsDiffer, describeItemsDiff } from '../lib/rozetka-items-diff';

const A = { sku: '1100-001', qty: 2, price: 100 };
const B = { sku: '1100-002', qty: 1, price: 250 };

describe('itemsDiffer', () => {
  it('однаковий склад — різниці немає', () => {
    expect(itemsDiffer([A, B], [A, B])).toBe(false);
  });

  it('порядок позицій не рахується різницею: кабінет його не тримає', () => {
    expect(itemsDiffer([A, B], [B, A])).toBe(false);
  });

  // Rozetka віддає ціну то числом, то рядком. Пряме !== давало б різницю на
  // кожному прогоні — тобто нескінченний алерт і переприсвоєння складу.
  it('ціна рядком і числом — це те саме', () => {
    expect(itemsDiffer([A], [{ ...A, price: '100' as unknown as number }])).toBe(false);
    expect(itemsDiffer([A], [{ ...A, price: 100.004 }])).toBe(false);
  });

  it('ловить зміну кількості', () => {
    expect(itemsDiffer([A], [{ ...A, qty: 3 }])).toBe(true);
  });

  it('ловить зміну ціни від копійки', () => {
    expect(itemsDiffer([A], [{ ...A, price: 100.01 }])).toBe(true);
  });

  it('ловить додану й прибрану позицію', () => {
    expect(itemsDiffer([A], [A, B])).toBe(true);
    expect(itemsDiffer([A, B], [A])).toBe(true);
  });

  it('заміна позиції на іншу з тією ж кількістю', () => {
    expect(itemsDiffer([A], [{ ...B, qty: A.qty }])).toBe(true);
  });

  it('порожні списки не падають', () => {
    expect(itemsDiffer([], [])).toBe(false);
    expect(itemsDiffer([], [A])).toBe(true);
  });
});

describe('describeItemsDiff', () => {
  it('пише, що саме змінилось, і нову суму', () => {
    const s = describeItemsDiff([A], [{ ...A, qty: 5 }]);
    expect(s).toContain('1100-001: 2 → 5 шт');
    expect(s).toContain('сума 200 → 500 грн');
  });

  it('позначає додані й прибрані позиції', () => {
    expect(describeItemsDiff([A], [A, B])).toContain('додано 1100-002 ×1');
    expect(describeItemsDiff([A, B], [A])).toContain('прибрано 1100-002');
  });

  it('зміну ціни описує окремо від кількості', () => {
    expect(describeItemsDiff([A], [{ ...A, price: 120 }])).toContain('1100-001: 100 → 120 грн');
  });
});

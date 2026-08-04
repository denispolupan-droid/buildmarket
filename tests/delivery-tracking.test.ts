import { describe, it, expect } from 'vitest';
import { groupByTracking } from '../lib/delivery-tracking';

describe('groupByTracking', () => {
  // Живий кейс 04.08.2026: клієнт зробив два замовлення, ми відправили однією
  // посилкою. Документ НП мусить дістатися ОБОМ, інакше друге замовлення не
  // отримує статусу перевізника і при доставці не переходить у «Доставлено».
  it('обʼєднані замовлення з однією ТТН потрапляють в одну групу', () => {
    const orders = [
      { id: 'a', tracking_number: '20451502111156' },
      { id: 'b', tracking_number: '20451502111156' },
      { id: 'c', tracking_number: '20451501886584' },
    ];
    const g = groupByTracking(orders);
    expect(g.size).toBe(2);
    expect(g.get('20451502111156')?.map(o => o.id)).toEqual(['a', 'b']);
    expect(g.get('20451501886584')?.map(o => o.id)).toEqual(['c']);
  });

  it('ключів рівно стільки, скільки унікальних номерів — дублікати не зʼїдають ліміт запиту', () => {
    const orders = Array.from({ length: 5 }, (_, i) => ({ id: String(i), tracking_number: 'X1' }));
    expect([...groupByTracking(orders).keys()]).toEqual(['X1']);
  });

  it('замовлення без ТТН пропускаємо, а не групуємо під null', () => {
    const g = groupByTracking([
      { id: 'a', tracking_number: null },
      { id: 'b', tracking_number: '' },
      { id: 'c', tracking_number: 'X1' },
    ]);
    expect([...g.keys()]).toEqual(['X1']);
  });

  it('порожній список дає порожню мапу', () => {
    expect(groupByTracking([]).size).toBe(0);
  });
});

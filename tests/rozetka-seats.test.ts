import { describe, it, expect } from 'vitest';
import { aggregateRozetkaSeats } from '../lib/rozetka-delivery';

describe('aggregateRozetkaSeats', () => {
  it('одне місце — як було: вага й габарити без змін, об\'єм з габаритів', () => {
    expect(aggregateRozetkaSeats([{ weight: 5.2, length: 30, width: 20, height: 15 }]))
      .toEqual({ weight: 5.2, length: 30, width: 20, height: 15, volume: 0.009 });
  });

  it('кілька місць — сума ваги й об\'ємів, габарити найбільшої коробки', () => {
    const r = aggregateRozetkaSeats([
      { weight: 2.1, length: 30, width: 20, height: 15 },   // 9 000 см³
      { weight: 4.2, length: 60, width: 40, height: 40 },   // 96 000 см³
      { weight: 0.7, length: 10, width: 10, height: 10 },   // 1 000 см³
    ]);
    expect(r.weight).toBe(7);
    expect([r.length, r.width, r.height]).toEqual([60, 40, 40]);
    expect(r.volume).toBe(0.106);
  });
});

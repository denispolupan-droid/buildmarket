import { describe, it, expect } from 'vitest';
import { attributeOwnSales } from '../lib/accounting/stock-supplier';

describe('attributeOwnSales — постачальник складського товару за партіями FIFO', () => {
  it('07.11.2026: «Ринок» — 1600-006 (1 шт) і 1004-001 (4 шт); ЗРХ — 1603-016', () => {
    const m = attributeOwnSales(
      [
        { sku: '1600-006', supplierId: 2, qty: 1, receivedAt: '2026-08-16' },
        { sku: '1603-016', supplierId: 1, qty: 1, receivedAt: '2026-08-27' },
        { sku: '1004-001', supplierId: 2, qty: 4, receivedAt: '2026-10-23' },
      ],
      [
        { key: 'a', sku: '1600-006', qty: 1, date: '2026-08-17' },
        { key: 'b', sku: '1603-016', qty: 1, date: '2026-08-27' },
        { key: 'c', sku: '1004-001', qty: 4, date: '2026-10-23' },
      ],
    );
    expect(m.get('a')).toEqual([{ supplierId: 2, qty: 1 }]);
    expect(m.get('b')).toEqual([{ supplierId: 1, qty: 1 }]);
    expect(m.get('c')).toEqual([{ supplierId: 2, qty: 4 }]);
  });

  it('FIFO через кілька партій різних постачальників; нестача партій — «Наш склад» (null)', () => {
    const m = attributeOwnSales(
      [
        { sku: 'X', supplierId: 2, qty: 2, receivedAt: '2026-08-01' },
        { sku: 'X', supplierId: 1, qty: 3, receivedAt: '2026-09-01' },
      ],
      [
        { key: 's1', sku: 'X', qty: 1, date: '2026-08-05' },
        { key: 's2', sku: 'X', qty: 3, date: '2026-09-05' },
        { key: 's3', sku: 'X', qty: 3, date: '2026-09-10' },
      ],
    );
    expect(m.get('s1')).toEqual([{ supplierId: 2, qty: 1 }]);
    expect(m.get('s2')).toEqual([{ supplierId: 2, qty: 1 }, { supplierId: 1, qty: 2 }]);
    expect(m.get('s3')).toEqual([{ supplierId: 1, qty: 1 }, { supplierId: null, qty: 2 }]);
  });
});

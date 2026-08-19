import { describe, it, expect } from 'vitest';
import { buildOverrideRows, unmappedSkus, type ProductMarkup } from '../lib/price-overrides';

const NOW = '2026-08-19T10:00:00.000Z';

describe('buildOverrideRows', () => {
  it('на кожного постачальника товару — свій рядок', () => {
    const rows = buildOverrideRows(
      [{ sku: 'A', markup_retail: 12 }],
      new Map([['A', [1, 2]]]),
      NOW,
    );
    expect(rows).toHaveLength(2);
    expect(rows.map(r => r.supplier_id)).toEqual([1, 2]);
    expect(rows[0]).toMatchObject({ our_sku: 'A', markup_retail: 12, updated_at: NOW });
  });

  it('товар без постачальника рядків не дає', () => {
    expect(buildOverrideRows([{ sku: 'X', markup_retail: 5 }], new Map(), NOW)).toEqual([]);
  });

  it('поля, яких не було в переоцінці, у запит не потрапляють', () => {
    const [row] = buildOverrideRows([{ sku: 'A', markup_retail: 12 }], new Map([['A', [1]]]), NOW);
    expect(row).not.toHaveProperty('markup_wholesale');
    expect(row).not.toHaveProperty('markup_drop');
    expect(row).not.toHaveProperty('fixed_retail');
  });

  it('явний null зберігається — так наценка знімає стару фіксовану ціну', () => {
    const [row] = buildOverrideRows(
      [{ sku: 'A', markup_retail: 12, fixed_retail: null }],
      new Map([['A', [1]]]),
      NOW,
    );
    expect(row).toHaveProperty('fixed_retail', null);
  });

  it('фіксована ціна записується як є', () => {
    const [row] = buildOverrideRows(
      [{ sku: 'A', fixed_retail: 199, fixed_wholesale: 180 }],
      new Map([['A', [1]]]),
      NOW,
    );
    expect(row).toMatchObject({ fixed_retail: 199, fixed_wholesale: 180 });
  });

  it('кілька товарів зберігають свій порядок', () => {
    const items: ProductMarkup[] = [{ sku: 'B', markup_retail: 1 }, { sku: 'A', markup_retail: 2 }];
    const rows = buildOverrideRows(items, new Map([['A', [1]], ['B', [1]]]), NOW);
    expect(rows.map(r => r.our_sku)).toEqual(['B', 'A']);
  });
});

describe('unmappedSkus', () => {
  it('називає товари, яким наценку записати нікуди', () => {
    const items: ProductMarkup[] = [{ sku: 'A' }, { sku: 'B' }, { sku: 'C' }];
    const bySku = new Map([['A', [1]], ['B', []]]);
    expect(unmappedSkus(items, bySku)).toEqual(['B', 'C']);
  });
});

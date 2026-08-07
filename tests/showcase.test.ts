import { describe, it, expect } from 'vitest';
import {
  isShowcaseSurface, isShowcaseVisible, orderByShowcase,
  normalizeShowcaseSkus, moveShowcaseItem, SHOWCASE_LIMIT, SHOWCASE_MAX_ITEMS,
} from '../lib/showcase';

const p = (sku: string, over: Partial<{ is_active: boolean; status: string; price: number }> = {}) => ({
  sku,
  is_active: over.is_active ?? true,
  stock: { stock_status: over.status ?? 'in_stock', price_retail: over.price ?? 100 },
});

describe('isShowcaseSurface', () => {
  it('приймає лише відомі вітрини', () => {
    expect(isShowcaseSurface('shop')).toBe(true);
    expect(isShowcaseSurface('catalog')).toBe(true);
    expect(isShowcaseSurface('main')).toBe(false);
    expect(isShowcaseSurface(null)).toBe(false);
  });
});

describe('isShowcaseVisible', () => {
  it('показуємо активний товар у наявності', () => {
    expect(isShowcaseVisible(p('A'))).toBe(true);
  });

  it('деактивований не показуємо', () => {
    expect(isShowcaseVisible(p('A', { is_active: false }))).toBe(false);
  });

  it('немає в наявності — не показуємо: вітрина із заглушок гірша за коротшу', () => {
    expect(isShowcaseVisible(p('A', { status: 'out_of_stock' }))).toBe(false);
    expect(isShowcaseVisible(p('A', { status: 'on_order' }))).toBe(false);
  });

  it('без ціни теж не показуємо: картка без ціни не продає', () => {
    expect(isShowcaseVisible(p('A', { price: 0 }))).toBe(false);
  });

  it('відсутній stock не валить перевірку', () => {
    expect(isShowcaseVisible({ is_active: true, stock: null })).toBe(false);
  });
});

describe('orderByShowcase', () => {
  const products = [p('C'), p('A'), p('B')];   // порядок вибірки навмисно інший

  it('порядок задає вітрина, а не вибірка з бази', () => {
    expect(orderByShowcase(['A', 'B', 'C'], products).map(x => x.sku)).toEqual(['A', 'B', 'C']);
  });

  it('SKU, якого немає серед товарів, просто пропускаємо', () => {
    expect(orderByShowcase(['A', 'НЕМА', 'B'], products).map(x => x.sku)).toEqual(['A', 'B']);
  });

  it('непридатні відсіюються, решта підтягується', () => {
    const list = [p('A', { status: 'out_of_stock' }), p('B'), p('C')];
    expect(orderByShowcase(['A', 'B', 'C'], list, { visible: isShowcaseVisible }).map(x => x.sku))
      .toEqual(['B', 'C']);
  });

  it('ріжемо по ліміту', () => {
    const many = Array.from({ length: 20 }, (_, i) => p(`S${i}`));
    const skus = many.map(x => x.sku);
    expect(orderByShowcase(skus, many)).toHaveLength(SHOWCASE_LIMIT);
    expect(orderByShowcase(skus, many, { limit: 3 })).toHaveLength(3);
  });

  it('порожня вітрина — порожній результат, без падінь', () => {
    expect(orderByShowcase([], products)).toEqual([]);
  });
});

describe('normalizeShowcaseSkus', () => {
  it('прибирає порожні й дублі, зберігаючи порядок', () => {
    expect(normalizeShowcaseSkus(['A', ' ', 'B', 'A', '  C  '])).toEqual(['A', 'B', 'C']);
  });

  it('не приймає не-масив і не-рядки', () => {
    expect(normalizeShowcaseSkus(null)).toEqual([]);
    expect(normalizeShowcaseSkus('A')).toEqual([]);
    expect(normalizeShowcaseSkus([1, {}, 'A'])).toEqual(['A']);
  });

  it('обрізає по стелі — випадковий імпорт не заллє тисячі рядків', () => {
    const many = Array.from({ length: 100 }, (_, i) => `S${i}`);
    expect(normalizeShowcaseSkus(many)).toHaveLength(SHOWCASE_MAX_ITEMS);
  });
});

describe('moveShowcaseItem', () => {
  it('міняє сусідів місцями', () => {
    expect(moveShowcaseItem(['A', 'B', 'C'], 0, 1)).toEqual(['B', 'A', 'C']);
    expect(moveShowcaseItem(['A', 'B', 'C'], 2, -1)).toEqual(['A', 'C', 'B']);
  });

  it('за межами списку нічого не робить', () => {
    const src = ['A', 'B'];
    expect(moveShowcaseItem(src, 0, -1)).toBe(src);
    expect(moveShowcaseItem(src, 1, 1)).toBe(src);
    expect(moveShowcaseItem(src, 5, 1)).toBe(src);
  });

  it('не мутує вхідний масив', () => {
    const src = ['A', 'B'];
    moveShowcaseItem(src, 0, 1);
    expect(src).toEqual(['A', 'B']);
  });
});

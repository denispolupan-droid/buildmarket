import { describe, it, expect } from 'vitest';
import { publicStock, publicProduct } from '../lib/public-product';

// Форма рядка product_stock із прода — разом із колонками, яких немає в типі
// ProductStock (price_wholesale, price_locked): вони приходять із product_stock(*)
// і саме через них витік був непомітним для компілятора.
const STOCK = {
  id: 1, sku: '1605-006',
  price_retail: 166, price_retail_old: 180, price_promo: null, price_old: 200,
  price_unit: 140, price_cost: 125.1, price_drop: 150,
  price_wholesale: 138, price_locked: false,
  stock_qty: 12, stock_status: 'in_stock',
  supplier_sku: '1509-061', updated_at: '2026-07-31T00:00:00Z',
};

describe('publicStock', () => {
  it('не пропускає жодного службового поля', () => {
    const out = publicStock(STOCK)!;
    for (const k of ['price_cost', 'price_drop', 'price_wholesale', 'price_locked', 'supplier_sku', 'price_unit', 'id', 'sku']) {
      expect(out).not.toHaveProperty(k);
    }
  });

  it('лишає те, що потрібно вітрині', () => {
    expect(publicStock(STOCK)).toEqual({
      price_retail: 166, price_retail_old: 180, price_promo: null,
      price_old: 200, stock_status: 'in_stock', stock_qty: 12,
    });
  });

  it('оптову ціну віддає лише коли явно попросили', () => {
    expect(publicStock(STOCK)).not.toHaveProperty('price_unit');
    expect(publicStock(STOCK, true)).toHaveProperty('price_unit', 140);
  });

  it('білий список: нова службова колонка не поїде назовні сама', () => {
    const out = publicStock({ ...STOCK, price_secret_2027: 999 })!;
    expect(out).not.toHaveProperty('price_secret_2027');
  });

  it('порожній склад лишається порожнім', () => {
    expect(publicStock(null)).toBeNull();
    expect(publicStock(undefined)).toBeNull();
  });
});

describe('publicProduct', () => {
  it('чистить склад і не чіпає решту полів', () => {
    const p = { sku: '1605-006', name: 'Клей', brand: 'Lacrysil', stock: STOCK };
    const out = publicProduct(p);
    expect(out.sku).toBe('1605-006');
    expect(out.name).toBe('Клей');
    expect(out.brand).toBe('Lacrysil');
    expect(out.stock).not.toHaveProperty('price_cost');
    expect(out.stock).toHaveProperty('price_retail', 166);
  });

  it("не мутує вихідний обʼєкт", () => {
    const p = { sku: 'x', stock: { ...STOCK } };
    publicProduct(p);
    expect(p.stock).toHaveProperty('price_cost', 125.1);
  });

  it('товар без складу не падає', () => {
    expect(publicProduct({ sku: 'x', stock: null }).stock).toBeNull();
  });
});

describe('publicProduct: службові колонки самого товару', () => {
  it('прибирає код постачальника і закупівельні коефіцієнти', () => {
    const p = {
      sku: '1605-006', name: 'Клей', brand: 'Lacrysil', slug: 'klei', stock: null,
      supplier_sku: '1615-055', min_price: 100, purchase_ratio: 1, sale_ratio: 1,
      purchase_uom: 'шт', purchase_uom_factor: 1, prom_markup_pct: 12, rozetka_markup_pct: 15,
    };
    const out = publicProduct(p) as Record<string, unknown>;
    for (const k of ['supplier_sku', 'min_price', 'purchase_ratio', 'sale_ratio',
                     'purchase_uom', 'purchase_uom_factor', 'prom_markup_pct', 'rozetka_markup_pct']) {
      expect(out).not.toHaveProperty(k);
    }
    // вітринні поля лишаються
    expect(out).toMatchObject({ sku: '1605-006', name: 'Клей', brand: 'Lacrysil', slug: 'klei' });
  });
});

import { describe, it, expect } from 'vitest';
import { buildCopyLines, describeCopy, mapCopyDelivery, mapCopyPayment, copyComment, type CopyProduct } from '../lib/order-copy';

const P = (sku: string, over: Partial<CopyProduct> = {}): CopyProduct => ({
  sku, name: `Товар ${sku}`, brand: 'Ceresit', matched: true,
  price_retail: 100, price_wholesale: 80, price_drop: 90, price_cost: 60, price_unit: 95,
  ...over,
});

describe('buildCopyLines', () => {
  it('бере ціну з каталогу за тарифом, а не з вихідного замовлення', () => {
    const r = buildCopyLines([{ sku: 'A', name: 'стара назва', qty: 3, price: 55 }], [P('A')], 'retail');
    expect(r.lines[0].price).toBe(100);
    expect(r.lines[0].qty).toBe(3);
    expect(r.lines[0].matched).toBe(true);
    expect(r.changed).toEqual([{ sku: 'A', from: 55, to: 100 }]);
  });

  it('оптовий тариф бере price_wholesale, дроп — price_drop', () => {
    const items = [{ sku: 'A', name: 'x', qty: 1, price: 0 }];
    expect(buildCopyLines(items, [P('A')], 'wholesale').lines[0].price).toBe(80);
    expect(buildCopyLines(items, [P('A')], 'drop').lines[0].price).toBe(90);
    expect(buildCopyLines(items, [P('A')], 'cost').lines[0].price).toBe(60);
  });

  it('назву і бренд оновлює з каталогу — вони могли змінитись', () => {
    const r = buildCopyLines([{ sku: 'A', name: 'стара', brand: 'Old', qty: 1, price: 100 }], [P('A')], 'retail');
    expect(r.lines[0].name).toBe('Товар A');
    expect(r.lines[0].brand).toBe('Ceresit');
  });

  it('незмінна ціна не потрапляє в changed', () => {
    const r = buildCopyLines([{ sku: 'A', name: 'x', qty: 1, price: 100 }], [P('A')], 'retail');
    expect(r.changed).toEqual([]);
    expect(describeCopy(r)).toBeNull();
  });

  it('різниця менша за копійку — не зміна ціни', () => {
    const r = buildCopyLines([{ sku: 'A', name: 'x', qty: 1, price: 100.004 }], [P('A')], 'retail');
    expect(r.changed).toEqual([]);
  });

  it('товару немає в каталозі — рядок лишається без ціни й позначений', () => {
    const r = buildCopyLines([{ sku: 'GONE', name: 'Знятий товар', qty: 2, price: 70 }], [], 'retail');
    expect(r.lines[0]).toMatchObject({ sku: 'GONE', name: 'Знятий товар', qty: 2, price: 0, matched: false });
    expect(r.missing).toEqual(['GONE']);
    expect(describeCopy(r)).toContain('немає в каталозі');
  });

  it('products із matched:false вважається відсутнім', () => {
    const r = buildCopyLines([{ sku: 'A', name: 'x', qty: 1, price: 10 }], [P('A', { matched: false })], 'retail');
    expect(r.lines[0].matched).toBe(false);
    expect(r.missing).toEqual(['A']);
  });

  it('бонусна позиція копіюється по нулю і зберігає прапорець', () => {
    const r = buildCopyLines([{ sku: 'A', name: 'x', qty: 1, price: 0, is_bonus: true }], [P('A')], 'retail');
    expect(r.lines[0].price).toBe(0);
    expect(r.lines[0].is_bonus).toBe(true);
    expect(r.changed).toEqual([]);
  });

  it('у каталозі немає ціни за тарифом — падаємо на price_unit, потім на закуп', () => {
    const noRetail = P('A', { price_retail: null, price_unit: 77 });
    expect(buildCopyLines([{ sku: 'A', name: 'x', qty: 1, price: 5 }], [noRetail], 'retail').lines[0].price).toBe(77);
    const onlyCost = P('A', { price_retail: null, price_unit: null, price_cost: 42 });
    expect(buildCopyLines([{ sku: 'A', name: 'x', qty: 1, price: 5 }], [onlyCost], 'retail').lines[0].price).toBe(42);
  });

  it('ціни немає ніде — лишаємо стару, а не нуль у рахунку', () => {
    const noPrice = P('A', { price_retail: null, price_wholesale: null, price_drop: null, price_cost: null, price_unit: null });
    const r = buildCopyLines([{ sku: 'A', name: 'x', qty: 1, price: 33 }], [noPrice], 'retail');
    expect(r.lines[0].price).toBe(33);
    expect(r.changed).toEqual([]);
  });

  it('порядок позицій зберігається', () => {
    const r = buildCopyLines(
      [{ sku: 'B', name: 'b', qty: 1, price: 1 }, { sku: 'A', name: 'a', qty: 1, price: 1 }],
      [P('A'), P('B')], 'retail');
    expect(r.lines.map(l => l.sku)).toEqual(['B', 'A']);
  });

  it('describeCopy згортає кілька змін в один рядок', () => {
    const r = buildCopyLines(
      [{ sku: 'A', name: 'a', qty: 1, price: 10 }, { sku: 'B', name: 'b', qty: 1, price: 20 }, { sku: 'C', name: 'c', qty: 1, price: 30 }],
      [P('A'), P('B'), P('C')], 'retail');
    const txt = describeCopy(r)!;
    expect(txt).toContain('3 позиціях');
    expect(txt).toContain('A: 10.00 → 100.00 ₴');
  });
});

describe('артикул постачальника', () => {
  it('рядок знаходиться за input_sku, а в копію йде наш sku', () => {
    const r = buildCopyLines(
      [{ sku: 'SUP-77', name: 'з накладної постачальника', qty: 2, price: 50 }],
      [{ sku: 'OUR-1', input_sku: 'SUP-77', name: 'Наш товар', brand: 'Ceresit', matched: true, price_retail: 120 }],
      'retail',
    );
    expect(r.lines[0].sku).toBe('OUR-1');
    expect(r.lines[0].name).toBe('Наш товар');
    expect(r.lines[0].price).toBe(120);
    expect(r.missing).toEqual([]);
  });
});

describe('мапінг словників форми', () => {
  it('доставка: НП і самовивіз переносяться дослівно', () => {
    expect(mapCopyDelivery('nova_poshta')).toEqual({ delivery: 'nova', kept: true });
    expect(mapCopyDelivery('pickup')).toEqual({ delivery: 'pickup', kept: true });
    expect(mapCopyDelivery('kharkiv')).toEqual({ delivery: 'kharkiv', kept: true });
  });

  it('доставка маркетплейсу в ручному замовленні неможлива — падаємо на НП і позначаємо', () => {
    expect(mapCopyDelivery('rozetka_delivery')).toEqual({ delivery: 'nova', kept: false });
    expect(mapCopyDelivery('rz_delivery')).toEqual({ delivery: 'nova', kept: false });
    expect(mapCopyDelivery(null)).toEqual({ delivery: 'nova', kept: false });
  });

  it('оплата: накладений, готівка і безнал — дослівно, решта → безнал із позначкою', () => {
    expect(mapCopyPayment('cod')).toEqual({ payment: 'cod', kept: true });
    expect(mapCopyPayment('cash')).toEqual({ payment: 'cash', kept: true });
    expect(mapCopyPayment('invoice')).toEqual({ payment: 'invoice', kept: true });
    expect(mapCopyPayment('prepaid')).toEqual({ payment: 'invoice', kept: false });
    expect(mapCopyPayment('card')).toEqual({ payment: 'invoice', kept: false });
  });

  it('коментар копії склеює тільки непорожні примітки', () => {
    expect(copyComment(26081102)).toBe('Копія замовлення №26081102');
    expect(copyComment(1, ['доставка: Rozetka', null, undefined, 'оплата: картка']))
      .toBe('Копія замовлення №1 · доставка: Rozetka · оплата: картка');
  });
});

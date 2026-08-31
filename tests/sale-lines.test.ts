import { describe, it, expect } from 'vitest';
import { parseSaleLines } from '../lib/accounting/sale-lines';

// Розбір рядків видаткової при ручному редагуванні. Сума накладної рахується
// саме тут — на сервері, а не в браузері.

const ok = (r: ReturnType<typeof parseSaleLines>) => {
  if (!r.ok) throw new Error(`очікували успіх, отримали: ${r.error}`);
  return r;
};

describe('parseSaleLines', () => {
  it('рахує суму з кількості й ціни, а не бере її з запиту', () => {
    const r = ok(parseSaleLines([
      { sku: '2108-005', qty: 3, price: 1517 },
      { sku: '1005-010', qty: 2, price: 192.5 },
    ]));
    expect(r.total).toBe(4551 + 385);
    expect(r.lines).toHaveLength(2);
  });

  it('приймає кому як десятковий роздільник — це українська розкладка', () => {
    const r = ok(parseSaleLines([{ sku: 'A', qty: '1,5', price: '10,20' }]));
    expect(r.lines[0].qty).toBe(1.5);
    expect(r.lines[0].price).toBe(10.2);
    expect(r.total).toBe(15.3);
  });

  it('не накопичує похибку подвійної точності', () => {
    // 0.1 × 3 у JS дає 0.30000000000000004 — у сумі накладної такого бути не може
    const r = ok(parseSaleLines([{ sku: 'A', qty: 3, price: 0.1 }]));
    expect(r.total).toBe(0.3);
  });

  it('склеює дублікати артикула в один рядок', () => {
    // Два однакові рядки у друкованій формі читаються як помилка оформлення,
    // а в обліку дали б два окремі списання з FIFO
    const r = ok(parseSaleLines([
      { sku: 'A', qty: 2, price: 100 },
      { sku: 'A', qty: 3, price: 100 },
    ]));
    expect(r.lines).toHaveLength(1);
    expect(r.lines[0].qty).toBe(5);
    expect(r.total).toBe(500);
  });

  it('нульова ціна дозволена — це бонус або заміна', () => {
    const r = ok(parseSaleLines([{ sku: 'A', qty: 1, price: 0 }]));
    expect(r.total).toBe(0);
  });

  it('порожній список відхиляє: накладна без товарів не існує', () => {
    expect(parseSaleLines([])).toMatchObject({ ok: false });
    expect(parseSaleLines(null)).toMatchObject({ ok: false });
    expect(parseSaleLines('щось')).toMatchObject({ ok: false });
  });

  it('нульова й від’ємна кількість — помилка з назвою артикула', () => {
    const zero = parseSaleLines([{ sku: '2108-005', qty: 0, price: 10 }]);
    expect(zero.ok).toBe(false);
    if (!zero.ok) expect(zero.error).toContain('2108-005');

    expect(parseSaleLines([{ sku: 'A', qty: -1, price: 10 }])).toMatchObject({ ok: false });
  });

  it('від’ємна ціна — помилка: це не знижка, а зіпсований документ', () => {
    expect(parseSaleLines([{ sku: 'A', qty: 1, price: -5 }])).toMatchObject({ ok: false });
  });

  it('рядок без артикула не проходить', () => {
    expect(parseSaleLines([{ sku: '  ', qty: 1, price: 10 }])).toMatchObject({ ok: false });
    expect(parseSaleLines([{ qty: 1, price: 10 }])).toMatchObject({ ok: false });
  });

  it('сміття замість числа не стає нулем мовчки', () => {
    expect(parseSaleLines([{ sku: 'A', qty: 'багато', price: 10 }])).toMatchObject({ ok: false });
    expect(parseSaleLines([{ sku: 'A', qty: 1, price: 'дорого' }])).toMatchObject({ ok: false });
    expect(parseSaleLines([{ sku: 'A', qty: NaN, price: 10 }])).toMatchObject({ ok: false });
  });
});

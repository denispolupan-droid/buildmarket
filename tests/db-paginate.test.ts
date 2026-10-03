import { describe, it, expect } from 'vitest';
import { fetchAllRows } from '../lib/db-paginate';

type Row = { id: number };
const rows = (n: number, offset = 0): Row[] => Array.from({ length: n }, (_, i) => ({ id: offset + i }));

describe('fetchAllRows', () => {
  it('склеює сторінки по 1000, поки не прийде неповна', async () => {
    const calls: Array<[number, number]> = [];
    const out = await fetchAllRows<Row>(async (f, t) => {
      calls.push([f, t]);
      return { data: f === 0 ? rows(1000) : rows(7, 1000), error: null };
    });
    expect(out).toHaveLength(1007);
    expect(calls).toEqual([[0, 999], [1000, 1999]]);
  });

  it('порожня вибірка — один запит і порожній масив', async () => {
    let n = 0;
    const out = await fetchAllRows<Row>(async () => { n++; return { data: [], error: null }; });
    expect(out).toEqual([]);
    expect(n).toBe(1);
  });

  // Прод на найменшому compute: під час пачки ISR-перебудов важка вибірка
  // ловила 57014 і сторінка віддавала 500. Повтор рятує саме такий момент.
  it('таймаут 57014 — повторює ту саму сторінку і доводить справу до кінця', async () => {
    let n = 0;
    const out = await fetchAllRows<Row>(async () => {
      n++;
      if (n < 3) return { data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } };
      return { data: rows(3), error: null };
    });
    expect(out).toHaveLength(3);
    expect(n).toBe(3);
  });

  it('таймаут без коду, але з текстом — теж транзиентний', async () => {
    let n = 0;
    const out = await fetchAllRows<Row>(async () => {
      n++;
      return n === 1
        ? { data: null, error: { message: 'canceling statement due to statement timeout' } }
        : { data: rows(1), error: null };
    });
    expect(out).toHaveLength(1);
  });

  it('не нескінченний: після трьох спроб таймаут прокидається нагору', async () => {
    let n = 0;
    await expect(fetchAllRows<Row>(async () => {
      n++;
      return { data: null, error: { code: '57014', message: 'statement timeout' } };
    })).rejects.toMatchObject({ code: '57014' });
    expect(n).toBe(3);
  });

  it('інші помилки не ретраяться — падають одразу', async () => {
    let n = 0;
    await expect(fetchAllRows<Row>(async () => {
      n++;
      return { data: null, error: { code: '42501', message: 'permission denied' } };
    })).rejects.toMatchObject({ code: '42501' });
    expect(n).toBe(1);
  });
});

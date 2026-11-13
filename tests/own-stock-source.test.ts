import { describe, it, expect } from 'vitest';
import { attributeFifo, type FifoBatch, type FifoOut } from '../lib/accounting/own-stock-source';

const ZRH = 1, RYNOK = 2;
const b = (id: string, supplier_id: number, cost_price: number, qty: number, at: string): FifoBatch =>
  ({ id, supplier_id, cost_price, initial_qty: qty, received_at: at, created_at: at });
const out = (id: number, qty: number, order_id: string, at: string): FifoOut => ({ id, qty: -qty, order_id, moved_at: at });

describe('attributeFifo — фактичний постачальник позиції з власного складу', () => {
  it('2004-002: прив’язка ЗРХ, але партія з «Ринку» 626 ₴ — ще не відвантажене', () => {
    const parts = attributeFifo([b('B1', RYNOK, 626, 2, '2026-11-13T09:30:43Z')], [], 'O79', 2);
    expect(parts).toEqual([{ supplier_id: RYNOK, qty: 2, unit_cost: 626 }]);
  });

  it('відвантажене — за власними розходами, навіть якщо черга вже інша', () => {
    const batches = [b('B1', ZRH, 586, 1, '2026-10-01T00:00:00Z'), b('B2', RYNOK, 626, 2, '2026-11-13T00:00:00Z')];
    const outs = [out(1, 1, 'OLD', '2026-10-16T00:00:00Z'), out(2, 2, 'O79', '2026-11-14T00:00:00Z')];
    expect(attributeFifo(batches, outs, 'O79', 2)).toEqual([{ supplier_id: RYNOK, qty: 2, unit_cost: 626 }]);
    expect(attributeFifo(batches, outs, 'OLD', 1)).toEqual([{ supplier_id: ZRH, qty: 1, unit_cost: 586 }]);
  });

  it('розхід через дві партії різних постачальників — дві частини', () => {
    const batches = [b('B1', ZRH, 100, 1, '2026-11-01T00:00:00Z'), b('B2', RYNOK, 120, 5, '2026-11-02T00:00:00Z')];
    expect(attributeFifo(batches, [out(1, 3, 'O1', '2026-11-03T00:00:00Z')], 'O1', 3)).toEqual([
      { supplier_id: ZRH, qty: 1, unit_cost: 100 },
      { supplier_id: RYNOK, qty: 2, unit_cost: 120 },
    ]);
  });

  it('партія, що прийшла ПІСЛЯ розходу, цим розходом не списується', () => {
    const batches = [b('B1', ZRH, 100, 1, '2026-11-01T00:00:00Z'), b('B2', RYNOK, 120, 5, '2026-11-05T00:00:00Z')];
    const parts = attributeFifo(batches, [out(1, 1, 'O1', '2026-11-03T00:00:00Z')], 'O2', 2);
    expect(parts).toEqual([{ supplier_id: RYNOK, qty: 2, unit_cost: 120 }]);
  });

  it('немає партій — порожньо (рядок піде звичайним шляхом)', () => {
    expect(attributeFifo([], [], 'O1', 2)).toEqual([]);
  });
});

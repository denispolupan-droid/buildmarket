import { describe, it, expect } from 'vitest';
import { orderPoEvents, orderSales, dayOf } from '../app/admin/procurement/[id]/chain-order';

const receipt = { id: 'r1', doc_number: 'ПН-2026-0012', doc_type: 'receipt', doc_date: '2026-10-23 07:41:22.418+00', status: 'confirmed', total_cost: 1200, notes: null };
const adj     = { id: 'a1', doc_number: 'КЗ-2026-0001', doc_type: 'purchase_order_adjustment', doc_date: '2026-10-23', status: 'confirmed', notes: null };
const pay     = { id: 'p1', txn_id: 't1', amount: -1327.6, business_date: '2026-10-23', description: null, account_type: 'bank', doc_type: 'supplier_payment' };
const exp     = { id: 'p2', txn_id: 't2', amount: 150, business_date: '2026-10-23', description: 'Доставка', account_type: 'logistics', doc_type: 'expense' };
const supplierSide = { id: 'p3', txn_id: 't1', amount: 1327.6, business_date: '2026-10-23', description: null, account_type: 'supplier', doc_type: 'supplier_payment' };

describe('ланцюжок закупівлі — порядок подій', () => {
  it('того самого дня: коригування → прихід → оплата → витрати; рахунок постачальника не показується', () => {
    const ev = orderPoEvents({ payments: [exp, pay, supplierSide], adjustments: [adj], children: [receipt] });
    expect(ev.map(e => e.kind)).toEqual(['adjustment', 'receipt', 'payment', 'expense']);
  });

  it('різні дні — хронологічно, незалежно від типу (передоплата раніше за прихід)', () => {
    const prepay = { ...pay, id: 'p0', business_date: '2026-10-20' };
    const ev = orderPoEvents({ payments: [prepay], children: [receipt] });
    expect(ev.map(e => e.kind)).toEqual(['payment', 'receipt']);
  });

  it('doc_date з часом і без часу порівнюються по дню', () => {
    expect(dayOf('2026-10-23 07:41:22.418+00')).toBe('2026-10-23');
    expect(dayOf('2026-10-23')).toBe('2026-10-23');
    const late = { ...receipt, id: 'r2', doc_date: '2026-10-24' };
    const ev = orderPoEvents({ payments: [], children: [late, receipt] });
    expect(ev.map(e => e.data.id)).toEqual(['r1', 'r2']);
  });

  it('відшкодована витрата (amount ≤ 0) не показується як витрата', () => {
    const ev = orderPoEvents({ payments: [{ ...exp, amount: -150 }], children: [] });
    expect(ev).toEqual([]);
  });
});

describe('ланцюжок закупівлі — продажі', () => {
  it('лише sale, хронологічно, скасовані в кінці', () => {
    const sales = orderSales([
      { id: 's3', doc_number: 'РН-2026-0700', doc_type: 'sale', doc_date: '2026-10-22', status: 'cancelled', total_amount: 100, total_cost: 50, order_id: 'o' },
      { id: 's2', doc_number: 'РН-2026-0690', doc_type: 'sale', doc_date: '2026-10-25', status: 'confirmed', total_amount: 100, total_cost: 50, order_id: 'o' },
      { id: 'x',  doc_number: 'ПН-2026-0012', doc_type: 'receipt', doc_date: '2026-10-23', status: 'confirmed', total_amount: null, total_cost: 1200, order_id: 'o' },
      { id: 's1', doc_number: 'РН-2026-0678', doc_type: 'sale', doc_date: '2026-10-23 00:00:00+00', status: 'draft', total_amount: 1880, total_cost: 0, order_id: 'o' },
    ]);
    expect(sales.map(s => s.id)).toEqual(['s1', 's2', 's3']);
  });
});

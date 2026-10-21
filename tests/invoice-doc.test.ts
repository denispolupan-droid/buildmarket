import { describe, it, expect } from 'vitest';
import { invoiceAmountDue, invoicePurpose, invoiceDate } from '../lib/invoice-doc';

describe('invoice-doc', () => {
  it('залишок до сплати: повна сума, частково оплачено, оплачено', () => {
    expect(invoiceAmountDue({ total_price: 1275, amount_paid: null })).toBe(1275);
    expect(invoiceAmountDue({ total_price: 1275, amount_paid: 275 })).toBe(1000);
    expect(invoiceAmountDue({ total_price: 1275, amount_paid: 1275 })).toBe(0);
    expect(invoiceAmountDue({ total_price: 1275, amount_paid: 1300 })).toBe(0);
    expect(invoiceAmountDue({ total_price: 0.1 + 0.2, amount_paid: 0 })).toBe(0.3);
  });

  it('дата рахунку — за Києвом, призначення — з короткою датою', () => {
    const order = { order_number: 26101122, created_at: '2026-10-19T22:30:00Z' };
    expect(invoiceDate(order)).toBe('2026-10-20');
    expect(invoicePurpose(order)).toBe('Оплата за замовлення №26101122 від 20.10.2026. Без ПДВ.');
  });
});

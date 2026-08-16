import { describe, it, expect } from 'vitest';
import { procurementPaymentOr, netPaidToSupplier } from '../lib/accounting/procurement-payments';

describe('procurementPaymentOr', () => {
  it('шукає і по doc_id, і по meta.po_id', () => {
    // Оплати через ваучер зв'язані з закупівлею лише через meta.po_id —
    // фільтр тільки по doc_id саме тому й давав нуль.
    expect(procurementPaymentOr('abc')).toBe('doc_id.eq.abc,meta->>po_id.eq.abc');
  });
});

describe('netPaidToSupplier', () => {
  const pay = (amount: number) => ({ amount, doc_type: 'supplier_payment', account_type: 'supplier' });
  const payCash = (amount: number) => ({ amount, doc_type: 'supplier_payment', account_type: 'cash' });
  const reversal = (amount: number) => ({ amount, doc_type: 'supplier_payment_reversal', account_type: 'supplier' });

  it('сумує оплати по стороні постачальника', () => {
    expect(netPaidToSupplier([pay(20), pay(30)])).toBe(50);
  });

  it('ігнорує другу половину подвійного запису', () => {
    // Інакше пара +20 / −20 схлопнулась би в нуль і все виглядало б неоплаченим.
    expect(netPaidToSupplier([pay(20), payCash(-20)])).toBe(20);
  });

  it('віднімає сторновані оплати', () => {
    expect(netPaidToSupplier([pay(20), reversal(-20)])).toBe(0);
  });

  it('оплата після сторно рахується наново', () => {
    expect(netPaidToSupplier([pay(20), reversal(-20), pay(20)])).toBe(20);
  });

  it('не бере сторонні проводки', () => {
    const cogs = { amount: 999, doc_type: 'sale', account_type: 'supplier' };
    expect(netPaidToSupplier([pay(20), cogs])).toBe(20);
  });

  it('приймає суми рядком (PostgREST віддає numeric як string)', () => {
    expect(netPaidToSupplier([{ amount: '20.00', doc_type: 'supplier_payment', account_type: 'supplier' }])).toBe(20);
  });
});

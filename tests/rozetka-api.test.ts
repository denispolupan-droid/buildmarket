import { describe, it, expect } from 'vitest';
import { rozetkaOrderToOurFormat } from '../lib/rozetka-api';
import type { RozetkaOrder } from '../lib/rozetka-api';

describe('rozetkaOrderToOurFormat — спосіб оплати', () => {
  const base = {
    id: 900723314, created: '2026-07-20 22:21:14', changed: '', status: 1, status_group: 1 as const,
    amount: '320', cost: '320', cost_with_discount: '320', comment: null,
    user_phone: '+380505468348', user_title: { full_name: 'Владислав Шишлов' },
    ttn: null, purchases: [], delivery: null,
  };

  it('картка з payment_status paid → prepaid + оплачено', () => {
    const m = rozetkaOrderToOurFormat({
      ...base,
      payment: { payment_type: 'card', payment_method_name: 'Оплата карткою Visa/MasterCard',
                 payment_status: { name: 'paid', title: 'Оплачено', value: 1 } },
    } as unknown as RozetkaOrder);
    expect(m.payment_type).toBe('prepaid');
    expect(m.paid).toBe(true);
  });

  it('готівка (cash) → cod, не оплачено', () => {
    const m = rozetkaOrderToOurFormat({
      ...base,
      payment: { payment_type: 'cash', payment_method_name: 'Накладений платіж', payment_status: null },
    } as unknown as RozetkaOrder);
    expect(m.payment_type).toBe('cod');
    expect(m.paid).toBe(false);
  });

  it('картка без ознаки оплати → invoice, не оплачено', () => {
    const m = rozetkaOrderToOurFormat({
      ...base,
      payment: { payment_type: 'card', payment_method_name: 'Оплата карткою', payment_status: { name: 'pending', title: 'Очікує', value: 0 } },
    } as unknown as RozetkaOrder);
    expect(m.payment_type).toBe('invoice');
    expect(m.paid).toBe(false);
  });
});

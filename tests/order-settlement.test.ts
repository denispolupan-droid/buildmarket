import { describe, it, expect } from 'vitest';
import { settlementFor, settlementMap } from '../lib/accounting/order-settlement';

const e = (counterparty_id: string | null, amount: number, doc_type = 'sale', order_id = 'o1') => ({ order_id, counterparty_id, amount, doc_type });

describe('settlementFor — «виплачено» по замовленню', () => {
  it('наложка НП: продаж на np:cod, виплата по ЕН мінус комісія → received', () => {
    const s = settlementFor([e('np:cod', 2051), e('np:cod', -2040.74, 'payment'), e('np:cod', -10.26, 'np_fee')]);
    expect(s.state).toBe('received');
    expect(s.received).toBe(2051);
  });
  it('вручено, виплати ще немає → pending з відкритою сумою', () => {
    expect(settlementFor([e('mp:rozetka', 675)])).toEqual({ state: 'pending', sale: 675, received: 0, open: 675 });
  });
  it('рознесена виплата RozetkaPay закриває mp:rozetka; кліринг mp:rozetkapay не рахується', () => {
    const s = settlementFor([e('mp:rozetka', 675), e('mp:rozetkapay', 675, 'payment'), e('mp:rozetka', -675, 'payment')]);
    expect(s.state).toBe('received');
  });
  it('аванс: RozetkaPay заплатила до вручення (продажу ще немає) → received', () => {
    expect(settlementFor([e('mp:rozetkapay', 500, 'payment'), e('mp:prom', -500, 'payment')]).state).toBe('received');
  });
  it('перекласифікація рахунку на кліринг не робить замовлення неоплаченим', () => {
    const s = settlementFor([e('cust', 2050), e('cust', -2050, 'customer_payment'), e('mp:rozetkapay', 2050, 'correction')]);
    expect(s.state).toBe('received');
  });
  it('без проводок → none', () => {
    expect(settlementFor([]).state).toBe('none');
  });
  it('settlementMap групує по замовленнях', () => {
    const m = settlementMap([e('np:cod', 100, 'sale', 'a'), e('np:cod', -99.5, 'payment', 'a'), e('np:cod', -0.5, 'np_fee', 'a'), e('mp:prom', 300, 'sale', 'b'), e('x', 1, 'sale', null as unknown as string)]);
    expect(m.a.state).toBe('received');
    expect(m.b).toEqual({ state: 'pending', sale: 300, received: 0, open: 300 });
    expect(Object.keys(m)).toHaveLength(2);
  });
});

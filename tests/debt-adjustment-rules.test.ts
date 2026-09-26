import { describe, it, expect } from 'vitest';
import {
  legsFor, validateLine, orderPaymentDeltas, partnerBalanceDeltas, sideStateFrom, debitCapacity, creditCapacity, totalAmount, describeLine,
  type AdjustmentLineInput, type DebtSide, type SideState,
} from '../lib/accounting/debt-adjustment-rules';

const CUST = '6d77c4f2-4633-4d32-aef7-48a93c9f4940';
const CUST2 = '00206d0f-67fb-450a-bfc2-20e3ee034766';
const PARTNER = 'ccc6b4f0-1f23-4994-9319-48aa1a1b3111';
const ORD_A = 'a0000000-0000-4000-8000-000000000001';
const ORD_B = 'b0000000-0000-4000-8000-000000000002';

const cust = (orderId?: string): DebtSide => ({ account: 'customer', party: CUST, orderId: orderId ?? null });
const sup  = (id = '1'): DebtSide => ({ account: 'supplier', party: id });
const part = (id = PARTNER): DebtSide => ({ account: 'partner', party: id });

function ctx(states: Record<string, SideState>) {
  return { stateOf: (s: DebtSide) => states[`${s.account}:${s.party}:${s.orderId ?? ''}`], label: (s: DebtSide) => s.orderId ? `#${s.orderId.slice(0, 1)}` : s.party };
}

describe('legsFor — проводки за видом операції', () => {
  it('перенесення: DR звідки / CR куди, order_id окремо на кожній нозі', () => {
    const line: AdjustmentLineInput = { op: 'transfer', from: cust(ORD_A), to: cust(ORD_B), amount: 1326 };
    const { debit, credit } = legsFor(line);
    expect(debit).toEqual({ account: 'customer', party: CUST, orderId: ORD_A });
    expect(credit).toEqual({ account: 'customer', party: CUST, orderId: ORD_B });
  });
  it('взаємозалік: DR supplier / CR customer', () => {
    const { debit, credit } = legsFor({ op: 'offset', customer: cust(), supplier: sup(), amount: 100 });
    expect(debit.account).toBe('supplier');
    expect(credit.account).toBe('customer');
  });
  it('списання: прощення — DR bad_debt (витрата) / CR клієнт; переплата в дохід — DR клієнт / CR correction', () => {
    const forgive = legsFor({ op: 'write_off', side: cust(ORD_A), kind: 'forgive', amount: 5 });
    expect(forgive.debit).toEqual({ account: 'bad_debt', party: null, orderId: null });
    expect(forgive.credit).toEqual({ account: 'customer', party: CUST, orderId: ORD_A });
    const income = legsFor({ op: 'write_off', side: cust(), kind: 'income', amount: 5 });
    expect(income.debit.account).toBe('customer');
    expect(income.credit.account).toBe('correction');
  });
  it('партнер: компенсація — DR bad_debt / CR partner; баланс у дохід — DR partner / CR correction', () => {
    const comp = legsFor({ op: 'write_off', side: part(), kind: 'forgive', amount: 200 });
    expect(comp.debit.account).toBe('bad_debt');
    expect(comp.credit).toEqual({ account: 'partner', party: PARTNER, orderId: null });
    expect(describeLine({ op: 'write_off', side: part(), kind: 'forgive', amount: 200 }, s => s.party)).toMatch(/Компенсація на баланс/);
    const income = legsFor({ op: 'write_off', side: part(), kind: 'income', amount: 200 });
    expect(income.debit.account).toBe('partner');
    expect(income.credit.account).toBe('correction');
  });
});

describe('sideStateFrom / capacity', () => {
  it('розклад по замовленню: продаж 1326, отримано 1326 → open 0, received 1326', () => {
    const st = sideStateFrom(0, [
      { order_id: ORD_A, counterparty_id: CUST, amount: 1326, doc_type: 'sale' },
      { order_id: ORD_A, counterparty_id: CUST, amount: -1326, doc_type: 'payment' },
    ]);
    expect(st).toEqual({ balance: 0, sale: 1326, received: 1326, open: 0 });
    expect(debitCapacity(cust(ORD_A), st)).toBe(1326);
    expect(creditCapacity(cust(ORD_A), st, 'transfer')).toBe(0);
  });
  it('кліринг RozetkaPay не входить у розклад замовлення', () => {
    const st = sideStateFrom(0, [
      { order_id: ORD_A, counterparty_id: 'mp:rozetka', amount: 300, doc_type: 'sale' },
      { order_id: ORD_A, counterparty_id: 'mp:rozetkapay', amount: -300, doc_type: 'rzpay-alloc' },
    ]);
    expect(st.open).toBe(300);
  });
  it('без замовлення: дебет — лише аванс (від’ємне сальдо), кредит при перенесенні без межі', () => {
    expect(debitCapacity(cust(), { balance: -450 })).toBe(450);
    expect(debitCapacity(cust(), { balance: 450 })).toBe(0);
    expect(creditCapacity(cust(), { balance: 450 }, 'transfer')).toBe(Number.POSITIVE_INFINITY);
    expect(creditCapacity(cust(), { balance: 450 }, 'write_off')).toBe(450);
    // постачальник: ми винні 2 709,60 → зняти (заліком) можна до цієї суми
    expect(debitCapacity(sup(), { balance: -2709.6 })).toBe(2709.6);
  });
  it('партнер: дебет — баланс кабінету (не леджер), кредит — без межі', () => {
    // В обліку ми винні 500, але 382 уже списано під замовлення в дорозі → доступно 118
    const st = sideStateFrom(-500, null, 118);
    expect(st).toEqual({ balance: -500, cabinet: 118 });
    expect(debitCapacity(part(), st)).toBe(118);
    expect(creditCapacity(part(), st, 'write_off')).toBe(Number.POSITIVE_INFINITY);
    expect(creditCapacity(part(), st, 'transfer')).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('validateLine', () => {
  const states: Record<string, SideState> = {
    [`customer:${CUST}:${ORD_A}`]: { balance: 0, sale: 1326, received: 1326, open: 0 },
    [`customer:${CUST}:${ORD_B}`]: { balance: 0, sale: 1326, received: 0, open: 1326 },
    [`customer:${CUST}:`]:         { balance: 0 },
    [`customer:${CUST2}:`]:        { balance: 500 },
    ['supplier:1:']:               { balance: -2709.6 },
    [`partner:${PARTNER}:`]:       { balance: -500, cabinet: 118 },
  };

  it('партнер: балансом закрити замовлення клієнта — ок у межах кабінету; більше — відмова', () => {
    expect(validateLine({ op: 'transfer', from: part(), to: cust(ORD_B), amount: 100 }, ctx(states))).toBeNull();
    expect(validateLine({ op: 'transfer', from: part(), to: cust(ORD_B), amount: 200 }, ctx(states))).toMatch(/на балансі партнера лише 118,00/);
    // переплата клієнта → на баланс партнера: без межі з боку партнера
    const st = { ...states, [`customer:${CUST}:`]: { balance: -300 } };
    expect(validateLine({ op: 'transfer', from: cust(), to: part(), amount: 300 }, ctx(st))).toBeNull();
    expect(validateLine({ op: 'transfer', from: cust(), to: part(), amount: 301 }, ctx(st))).toMatch(/аванс\/переплата лише 300,00/);
  });
  it('партнер: із замовленням, з постачальником, у взаємозаліку — відмови', () => {
    expect(validateLine({ op: 'transfer', from: { ...part(), orderId: ORD_A }, to: cust(ORD_B), amount: 1 }, ctx(states))).toMatch(/не ділиться по замовленнях/);
    expect(validateLine({ op: 'transfer', from: part(), to: sup(), amount: 1 }, ctx(states))).toMatch(/Взаємозалік/);
    expect(validateLine({ op: 'offset', customer: part(), supplier: sup(), amount: 1 }, ctx(states))).toMatch(/одна сторона — клієнт/);
    expect(validateLine({ op: 'write_off', side: part('np:cod'), kind: 'income', amount: 1 }, ctx(states))).toMatch(/Некоректний партнер/);
  });
  it('партнер: компенсація без межі, у дохід — не більше кабінету', () => {
    expect(validateLine({ op: 'write_off', side: part(), kind: 'forgive', amount: 5000 }, ctx(states))).toBeNull();
    expect(validateLine({ op: 'write_off', side: part(), kind: 'income', amount: 118 }, ctx(states))).toBeNull();
    expect(validateLine({ op: 'write_off', side: part(), kind: 'income', amount: 118.01 }, ctx(states))).toMatch(/на балансі партнера лише 118,00/);
  });

  it('живий кейс 17.09: перенесення 1326 з оплаченого #A на неоплачений #B — ок', () => {
    expect(validateLine({ op: 'transfer', from: cust(ORD_A), to: cust(ORD_B), amount: 1326 }, ctx(states))).toBeNull();
  });
  it('зняти більше, ніж отримано по замовленню — відмова', () => {
    // Локаль uk-UA розділяє тисячі нерозривним пробілом — у регексі беремо будь-який роздільник
    expect(validateLine({ op: 'transfer', from: cust(ORD_A), to: cust(ORD_B), amount: 1400 }, ctx(states))).toMatch(/отримано лише 1\D326,00/);
  });
  it('покласти на замовлення більше відкритого боргу — відмова', () => {
    const st = { ...states, [`customer:${CUST}:${ORD_A}`]: { balance: 0, sale: 2000, received: 2000, open: 0 } };
    expect(validateLine({ op: 'transfer', from: cust(ORD_A), to: cust(ORD_B), amount: 1500 }, ctx(st))).toMatch(/відкритий борг по замовленню лише 1\D326,00/);
  });
  it('перенесення між клієнтом і постачальником заборонене — це взаємозалік', () => {
    expect(validateLine({ op: 'transfer', from: cust(), to: sup(), amount: 1 }, ctx(states))).toMatch(/Взаємозалік/);
  });
  it('однакові сторони — відмова', () => {
    expect(validateLine({ op: 'transfer', from: cust(ORD_A), to: cust(ORD_A), amount: 1 }, ctx(states))).toMatch(/збігаються/);
  });
  it('взаємозалік: не більше боргу клієнта і не більше нашого боргу постачальнику', () => {
    expect(validateLine({ op: 'offset', customer: { account: 'customer', party: CUST2 }, supplier: sup(), amount: 500 }, ctx(states))).toBeNull();
    expect(validateLine({ op: 'offset', customer: { account: 'customer', party: CUST2 }, supplier: sup(), amount: 600 }, ctx(states))).toMatch(/борг лише 500,00/);
    const st = { ...states, ['supplier:1:']: { balance: -100 } };
    expect(validateLine({ op: 'offset', customer: { account: 'customer', party: CUST2 }, supplier: sup(), amount: 200 }, ctx(st))).toMatch(/ми винні лише 100,00/);
  });
  it('списання переплати в дохід без переплати — відмова; прощення боргу в межах open — ок', () => {
    expect(validateLine({ op: 'write_off', side: cust(ORD_B), kind: 'income', amount: 10 }, ctx(states))).toMatch(/отримано лише 0,00/);
    expect(validateLine({ op: 'write_off', side: cust(ORD_B), kind: 'forgive', amount: 10 }, ctx(states))).toBeNull();
  });
  it('нуль, від’ємне, три знаки після коми, постачальник із замовленням — відмови', () => {
    expect(validateLine({ op: 'transfer', from: cust(ORD_A), to: cust(ORD_B), amount: 0 }, ctx(states))).toMatch(/більшою за нуль/);
    expect(validateLine({ op: 'transfer', from: cust(ORD_A), to: cust(ORD_B), amount: 1.005 }, ctx(states))).toMatch(/двох знаків/);
    expect(validateLine({ op: 'transfer', from: { ...sup(), orderId: ORD_A }, to: sup('2'), amount: 1 }, ctx(states))).toMatch(/не ділиться/);
  });
});

describe('orderPaymentDeltas — вплив на шар замовлення', () => {
  it('перенесення між замовленнями клієнта: −на звідки, +на куди', () => {
    expect(orderPaymentDeltas({ op: 'transfer', from: cust(ORD_A), to: cust(ORD_B), amount: 1326 }))
      .toEqual([{ orderId: ORD_B, delta: 1326 }, { orderId: ORD_A, delta: -1326 }]);
  });
  it('службові дебітори (np:cod, mp:*) шар замовлення не чіпають', () => {
    expect(orderPaymentDeltas({ op: 'transfer', from: { account: 'customer', party: 'np:cod', orderId: ORD_A }, to: cust(ORD_B), amount: 10 }))
      .toEqual([{ orderId: ORD_B, delta: 10 }]);
  });
  it('без замовлення — нічого', () => {
    expect(orderPaymentDeltas({ op: 'offset', customer: cust(), supplier: sup(), amount: 10 })).toEqual([]);
  });
  it('партнер: кредит = баланс кабінету +, дебет = −; замовлення клієнта при цьому отримує оплату', () => {
    const line: AdjustmentLineInput = { op: 'transfer', from: part(), to: cust(ORD_B), amount: 100 };
    expect(partnerBalanceDeltas(line)).toEqual([{ partner: PARTNER, delta: -100 }]);
    expect(orderPaymentDeltas(line)).toEqual([{ orderId: ORD_B, delta: 100 }]);
    expect(partnerBalanceDeltas({ op: 'write_off', side: part(), kind: 'forgive', amount: 50 })).toEqual([{ partner: PARTNER, delta: 50 }]);
    expect(partnerBalanceDeltas({ op: 'transfer', from: cust(ORD_A), to: cust(ORD_B), amount: 1 })).toEqual([]);
  });
  it('totalAmount рахує в копійках без плаваючого хвоста', () => {
    expect(totalAmount([{ op: 'write_off', side: cust(), kind: 'forgive', amount: 0.1 }, { op: 'write_off', side: cust(), kind: 'forgive', amount: 0.2 }])).toBe(0.3);
  });
});

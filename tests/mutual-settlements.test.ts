import { describe, it, expect } from 'vitest';
import {
  buildMutualStatement, parseCounterpartyRef, counterpartyRefString, accountsFor, operationLabel,
  buildJournal, documentHref, groupOf, parseGroup, openItemsByOrder, saldoWords,
  type LedgerEntry,
} from '../lib/accounting/mutual-settlements';

const P = '0b6c3a1e-6d0f-4c2a-9a54-3f1c2b7d9e10';

let seq = 0;
const e = (p: Partial<LedgerEntry> & Pick<LedgerEntry, 'account_type' | 'amount'>): LedgerEntry => ({
  id: `e${++seq}`, txn_id: `t${seq}`, doc_type: null, business_date: '2026-10-10',
  created_at: `2026-10-10T10:00:${String(seq).padStart(2, '0')}Z`, description: null, doc_id: null, order_id: null,
  ...p,
});

describe('parseCounterpartyRef', () => {
  it('розрізняє клієнта, службового дебітора і постачальника', () => {
    expect(parseCounterpartyRef(`c:${P}`)).toEqual({ kind: 'customer', id: P });
    expect(parseCounterpartyRef('c:np:cod')).toEqual({ kind: 'special', id: 'np:cod' });
    expect(parseCounterpartyRef('s:12')).toEqual({ kind: 'supplier', id: '12' });
  });

  it('відкидає сміття замість того, щоб піти з ним у базу', () => {
    for (const bad of ['', 'x:1', 's:abc', 'c:not-a-uuid', 'c:mp:unknown', null, undefined]) {
      expect(parseCounterpartyRef(bad)).toBeNull();
    }
  });

  it('рядок посилання повертається туди ж', () => {
    for (const raw of [`c:${P}`, 'c:mp:prom', 's:7']) {
      expect(counterpartyRefString(parseCounterpartyRef(raw)!)).toBe(raw);
    }
  });

  it('рахунки: клієнт — покупець + аванс партнера, постачальник — лише свій', () => {
    expect(accountsFor({ kind: 'customer', id: P })).toEqual(['customer', 'partner']);
    expect(accountsFor({ kind: 'special', id: 'np:cod' })).toEqual(['customer']);
    expect(accountsFor({ kind: 'supplier', id: '1' })).toEqual(['supplier']);
  });
});

describe('buildMutualStatement', () => {
  it('дропшипер: поповнення, продаж із заліком, наложка — сальдо = сума рахунків', () => {
    const entries = [
      e({ account_type: 'partner',  amount: -1000, doc_type: 'partner_topup', business_date: '2026-10-02' }),
      e({ account_type: 'customer', amount: 600,   doc_type: 'sale',          business_date: '2026-10-05' }),
      // залік — одна проводка, дві ноги того ж контрагента
      e({ id: 'o1', txn_id: 'off', account_type: 'partner',  amount: 600,  doc_type: 'advance_offset', business_date: '2026-10-05' }),
      e({ id: 'o2', txn_id: 'off', account_type: 'customer', amount: -600, doc_type: 'advance_offset', business_date: '2026-10-05' }),
      e({ account_type: 'partner',  amount: -900,  doc_type: 'partner_cod',   business_date: '2026-10-07' }),
      e({ account_type: 'partner',  amount: 18,    doc_type: 'partner_cod',   business_date: '2026-10-07' }),
    ];
    const s = buildMutualStatement({ accounts: ['customer', 'partner'], opening: { partner: -50 }, entries });

    expect(s.accounts).toEqual([
      { account: 'customer', opening: 0,   debit: 600, credit: 600,  closing: 0 },
      { account: 'partner',  opening: -50, debit: 618, credit: 1900, closing: -1332 },
    ]);
    expect(s.opening).toBe(-50);
    expect(s.closing).toBe(-1332);

    // Залік схований, а виписка все одно сходиться: початок + рядки = кінець
    expect(s.hiddenInternal).toBe(2);
    expect(s.rows.map(r => r.label)).toEqual([
      'Поповнення балансу', 'Відвантаження', 'Наложка до виплати партнеру', 'Комісія НоваПей за наложку',
    ]);
    const net = s.rows.reduce((sum, r) => sum + r.amount, 0);
    expect(Math.round((s.opening + net) * 100) / 100).toBe(s.closing);
  });

  it('showInternal показує залік і нічого не ховає', () => {
    const entries = [
      e({ txn_id: 'x', account_type: 'partner',  amount: 100 }),
      e({ txn_id: 'x', account_type: 'customer', amount: -100 }),
    ];
    const s = buildMutualStatement({ accounts: ['customer', 'partner'], opening: {}, entries, showInternal: true });
    expect(s.rows).toHaveLength(2);
    expect(s.hiddenInternal).toBe(0);
  });

  it('нога на ТОМУ Ж рахунку з нульовою сумою — не залік, лишається', () => {
    const entries = [
      e({ txn_id: 'y', account_type: 'customer', amount: 100 }),
      e({ txn_id: 'y', account_type: 'customer', amount: -100 }),
    ];
    expect(buildMutualStatement({ accounts: ['customer'], opening: {}, entries }).rows).toHaveLength(2);
  });

  it('проводка і її сторно в періоді ховаються парою; сторно без оригіналу — ні', () => {
    const entries = [
      e({ id: 'orig', account_type: 'partner', amount: 500, business_date: '2026-09-14' }),
      e({ id: 'rev',  account_type: 'partner', amount: -500, doc_type: 'correction', reversal_of: 'orig', business_date: '2026-09-27' }),
      e({ id: 'lone', account_type: 'partner', amount: 382, doc_type: 'correction', reversal_of: 'outside-period' }),
      e({ id: 'top',  account_type: 'partner', amount: -573, doc_type: 'partner_topup' }),
    ];
    const s = buildMutualStatement({ accounts: ['partner'], opening: {}, entries });
    expect(s.rows.map(r => r.id)).toEqual(['lone', 'top']);
    expect(s.hiddenInternal).toBe(2);
    expect(s.closing).toBe(-191);
  });

  it('сортує за датою обліку, потім за часом створення', () => {
    const entries = [
      e({ id: 'late', account_type: 'customer', amount: 1, business_date: '2026-10-09' }),
      e({ id: 'early', account_type: 'customer', amount: 1, business_date: '2026-10-01' }),
    ];
    expect(buildMutualStatement({ accounts: ['customer'], opening: {}, entries }).rows.map(r => r.id)).toEqual(['early', 'late']);
  });
});

describe('buildJournal', () => {
  it('сальдо на кінець і початок — від поточного кешу назад, без усієї історії', () => {
    const rows = buildJournal({
      current: new Map([['a', 1000], ['b', 0], ['idle', 0]]),
      entries: [
        { counterparty_id: 'a', amount: 700,  business_date: '2026-10-05' }, // у періоді
        { counterparty_id: 'a', amount: -200, business_date: '2026-10-20' }, // у періоді
        { counterparty_id: 'a', amount: 300,  business_date: '2026-11-02' }, // після періоду
        { counterparty_id: 'b', amount: -50,  business_date: '2026-10-10' },
        { counterparty_id: 'b', amount: 50,   business_date: '2026-11-01' },
      ],
      dateFrom: '2026-10-01', dateTo: '2026-10-31',
    });
    expect(rows).toEqual([
      { counterpartyId: 'a', opening: 200, debit: 700, credit: 200, closing: 700 },
      { counterpartyId: 'b', opening: 0,   debit: 0,   credit: 50,  closing: -50 },
    ]);
  });

  it('контрагент, якого немає в кеші, але з рухом — теж у списку', () => {
    const rows = buildJournal({
      current: new Map(),
      entries: [{ counterparty_id: 'n', amount: 10, business_date: '2026-10-03' }, { counterparty_id: 'n', amount: -10, business_date: '2026-10-04' }],
      dateFrom: '2026-10-01', dateTo: '2026-10-31',
    });
    expect(rows).toEqual([{ counterpartyId: 'n', opening: 0, debit: 10, credit: 10, closing: 0 }]);
  });
});

describe('documentHref', () => {
  it('веде на документ свого типу, без документа — у журнал замовлень', () => {
    expect(documentHref({ entryDocType: 'supplier_payment', docId: 'd', accDocType: 'supplier_payment' })).toBe('/admin/finance/voucher/d');
    expect(documentHref({ entryDocType: 'sale', docId: 'd', accDocType: 'receipt' })).toBe('/admin/procurement/receipts/d');
    expect(documentHref({ entryDocType: 'sale', docId: 'd', accDocType: 'sale', orderNumber: 26101112 })).toBe('/admin/accounting/documents/d');
    expect(documentHref({ entryDocType: 'debt_adjustment', docId: 'k' })).toBe('/admin/finance/adjustments?id=k');
    expect(documentHref({ entryDocType: 'partner_cod', docId: null, orderNumber: 26101112 })).toBe('/admin?status=&q=26101112');
    expect(documentHref({ entryDocType: 'partner_topup', docId: null })).toBeNull();
  });

  it('групи: постачальник, служба, дропшипер, покупець', () => {
    expect(groupOf({ kind: 'supplier', id: '1' })).toBe('suppliers');
    expect(groupOf({ kind: 'special', id: 'np:cod' })).toBe('services');
    expect(groupOf({ kind: 'customer', id: P }, 'dropship_partner')).toBe('partners');
    expect(groupOf({ kind: 'customer', id: P }, 'wholesale')).toBe('customers');
    expect(parseGroup('suppliers')).toBe('suppliers');
    expect(parseGroup('x')).toBeNull();
  });
});

describe('openItemsByOrder', () => {
  it('Rozetka: передоплата в дорозі — мінус, вручена наложка без виплати — плюс, закриті зникають', () => {
    const items = openItemsByOrder([
      { order_id: 'closed', amount: 600,   business_date: '2026-10-10' },
      { order_id: 'closed', amount: -600,  business_date: '2026-10-11' },
      { order_id: 'prepaid', amount: -470, business_date: '2026-10-21' },
      { order_id: 'cod',    amount: 520,   business_date: '2026-10-20' },
      { order_id: null,     amount: -15,   business_date: '2026-10-05' },
    ]);
    expect(items).toEqual([
      { orderId: 'cod',     net: 520,  lastDate: '2026-10-20' },
      { orderId: 'prepaid', net: -470, lastDate: '2026-10-21' },
      { orderId: null,      net: -15,  lastDate: '2026-10-05' },
    ]);
    expect(items.reduce((s, i) => s + i.net, 0)).toBe(35);
  });

  it('слова сальдо: для площадок мінус — «отримано наперед», а не борг', () => {
    expect(saldoWords(-2800, true).text).toBe('отримано наперед');
    expect(saldoWords(970, true).text).toBe('до виплати нам');
    expect(saldoWords(-2800, false).text).toBe('наш борг');
    expect(saldoWords(0.001, true).tone).toBe('zero');
  });
});

describe('operationLabel', () => {
  it('той самий документ читається з боку рахунку', () => {
    expect(operationLabel('customer', 'sale', 500)).toBe('Відвантаження');
    expect(operationLabel('supplier', 'sale', -500)).toBe('Отримано');
    expect(operationLabel('customer', 'customer_payment', -500)).toBe('Оплата');
    expect(operationLabel('supplier', 'supplier_payment', 500)).toBe('Оплата');
  });
});

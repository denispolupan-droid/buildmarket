/**
 * Взаєморозрахунки з контрагентом — усі його рахунки розрахунків в одній виписці.
 *
 * Один і той самий контрагент живе в леджері на кількох рахунках:
 *   • клієнт / оптовик / дропшипер (customers.id) — `customer` (його борг за
 *     відвантаження) і `partner` (аванс дропшипера: поповнення, наложка, виплати);
 *   • постачальник (suppliers.id) — `supplier`;
 *   • службовий дебітор (np:cod, mp:*) — лише `customer`.
 * Знак скрізь однаковий (money.ts): плюс — на нашу користь, мінус — винні ми.
 * Тому сальдо взаєморозрахунків — проста сума по всіх рахунках контрагента.
 *
 * Внутрішній залік між його ж рахунками (advance_offset: DR partner / CR customer)
 * грошей не рухає і в сумі дає нуль, тож у виписці й акті за замовчуванням
 * схований — інакше кожне дропшип-замовлення давало б зайву пару рядків.
 * Так само ховається пара «помилкова проводка + її сторно» (meta.reversal_of).
 */
import { isSpecialDebtor, SPECIAL_DEBTOR_LABEL } from './sale-party';

export type SettlementAccount = 'customer' | 'partner' | 'supplier';

export const SETTLEMENT_ACCOUNT_LABEL: Record<SettlementAccount, string> = {
  customer: 'Розрахунки з покупцем',
  partner:  'Баланс партнера (аванс)',
  supplier: 'Розрахунки з постачальником',
};

/** Посилання на контрагента в URL: `c:<customers.id | np:cod | mp:…>` або `s:<suppliers.id>`. */
export type CounterpartyRef =
  | { kind: 'customer'; id: string }
  | { kind: 'special'; id: string }
  | { kind: 'supplier'; id: string };

export function parseCounterpartyRef(raw: string | null | undefined): CounterpartyRef | null {
  const m = /^([cs]):(.+)$/.exec(String(raw ?? '').trim());
  if (!m) return null;
  const id = m[2];
  if (m[1] === 's') return /^\d+$/.test(id) ? { kind: 'supplier', id } : null;
  if (isSpecialDebtor(id)) return { kind: 'special', id };
  return /^[0-9a-f-]{36}$/i.test(id) ? { kind: 'customer', id } : null;
}

export function counterpartyRefString(ref: CounterpartyRef): string {
  return `${ref.kind === 'supplier' ? 's' : 'c'}:${ref.id}`;
}

export function accountsFor(ref: CounterpartyRef): SettlementAccount[] {
  if (ref.kind === 'supplier') return ['supplier'];
  if (ref.kind === 'special')  return ['customer'];
  return ['customer', 'partner'];
}

/** Групи журналу контрагентів — кнопки-фільтри над списком. */
export type CounterpartyGroup = 'customers' | 'partners' | 'suppliers' | 'services';

export const COUNTERPARTY_GROUPS: { key: CounterpartyGroup; label: string }[] = [
  { key: 'customers', label: 'Покупці' },
  { key: 'partners',  label: 'Дропшипери' },
  { key: 'suppliers', label: 'Постачальники' },
  { key: 'services',  label: 'Пошта й маркетплейси' },
];

export function parseGroup(raw: string | null | undefined): CounterpartyGroup | null {
  return COUNTERPARTY_GROUPS.some(g => g.key === raw) ? raw as CounterpartyGroup : null;
}

/** Група, до якої належить контрагент, — щоб «назад до списку» вело туди, звідки прийшли. */
export function groupOf(ref: CounterpartyRef, customerType?: string | null): CounterpartyGroup {
  if (ref.kind === 'supplier') return 'suppliers';
  if (ref.kind === 'special')  return 'services';
  return customerType === 'dropship_partner' ? 'partners' : 'customers';
}

export function groupAccounts(group: CounterpartyGroup): SettlementAccount[] {
  if (group === 'suppliers') return ['supplier'];
  if (group === 'services')  return ['customer'];
  return ['customer', 'partner'];
}

export type JournalRow = { counterpartyId: string; opening: number; debit: number; credit: number; closing: number };

/**
 * Обороти й сальдо кожного контрагента за період — без читання всієї історії:
 * поточне сальдо з кешу counterparty_balances мінус рухи після кінця періоду
 * дає сальдо на кінець, мінус рухи періоду — на початок. Тому досить проводок
 * від початку періоду до сьогодні (`entries`, будь-якого порядку).
 * Контрагенти без сальдо й без руху за період у список не потрапляють.
 */
export function buildJournal(params: {
  current: Map<string, number>;
  entries: { counterparty_id: string; amount: number; business_date: string }[];
  dateFrom: string;
  dateTo: string;
}): JournalRow[] {
  const acc = new Map<string, { after: number; debit: number; credit: number }>();
  const get = (id: string) => {
    let a = acc.get(id);
    if (!a) { a = { after: 0, debit: 0, credit: 0 }; acc.set(id, a); }
    return a;
  };
  for (const e of params.entries) {
    if (e.business_date < params.dateFrom) continue;
    const a = get(e.counterparty_id);
    const amt = Number(e.amount);
    if (e.business_date > params.dateTo) a.after += amt;
    else if (amt > 0) a.debit += amt;
    else a.credit -= amt;
  }
  const ids = new Set([...params.current.keys(), ...acc.keys()]);
  const out: JournalRow[] = [];
  for (const id of ids) {
    const a = acc.get(id) ?? { after: 0, debit: 0, credit: 0 };
    const closing = round2((params.current.get(id) ?? 0) - a.after);
    const debit = round2(a.debit), credit = round2(a.credit);
    const opening = round2(closing - debit + credit);
    if (Math.abs(opening) < EPS && debit < EPS && credit < EPS && Math.abs(closing) < EPS) continue;
    out.push({ counterpartyId: id, opening, debit, credit, closing });
  }
  return out.sort((x, y) => Math.abs(y.closing) - Math.abs(x.closing) || y.debit + y.credit - (x.debit + x.credit));
}

/**
 * Куди веде клік по документу в русі: ордер оплати, прихідна накладна,
 * замовлення постачальнику, КБ, РН/інший документ обліку. Без документа —
 * у журнал замовлень, відфільтрований за номером (окремої сторінки замовлення немає).
 */
export function documentHref(p: {
  entryDocType: string | null;
  docId: string | null;
  accDocType?: string | null;
  orderNumber?: number | null;
}): string | null {
  if (p.docId) {
    if (p.entryDocType === 'debt_adjustment') return `/admin/finance/adjustments?id=${p.docId}`;
    switch (p.accDocType) {
      case 'supplier_payment': case 'supplier_payment_reversal':
      case 'customer_payment': case 'customer_payment_reversal':
      case 'cash_in': case 'cash_out':
        return `/admin/finance/voucher/${p.docId}`;
      case 'receipt': case 'stock_in':
        return `/admin/procurement/receipts/${p.docId}`;
      case 'purchase_order':
        return `/admin/procurement/${p.docId}`;
    }
    if (p.accDocType) return `/admin/accounting/documents/${p.docId}`;
  }
  return orderHref(p.orderNumber);
}

export function orderHref(orderNumber: number | null | undefined): string | null {
  return orderNumber != null ? `/admin?status=&q=${orderNumber}` : null;
}

/**
 * Хто кому винен — словами. Для пошти й маркетплейсів мінус — не борг: площадка
 * переказує гроші передоплати до вручення (Rozetka Pay — наступного дня після
 * оплати), а продаж визнається при врученні. Тож мінус там — «отримано наперед»
 * за посилки в дорозі, плюс — вручене, за яке виплата ще не прийшла.
 */
export function saldoWords(v: number, special: boolean): { text: string; tone: 'pos' | 'neg' | 'zero' } {
  if (Math.abs(v) < EPS) return { text: 'розрахунки закриті', tone: 'zero' };
  if (special) return v > 0 ? { text: 'до виплати нам', tone: 'pos' } : { text: 'отримано наперед', tone: 'neg' };
  return v > 0 ? { text: 'борг контрагента', tone: 'pos' } : { text: 'наш борг', tone: 'neg' };
}

export type OpenItem = { orderId: string | null; net: number; lastDate: string };

/**
 * Що не закрито по замовленнях: сума всіх проводок контрагента по кожному
 * замовленню (на дату). Нуль — замовлення закрите (продаж і оплата зійшлись);
 * мінус — гроші отримано, продажу ще немає; плюс — продаж є, грошей ще немає.
 * Проводки без замовлення (нерознесені виплати тощо) — окремим рядком orderId=null.
 * Сума всіх рядків = сальдо контрагента на ту саму дату.
 */
export function openItemsByOrder(entries: { order_id: string | null; amount: number; business_date: string }[]): OpenItem[] {
  const m = new Map<string | null, { net: number; lastDate: string }>();
  for (const e of entries) {
    const k = e.order_id ?? null;
    const a = m.get(k) ?? { net: 0, lastDate: '' };
    a.net += Number(e.amount);
    if (e.business_date > a.lastDate) a.lastDate = e.business_date;
    m.set(k, a);
  }
  return [...m]
    .map(([orderId, a]) => ({ orderId, net: round2(a.net), lastDate: a.lastDate }))
    .filter(i => Math.abs(i.net) >= EPS)
    .sort((x, y) => (x.orderId === null ? 1 : 0) - (y.orderId === null ? 1 : 0) || x.lastDate.localeCompare(y.lastDate));
}

export function specialLabel(id: string): string {
  return isSpecialDebtor(id) ? SPECIAL_DEBTOR_LABEL[id] : id;
}

export type LedgerEntry = {
  id: string;
  txn_id: string;
  account_type: SettlementAccount;
  amount: number;
  doc_type: string | null;
  business_date: string;
  created_at: string;
  description: string | null;
  doc_id: string | null;
  order_id: string | null;
  /** meta.reversal_of — id проводки, яку ця сторнує (міграція 121 та ін.) */
  reversal_of?: string | null;
};

export type AccountSummary = {
  account: SettlementAccount;
  opening: number;
  debit: number;
  credit: number;
  closing: number;
};

export type StatementRow = LedgerEntry & { label: string };

export type MutualStatement = {
  accounts: AccountSummary[];
  opening: number;
  closing: number;
  rows: StatementRow[];
  /** Скільки рядків сховано: внутрішні заліки й пари «проводка + її сторно» (у сумі нуль). */
  hiddenInternal: number;
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const EPS = 0.005;

/**
 * Назва операції в колонці «Документ» — з боку рахунку і знака, бо один doc_type
 * на різних рахунках означає різне (partner_cod: на балансі партнера — наложка,
 * яку ми йому винні, або утримана комісія НоваПей).
 */
export function operationLabel(account: SettlementAccount, docType: string | null, amount: number): string {
  const inc = amount > 0; // на нашу користь
  switch (docType) {
    case 'sale':
      if (account === 'supplier') return inc ? 'Коригування поставки' : 'Отримано';
      return inc ? 'Відвантаження' : 'Сторно відвантаження';
    case 'receipt':
    case 'stock_in':                  return inc ? 'Коригування приходу' : 'Прихід товару';
    case 'customer_payment':
    case 'payment':
      if (account === 'supplier') return inc ? 'Оплата' : 'Повернення оплати';
      return inc ? 'Повернення оплати' : 'Оплата';
    case 'customer_payment_reversal': return 'Сторно оплати';
    case 'supplier_payment':          return inc ? 'Оплата' : 'Повернення оплати';
    case 'supplier_payment_reversal': return 'Сторно оплати';
    case 'return_in':                 return 'Повернення від покупця';
    case 'refund':                    return 'Повернення коштів';
    case 'return_out':                return account === 'supplier' ? 'Повернення постачальнику' : 'Повернення';
    case 'supplier_return':           return 'Повернення постачальнику';
    case 'np_fee':                    return 'Комісія НоваПей';
    case 'advance_offset':            return 'Залік авансу партнера';
    case 'partner_topup':             return 'Поповнення балансу';
    case 'partner_payout':            return 'Виплата партнеру';
    case 'partner_cod':
      if (account === 'partner') return inc ? 'Комісія НоваПей за наложку' : 'Наложка до виплати партнеру';
      return 'Наложка дропшип-посилки';
    case 'partner_return_fee':        return 'Зворотна доставка';
    case 'dropship_cancel':
      if (account === 'supplier') return inc ? 'Повернення постачальнику' : 'Коригування (недостача)';
      return 'Сторно (скасування замовлення)';
    case 'delivery_cost':             return 'Доставка';
    case 'commission':                return 'Комісія';
    case 'debt_adjustment':           return 'Коригування боргу';
    case 'correction':                return 'Коригування';
    default:                          return inc ? 'Нараховано' : 'Зараховано';
  }
}

/**
 * Виписка за період: сальдо по кожному рахунку, загальне сальдо і рядки.
 * `opening` — сума проводок до початку періоду по кожному рахунку,
 * `entries` — проводки періоду (будь-якого порядку; сортуємо тут).
 */
export function buildMutualStatement(params: {
  accounts: SettlementAccount[];
  opening: Partial<Record<SettlementAccount, number>>;
  entries: LedgerEntry[];
  showInternal?: boolean;
}): MutualStatement {
  const { accounts, entries, showInternal = false } = params;

  // Внутрішній залік: у межах однієї проводки (txn_id) кілька ніг цього ж
  // контрагента на різних рахунках, що в сумі дають нуль.
  const byTxn = new Map<string, LedgerEntry[]>();
  for (const e of entries) {
    const legs = byTxn.get(e.txn_id);
    if (legs) legs.push(e); else byTxn.set(e.txn_id, [e]);
  }
  const internalTxn = new Set<string>();
  for (const [txn, legs] of byTxn) {
    const accs = new Set(legs.map(l => l.account_type));
    if (accs.size > 1 && Math.abs(legs.reduce((s, l) => s + Number(l.amount), 0)) < EPS) internalTxn.add(txn);
  }
  // Помилкова проводка і її сторно в межах періоду: для контрагента цих рухів
  // не було (напр. дзеркала тригера, сторновані міграцією 121) — пару ховаємо.
  const byId = new Map(entries.map(x => [x.id, x]));
  const reversedPair = new Set<string>();
  for (const r of entries) {
    const orig = r.reversal_of ? byId.get(r.reversal_of) : undefined;
    if (orig && orig.account_type === r.account_type && Math.abs(Number(orig.amount) + Number(r.amount)) < EPS) {
      reversedPair.add(orig.id).add(r.id);
    }
  }
  const hidden = (x: LedgerEntry) => internalTxn.has(x.txn_id) || reversedPair.has(x.id);

  const summaries: AccountSummary[] = accounts.map(account => {
    const own = entries.filter(e => e.account_type === account);
    const opening = round2(Number(params.opening[account] ?? 0));
    const debit   = round2(own.reduce((s, e) => s + (e.amount > 0 ? Number(e.amount) : 0), 0));
    const credit  = round2(own.reduce((s, e) => s + (e.amount < 0 ? -Number(e.amount) : 0), 0));
    return { account, opening, debit, credit, closing: round2(opening + debit - credit) };
  });

  const rows: StatementRow[] = entries
    .filter(e => showInternal || !hidden(e))
    .map(e => ({ ...e, amount: Number(e.amount), label: operationLabel(e.account_type, e.doc_type, Number(e.amount)) }))
    .sort((a, b) =>
      a.business_date.localeCompare(b.business_date)
      || String(a.created_at).localeCompare(String(b.created_at))
      || a.id.localeCompare(b.id));

  const hiddenInternal = showInternal ? 0 : entries.filter(hidden).length;
  const opening = round2(summaries.reduce((s, a) => s + a.opening, 0));
  const closing = round2(summaries.reduce((s, a) => s + a.closing, 0));
  return { accounts: summaries, opening, closing, rows, hiddenInternal };
}

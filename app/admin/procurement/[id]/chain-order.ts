/**
 * Порядок подій у «Ланцюжку документів» закупівлі (чиста логіка — під тест).
 *
 * Ланцюжок має читатись як логіка продажу: замовлення покупця → замовлення
 * постачальнику (його коригування, приходи з партіями, оплати й витрати) →
 * продаж. До 04.11.2026 усе сортувалось лише за doc_date, а РН-чернетка має
 * doc_date без часу (00:00) і випереджала прихід того ж дня — продаж опинявся
 * ПЕРЕД приходом і всередині закупівлі.
 */

export type PoPayment    = { id: string; txn_id: string; amount: number; business_date: string; description: string | null; account_type: string; doc_type: string };
export type PoAdjustment = { id: string; doc_number: string; doc_type: string; doc_date: string; status: string; notes: string | null };
export type PoReceipt    = { id: string; doc_number: string; doc_type: string; doc_date: string; status: string; total_cost: number | null; notes: string | null };
export type SaleDoc      = { id: string; doc_number: string; doc_type: string; doc_date: string; status?: string; total_amount: number | null; total_cost: number | null; order_id: string | null };

export type PoEvent =
  | { kind: 'adjustment'; day: string; data: PoAdjustment }
  | { kind: 'receipt';    day: string; data: PoReceipt }
  | { kind: 'payment';    day: string; data: PoPayment }
  | { kind: 'expense';    day: string; data: PoPayment };

export const MONEY_ACCOUNTS   = ['bank', 'cash', 'acquiring'];
export const EXPENSE_ACCOUNTS = ['logistics', 'loading', 'customs', 'opex'];

/** День без часу: doc_date буває і '2026-10-23', і '2026-10-23 07:41:22+00'. */
export const dayOf = (s: string) => String(s).slice(0, 10);

// У межах одного дня: спершу коригування (міняють, що очікуємо), потім прихід
// (товар на складі), далі гроші — оплата і витрати. Сам продаж до подій
// закупівлі не належить: він іде окремим кроком ПІСЛЯ закупівлі.
const RANK: Record<PoEvent['kind'], number> = { adjustment: 0, receipt: 1, payment: 2, expense: 3 };

export function orderPoEvents(input: {
  payments: PoPayment[];
  adjustments?: PoAdjustment[];
  children: PoReceipt[];
}): PoEvent[] {
  const events: PoEvent[] = [
    ...(input.adjustments ?? []).map(a => ({ kind: 'adjustment' as const, day: dayOf(a.doc_date), data: a })),
    ...input.children.map(c => ({ kind: 'receipt' as const, day: dayOf(c.doc_date), data: c })),
    ...input.payments
      .filter(p => MONEY_ACCOUNTS.includes(p.account_type))
      .map(p => ({ kind: 'payment' as const, day: dayOf(p.business_date), data: p })),
    ...input.payments
      .filter(p => EXPENSE_ACCOUNTS.includes(p.account_type) && p.amount > 0)
      .map(p => ({ kind: 'expense' as const, day: dayOf(p.business_date), data: p })),
  ];
  return events.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : RANK[a.kind] - RANK[b.kind]));
}

/** Продажі — хронологічно; скасовані (сторно) в кінці, щоб не губити живі. */
export function orderSales(docs: SaleDoc[]): SaleDoc[] {
  return docs
    .filter(d => d.doc_type === 'sale')
    .sort((a, b) => {
      const ca = a.status === 'cancelled' ? 1 : 0, cb = b.status === 'cancelled' ? 1 : 0;
      if (ca !== cb) return ca - cb;
      return dayOf(a.doc_date) < dayOf(b.doc_date) ? -1 : dayOf(a.doc_date) > dayOf(b.doc_date) ? 1 : a.doc_number.localeCompare(b.doc_number);
    });
}

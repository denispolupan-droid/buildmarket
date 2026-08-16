/**
 * lib/accounting/procurement-payments.ts
 *
 * Зв'язок «оплата ↔ документ закупівлі» в грошовому леджері.
 *
 * Коли з'явились платіжні ваучери (b6a3e42), `money_entries.doc_id` почав
 * вказувати на ваучер, а не на ЗП/ПН — зв'язок із закупівлею лишився тільки в
 * `meta.po_id`. Читачі тоді не оновили, і вони шукали по `doc_id = id
 * закупівлі`, тобто не знаходили нічого:
 *
 *   • сума оплат = 0 → статус завжди «Частково», навіть коли оплачено повністю;
 *   • історія оплат у картці ЗП/ПН порожня;
 *   • «скасувати оплату» не знаходило проводку, яку треба сторнувати.
 *
 * Тому шукаємо по обох зв'язках одразу: `doc_id` (сторно й оплати, зроблені до
 * ваучерів) і `meta.po_id` (усе, що йде через ваучер).
 */

/** Фільтр PostgREST `.or(...)`: проводки, що належать документу закупівлі. */
export function procurementPaymentOr(docId: string): string {
  return `doc_id.eq.${docId},meta->>po_id.eq.${docId}`;
}

type LedgerRow = {
  amount:       number | string;
  doc_type:     string | null;
  account_type: string;
};

/**
 * Чиста сума оплат по документу: оплати мінус сторновані.
 *
 * Беремо бік постачальника: оплата дає +amount на `supplier`, сторно — −amount,
 * тож проста сума вже дає нетто. Рядки cash/bank того ж txn ігноруємо, інакше
 * все схлопнеться в нуль (подвійний запис).
 */
export function netPaidToSupplier(entries: LedgerRow[]): number {
  return entries
    .filter(e =>
      e.account_type === 'supplier' &&
      (e.doc_type === 'supplier_payment' || e.doc_type === 'supplier_payment_reversal'))
    .reduce((sum, e) => sum + Number(e.amount), 0);
}

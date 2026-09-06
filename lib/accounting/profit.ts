/**
 * Єдине визначення прибутку для всіх екранів (рішення власника 06.09.2026:
 * «прибуток скрізь однаковий»). Джерело — лише леджер money_entries за business_date.
 *
 *   Виручка               revenue (кредитовий рахунок → знак інвертуємо)
 *   − Собівартість (FIFO)  cogs        (landed cost уже капіталізований у партії → тут)
 *   − Витрати угод         marketplace_fee · доставка/комісії НП (logistics: delivery_cost,
 *                          np_fee, np_deduction) · acquiring_fee
 *   = ВАЛОВИЙ прибуток
 *   − Операційні витрати   logistics/loading/customs/packaging/rent/salary/marketing/opex
 *                          з doc_type 'expense' (ручні, Mono, NovaPay) та РКО з каси
 *   − Податки              taxes
 *   = ЧИСТИЙ прибуток
 *
 * Не в прибутку: correction (закриття боргів поза виписками — показуємо довідково),
 * owner (вилучення власника — рух грошей, не витрата), rounding, variance.
 * Чисті правила — lib/accounting/profit-rules (під тести); тут — читання з БД.
 */
import { createServiceClient } from '../supabase';
import { fetchAllRows } from '../db-paginate';
import { PL_ACCOUNTS, summarizePL, type PLSummary } from './profit-rules';

export { classifyPLEntry, plContribution, summarizePL, OPEX_ACCOUNTS, PL_ACCOUNTS } from './profit-rules';
export type { PLBucket, PLSummary } from './profit-rules';

/** P&L за період [from, to] включно (YYYY-MM-DD) з леджера. */
export async function computePL(from: string, to?: string, db = createServiceClient()): Promise<PLSummary> {
  const rows = await fetchAllRows<{ account_type: string; doc_type: string | null; amount: number }>((f, t) => {
    let q = db.from('money_entries').select('account_type, doc_type, amount').in('account_type', PL_ACCOUNTS).gte('business_date', from);
    if (to) q = q.lte('business_date', to);
    return q.range(f, t);
  });
  return summarizePL(rows);
}

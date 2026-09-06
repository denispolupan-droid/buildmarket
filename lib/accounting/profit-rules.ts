/**
 * Чисті правила P&L (без залежностей — під тести). Визначення — див. lib/accounting/profit.ts.
 */
import type { AccountType } from './money';

export type PLBucket = 'revenue' | 'cogs' | 'deal' | 'opex' | 'taxes' | 'correction' | 'other';

const DEAL_LOGISTICS_DOCS = new Set(['delivery_cost', 'np_fee', 'np_deduction', 'rz_delivery_fee']);
export const OPEX_ACCOUNTS: AccountType[] = ['logistics', 'loading', 'customs', 'packaging', 'rent', 'salary', 'marketing', 'opex'];
/** Рахунки, які взагалі беруть участь у P&L (для вибірок). */
export const PL_ACCOUNTS: AccountType[] = ['revenue', 'cogs', 'marketplace_fee', 'acquiring_fee', 'taxes', 'correction', ...OPEX_ACCOUNTS];

/** Класифікація проводки для P&L. Чиста — під тести. */
export function classifyPLEntry(accountType: string, docType: string | null | undefined): PLBucket {
  if (accountType === 'revenue') return 'revenue';
  if (accountType === 'cogs') return 'cogs';
  if (accountType === 'marketplace_fee' || accountType === 'acquiring_fee') return 'deal';
  if (accountType === 'logistics' && DEAL_LOGISTICS_DOCS.has(docType ?? '')) return 'deal';
  if ((OPEX_ACCOUNTS as string[]).includes(accountType)) return 'opex';
  if (accountType === 'taxes') return 'taxes';
  if (accountType === 'correction') return docType === 'cash_out' ? 'opex' : 'correction';
  return 'other';
}

/** Внесок проводки у прибуток зі знаком (+ збільшує прибуток). */
export function plContribution(accountType: string, docType: string | null | undefined, amount: number): { bucket: PLBucket; delta: number } {
  const bucket = classifyPLEntry(accountType, docType);
  const amt = Number(amount);
  if (bucket === 'revenue') return { bucket, delta: -amt };           // кредит → +виручка
  if (bucket === 'correction' || bucket === 'other') return { bucket, delta: 0 };
  if (bucket === 'opex' && accountType === 'correction') return { bucket, delta: -Math.abs(amt) };   // РКО з каси
  return { bucket, delta: -amt };                                    // дебет витрати → −прибуток
}

export type PLSummary = {
  revenue: number;
  cogs: number;
  deal: { marketplaceFee: number; npDelivery: number; acquiringFee: number; total: number };
  grossProfit: number;
  opex: { byAccount: Record<string, number>; total: number };
  taxes: number;
  netProfit: number;
  corrections: number;   // довідково, не в прибутку
};

const r2 = (n: number) => Math.round(n * 100) / 100;




/** Підсумок P&L для набору проводок (Огляд тримає їх у пам'яті для графіків). */
export function summarizePL(rows: { account_type: string; doc_type: string | null; amount: number }[]): PLSummary {
  const s: PLSummary = {
    revenue: 0, cogs: 0,
    deal: { marketplaceFee: 0, npDelivery: 0, acquiringFee: 0, total: 0 },
    grossProfit: 0, opex: { byAccount: {}, total: 0 }, taxes: 0, netProfit: 0, corrections: 0,
  };
  for (const r of rows) {
    const amt = Number(r.amount);
    const b = classifyPLEntry(r.account_type, r.doc_type);
    if (b === 'revenue') s.revenue -= amt;
    else if (b === 'cogs') s.cogs += amt;
    else if (b === 'deal') {
      if (r.account_type === 'marketplace_fee') s.deal.marketplaceFee += amt;
      else if (r.account_type === 'acquiring_fee') s.deal.acquiringFee += amt;
      else s.deal.npDelivery += amt;
    } else if (b === 'opex') {
      const key = r.account_type === 'correction' ? 'other' : r.account_type;
      const v = r.account_type === 'correction' ? Math.abs(amt) : amt;
      s.opex.byAccount[key] = (s.opex.byAccount[key] ?? 0) + v;
    } else if (b === 'taxes') s.taxes += amt;
    else if (b === 'correction') s.corrections += amt;
  }
  s.deal.total = s.deal.marketplaceFee + s.deal.npDelivery + s.deal.acquiringFee;
  s.opex.total = Object.values(s.opex.byAccount).reduce((a, b) => a + b, 0);
  s.grossProfit = s.revenue - s.cogs - s.deal.total;
  s.netProfit = s.grossProfit - s.opex.total - s.taxes;
  for (const k of ['revenue', 'cogs', 'grossProfit', 'taxes', 'netProfit', 'corrections'] as const) s[k] = r2(s[k]);
  s.deal = { marketplaceFee: r2(s.deal.marketplaceFee), npDelivery: r2(s.deal.npDelivery), acquiringFee: r2(s.deal.acquiringFee), total: r2(s.deal.total) };
  s.opex.total = r2(s.opex.total);
  for (const k of Object.keys(s.opex.byAccount)) s.opex.byAccount[k] = r2(s.opex.byAccount[k]);
  return s;
}

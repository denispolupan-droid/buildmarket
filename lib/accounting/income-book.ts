/**
 * Книга обліку доходів ФОП — чиста агрегація рядків fop_income_book (міграція 142).
 * Без залежностей — під тести. Визначення доходу — у коментарі міграції.
 */

export type IncomeRow = { day: string; method: string; source: string; amount: number | string; txns: number | string };

export const INCOME_METHODS = ['cash', 'bank', 'acquiring', 'novapay'] as const;
export type IncomeMethod = typeof INCOME_METHODS[number];

export const METHOD_LABEL: Record<IncomeMethod, string> = {
  cash: 'Готівка', bank: 'Безготівка', acquiring: 'Еквайринг', novapay: 'НоваПей',
};

export const SOURCE_LABEL: Record<string, string> = {
  customer: 'Покупці напряму', cod: 'Наложка (НП)', marketplace: 'Виплати маркетплейсів', partner: 'Аванси дропшиперів',
};

export type IncomeDay = { day: string; byMethod: Record<IncomeMethod, number>; total: number; txns: number };
export type IncomeMonth = { month: string; total: number; days: IncomeDay[] };
export type IncomeBook = {
  total: number;
  txns: number;
  byMethod: Record<IncomeMethod, number>;
  bySource: Record<string, number>;
  months: IncomeMonth[];
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const zero = (): Record<IncomeMethod, number> => ({ cash: 0, bank: 0, acquiring: 0, novapay: 0 });

export function buildIncomeBook(rows: IncomeRow[]): IncomeBook {
  const days = new Map<string, IncomeDay>();
  const byMethod = zero();
  const bySource: Record<string, number> = {};
  let txns = 0;

  for (const r of rows) {
    const amt = Number(r.amount) || 0;
    const n = Number(r.txns) || 0;
    const m = (INCOME_METHODS as readonly string[]).includes(r.method) ? (r.method as IncomeMethod) : null;
    if (!m) continue;
    const d = days.get(r.day) ?? { day: r.day, byMethod: zero(), total: 0, txns: 0 };
    d.byMethod[m] += amt;
    d.total += amt;
    d.txns += n;
    days.set(r.day, d);
    byMethod[m] += amt;
    bySource[r.source] = (bySource[r.source] ?? 0) + amt;
    txns += n;
  }

  const months = new Map<string, IncomeMonth>();
  for (const d of [...days.values()].sort((a, b) => a.day.localeCompare(b.day))) {
    for (const k of INCOME_METHODS) d.byMethod[k] = r2(d.byMethod[k]);
    d.total = r2(d.total);
    const key = d.day.slice(0, 7);
    const mo = months.get(key) ?? { month: key, total: 0, days: [] };
    mo.days.push(d);
    mo.total = r2(mo.total + d.total);
    months.set(key, mo);
  }

  for (const k of INCOME_METHODS) byMethod[k] = r2(byMethod[k]);
  for (const k of Object.keys(bySource)) bySource[k] = r2(bySource[k]);
  const total = r2(INCOME_METHODS.reduce((s, k) => s + byMethod[k], 0));
  return { total, txns, byMethod, bySource, months: [...months.values()] };
}

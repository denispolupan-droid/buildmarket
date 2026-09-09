/**
 * Правила автопроводки списань NovaPay — чиста частина, без БД і мережі
 * (тому в окремому файлі: тести імпортують його без env Supabase).
 *
 * Рішення власника 09.09.2026: поповнення гарантійних балансів Rozetka і Prom
 * ідуть із рахунку NovaPay регулярно, а категоризувати їх руками на екрані
 * «НоваПей» щоразу — зайва праця. Контрагент і призначення в цих платежах
 * стабільні (7 із 7 за серпень–вересень), тож правило вгадує їх без людини.
 *
 * Правило спрацьовує лише на повний збіг контрагента І призначення: сам лише
 * контрагент — не доказ (від «Термінал Розетка» теоретично може прийти й інший
 * рахунок). Усе, що не впізнано, лишається unmatched — людина категоризує як
 * і раніше.
 */

export type NovapayOutgoing = {
  id: string;
  amount: number | string;
  direction: string | null;
  counterparty: string | null;
  purpose: string | null;
};

export type NovapayAutoRule = {
  category: 'topup:rozetka' | 'topup:prom';
  marketplace: 'rozetka' | 'prom';
  label: string;
};

const norm = (s: string | null | undefined) =>
  (s ?? '').toLowerCase().replace(/[«»"'’]/g, '').replace(/\s+/g, ' ').trim();

/**
 * Приклади живих рядків (novapay_txns, 08–09.2026):
 *   «ТОВ Термінал Розетка» / «Гарантійний платіж без ПДВ згідно рахунку ТР-000984232»
 *   «ТОВ Термінал Розетка» / «Рахунок на оплату ТР-000931138 (Гарантійний платіж) від 17 серпня 2026 р.»
 *   «Товариство з обмеженою відповідальністю "УАПРОМ"» / «Рахунок № UA-12585634-1 від 26 серпня 2026 р.»
 */
export function classifyNovapayOutgoing(row: NovapayOutgoing): NovapayAutoRule | null {
  if (row.direction !== 'out') return null;
  if (!(Number(row.amount) > 0)) return null;
  const cp = norm(row.counterparty);
  const purpose = norm(row.purpose);

  if (cp.includes('термінал розетка') && purpose.includes('гарантійний платіж')) {
    return { category: 'topup:rozetka', marketplace: 'rozetka', label: 'Гарантійний платіж Rozetka (Термінал Розетка)' };
  }
  if (cp.includes('уапром') && /рахунок\s*№?\s*ua-/.test(purpose)) {
    return { category: 'topup:prom', marketplace: 'prom', label: 'Поповнення балансу Prom (УАПРОМ, рахунок UA-…)' };
  }
  return null;
}

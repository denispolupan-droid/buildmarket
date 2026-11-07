/**
 * Міст «замовлення періоду → облік» для виручки й валового прибутку — чиста
 * частина (без БД, під тести). Завантаження — lib/accounting/profit-bridge.ts.
 *
 * Навіщо. «Огляд» рахує по замовленнях, СТВОРЕНИХ за період (вручені — факт,
 * решта — прогноз), «Аналітика» показує ФАКТ обліку за датою проводки. Це різні
 * цифри, і до 07.11.2026 різниця не розкладалась ніде — власник бачив дві
 * «правильні» цифри, які не сходяться. Тут вона розкладається по рядках так, що
 * сума рядків дорівнює факту ПО ПОБУДОВІ (рядок «нерозкладено» завжди 0 —
 * інакше це баг, і тест це ловить).
 *
 * Проводки: виручка, COGS, витрати угоди (profit-rules). Винагорода RozetkaPay
 * у леджері лежить без замовлення — її замінює розбивка order_deal_costs (та
 * сама дата проводки), а нерознесена решта лишається «без замовлення».
 */
import { classifyPLEntry } from './profit-rules';

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Внесок у виручку і валовий (зі знаком «+ збільшує»). */
export function entryEffect(accountType: string, docType: string | null, amount: number): { rev: number; profit: number } | null {
  const b = classifyPLEntry(accountType, docType);
  const a = Number(amount);
  if (b === 'revenue') return { rev: -a, profit: -a };
  if (b === 'cogs' || b === 'deal') return { rev: 0, profit: -a };
  return null;   // opex, податки, коригування — у валовий не входять
}

export type BridgeEntry = { orderId: string | null; inPeriod: boolean; rev: number; profit: number };
export type BridgeCohortOrder = { id: string; status: string; total: number; hasFact: boolean; estGross: number };
/** Замовлення поза когортою, по яких у періоді є проводки. */
export type BridgeOtherOrder = { id: string; group: 'earlier' | 'cancelled' | 'other' };

export type BridgeLine = { key: string; label: string; amount: number; hint?: string };
export type ProfitBridge = {
  revenue: { start: number; lines: BridgeLine[]; fact: number; unexplained: number };
  profit:  { start: number; lines: BridgeLine[]; fact: number; unexplained: number };
};

export function buildProfitBridge(params: {
  cohort: BridgeCohortOrder[];
  /** проводки періоду (усі замовлення і без замовлення) + проводки когорти з фактом поза періодом */
  entries: BridgeEntry[];
  others: BridgeOtherOrder[];
}): ProfitBridge {
  const { cohort, entries, others } = params;
  const factIds   = new Set(cohort.filter(o => o.hasFact).map(o => o.id));
  const cohortIds = new Set(cohort.map(o => o.id));
  const groupOf   = new Map(others.map(o => [o.id, o.group]));

  const sum = (xs: BridgeEntry[], k: 'rev' | 'profit') => r2(xs.reduce((s, e) => s + e[k], 0));
  const inP  = entries.filter(e => e.inPeriod);
  const ofFact = (e: BridgeEntry) => !!e.orderId && factIds.has(e.orderId);
  const notFactInPeriod = inP.filter(e => !ofFact(e));
  const bucket = (e: BridgeEntry): 'cohort-open' | 'earlier' | 'cancelled' | 'other' | 'none' => {
    if (!e.orderId) return 'none';
    if (cohortIds.has(e.orderId)) return 'cohort-open';
    return groupOf.get(e.orderId) ?? 'other';
  };
  const by = (k: ReturnType<typeof bucket>, f: 'rev' | 'profit') => sum(notFactInPeriod.filter(e => bucket(e) === k), f);

  // ── Виручка ──────────────────────────────────────────────────────────────
  const factCohort = cohort.filter(o => o.hasFact);
  const revStart = r2(cohort.reduce((s, o) => s + o.total, 0));
  const revOpen  = r2(cohort.filter(o => !o.hasFact).reduce((s, o) => s + o.total, 0));
  const revFactAll = sum(entries.filter(ofFact), 'rev');
  const revFactOut = sum(entries.filter(e => ofFact(e) && !e.inPeriod), 'rev');
  const revDiff = r2(factCohort.reduce((s, o) => s + o.total, 0) - revFactAll);
  const revFact = sum(inP, 'rev');
  const revLines: BridgeLine[] = [
    { key: 'open', label: 'ще не вручені (в роботі, в дорозі)', amount: -revOpen, hint: 'Виручка проводиться в день вручення.' },
    { key: 'diff', label: 'вручені: сума замовлення ≠ проведена виручка', amount: -revDiff, hint: 'Часткові повернення, дроп за ціною партнера, безкоштовна досилка, недовкладення.' },
    { key: 'out', label: 'вручені, але проведені поза періодом', amount: -revFactOut },
    { key: 'earlier', label: 'вручені в періоді, створені раніше', amount: by('earlier', 'rev') },
    { key: 'cancelled', label: 'скасовані (сторно продажу)', amount: by('cancelled', 'rev') },
    { key: 'other', label: 'інші замовлення', amount: r2(by('cohort-open', 'rev') + by('other', 'rev') + by('none', 'rev')) },
  ];
  const revExplained = r2(revStart + revLines.reduce((s, l) => s + l.amount, 0));

  // ── Валовий прибуток ─────────────────────────────────────────────────────
  const profStart = r2(factCohort.reduce((s, o) => s + o.estGross, 0));
  const profFactAll = sum(entries.filter(ofFact), 'profit');
  const profFactOut = sum(entries.filter(e => ofFact(e) && !e.inPeriod), 'profit');
  const profFact = sum(inP, 'profit');
  const profLines: BridgeLine[] = [
    { key: 'est', label: 'оцінені складові вручених (комісія ще не проведена)', amount: r2(profFactAll - profStart) },
    { key: 'out', label: 'вручені, але проведені поза періодом', amount: -profFactOut },
    { key: 'earlier', label: 'вручені в періоді, створені раніше', amount: by('earlier', 'profit') },
    { key: 'open', label: 'вже проведені збори по замовленнях у дорозі', amount: by('cohort-open', 'profit'), hint: 'Збори площадки за видачу й винагорода RozetkaPay списуються до вручення.' },
    { key: 'cancelled', label: 'збори по скасованих замовленнях', amount: by('cancelled', 'profit'), hint: 'Видача, невитребувані посилки, комісії, які площадка не повернула.' },
    { key: 'other', label: 'інші замовлення', amount: by('other', 'profit') },
    { key: 'none', label: 'витрати без прив’язки до замовлення', amount: by('none', 'profit'), hint: 'Абонплата, Smart без замовлення, еквайринг і збори НП без замовлення.' },
  ];
  const profExplained = r2(profStart + profLines.reduce((s, l) => s + l.amount, 0));

  return {
    revenue: { start: revStart, lines: revLines.filter(l => Math.abs(l.amount) >= 0.5), fact: revFact, unexplained: r2(revFact - revExplained) },
    profit:  { start: profStart, lines: profLines.filter(l => Math.abs(l.amount) >= 0.5), fact: profFact, unexplained: r2(profFact - profExplained) },
  };
}

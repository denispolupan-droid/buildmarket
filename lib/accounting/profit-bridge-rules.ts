/**
 * Міст «замовлення періоду → облік» для виручки й валового прибутку — чиста
 * частина (без БД, під тести). Завантаження — lib/accounting/profit-bridge.ts.
 *
 * Навіщо. «Огляд» рахує по замовленнях, СТВОРЕНИХ за період (вручені — факт,
 * решта — прогноз), а факт обліку — за датою проводки. До 07.11.2026 різниця
 * не розкладалась ніде — власник бачив дві «правильні» цифри, які не
 * сходяться. Тут вона розкладається по рядках так, що сума рядків дорівнює
 * факту ПО ПОБУДОВІ (рядок «нерозкладено» завжди 0 — інакше це баг, тест ловить),
 * а кожен рядок має розшифровку: замовлення або види зборів із сумами.
 *
 * Проводки: виручка, COGS, витрати угоди (profit-rules). Винагорода RozetkaPay і
 * еквайринг у леджері лежать без замовлення — їх замінює розбивка order_deal_costs
 * (та сама дата проводки), нерознесена решта лишається «без замовлення».
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

/** Людська назва виду проводки — для розшифровки рядків «скасовані», «у дорозі», «без замовлення». */
export function entryCategory(accountType: string, docType: string | null, description: string | null, kind: string | null): string {
  const d = description ?? '';
  if (accountType === 'revenue') return 'продаж і його сторно';
  if (accountType === 'cogs') return 'собівартість і її сторно';
  if (kind === 'rz_subscription' || docType === 'subscription_fee') return 'Абонплата Rozetka';
  if (kind === 'rz_unitemized' || kind === 'rz_smart_unattributed') return 'Rozetka Smart без замовлення (з гарантійного платежу)';
  if (kind === 'rz_logistic_adj') return 'Коригування зборів Rozetka Доставки (повернули)';
  if (/організація видачі/i.test(d)) return 'Rozetka Доставка: організація видачі';
  if (/невитребуван/i.test(d)) return 'Rozetka Доставка: невитребувана посилка за наш рахунок';
  if (/Smart/i.test(d)) return 'Rozetka Smart: компенсація доставки';
  if (/Компенсація prom|незабір/i.test(d) || docType === 'marketplace_manual_credit') return 'Prom: компенсація / бонус за незабір';
  if (accountType === 'acquiring_fee') return 'Еквайринг Monobank';
  if (/RozetkaPay/i.test(d)) return 'Винагорода RozetkaPay';
  if (accountType === 'logistics' && docType === 'delivery_cost') return /Борг Нова Пошта|рахунк\S*-фактур/i.test(d) ? 'Нова Пошта: рахунки-фактури за договором (і їх сторно)' : 'Доставка НП за наш рахунок';
  if (accountType === 'logistics') return 'Збори НП (переказ наложки, утримання)';
  if (accountType === 'marketplace_fee') return 'Комісія площадки (не повернута)';
  return accountType;
}

/** synthetic — службовий рядок переносу розбивки (order_deal_costs), не проводка: у лічильник «N проводок» не йде */
export type BridgeEntry = { orderId: string | null; inPeriod: boolean; rev: number; profit: number; cat?: string; synthetic?: boolean };
export type BridgeCohortOrder = { id: string; status: string; total: number; hasFact: boolean; estGross: number };
/** Замовлення поза когортою, по яких у періоді є проводки. */
export type BridgeOtherOrder = { id: string; group: 'earlier' | 'cancelled' | 'other' };

export type BridgeDetail = { label: string; amount: number; sub?: string };
export type BridgeLine = { key: string; label: string; amount: number; hint?: string; details?: BridgeDetail[] };
export type ProfitBridge = {
  revenue: { start: number; lines: BridgeLine[]; fact: number; unexplained: number };
  profit:  { start: number; lines: BridgeLine[]; fact: number; unexplained: number };
};

const DETAIL_MAX = 25;
const STATUS_UA: Record<string, string> = {
  pending_payment: 'очікують оплати', confirmed: 'підтверджені', awaiting_stock: 'чекають товар', picking: 'збираються',
  shipped: 'у дорозі', returned: 'повернуті', delivered: 'вручені',
};

export function buildProfitBridge(params: {
  cohort: BridgeCohortOrder[];
  /** проводки періоду (усі замовлення і без замовлення) + проводки вручених когорти поза періодом */
  entries: BridgeEntry[];
  others: BridgeOtherOrder[];
  /** номери замовлень для розшифровки */
  orderNumbers?: Map<string, number>;
}): ProfitBridge {
  const { cohort, entries, others } = params;
  const num = (id: string) => { const n = params.orderNumbers?.get(id); return n ? `№${n}` : 'замовлення'; };
  const factIds   = new Set(cohort.filter(o => o.hasFact).map(o => o.id));
  const cohortIds = new Set(cohort.map(o => o.id));
  const groupOf   = new Map(others.map(o => [o.id, o.group]));

  const sum = (xs: BridgeEntry[], k: 'rev' | 'profit') => r2(xs.reduce((s, e) => s + e[k], 0));
  const inP  = entries.filter(e => e.inPeriod);
  const ofFact = (e: BridgeEntry) => !!e.orderId && factIds.has(e.orderId);
  const notFactInPeriod = inP.filter(e => !ofFact(e));
  type Bucket = 'cohort-open' | 'earlier' | 'cancelled' | 'other' | 'none';
  const bucket = (e: BridgeEntry): Bucket => {
    if (!e.orderId) return 'none';
    if (cohortIds.has(e.orderId)) return 'cohort-open';
    return groupOf.get(e.orderId) ?? 'other';
  };
  const inBucket = (k: Bucket) => notFactInPeriod.filter(e => bucket(e) === k);
  const by = (k: Bucket, f: 'rev' | 'profit') => sum(inBucket(k), f);

  // ── Розшифровки ──────────────────────────────────────────────────────────
  /** Сума по замовленнях (за модулем найбільші спершу), решта — одним рядком. */
  const perOrder = (xs: BridgeEntry[], f: 'rev' | 'profit', sign = 1): BridgeDetail[] => {
    const m = new Map<string, number>();
    for (const e of xs) if (e.orderId) m.set(e.orderId, r2((m.get(e.orderId) ?? 0) + e[f]));
    const rows = [...m.entries()].filter(([, v]) => Math.abs(v) >= 0.01).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
    const out = rows.slice(0, DETAIL_MAX).map(([id, v]) => ({ label: num(id), amount: r2(sign * v) }));
    if (rows.length > DETAIL_MAX) {
      const rest = rows.slice(DETAIL_MAX);
      out.push({ label: `ще ${rest.length} замовл.`, amount: r2(sign * rest.reduce((s, [, v]) => s + v, 0)) });
    }
    return out;
  };
  /** Сума за видами проводок; у підрядку — номери замовлень або кількість списань. */
  const perCategory = (xs: BridgeEntry[], f: 'rev' | 'profit'): BridgeDetail[] => {
    const m = new Map<string, { amount: number; orders: Map<string, number>; n: number; split: boolean }>();
    for (const e of xs) {
      const k = e.cat ?? 'інше';
      const a = m.get(k) ?? { amount: 0, orders: new Map<string, number>(), n: 0, split: false };
      a.amount = r2(a.amount + e[f]);
      if (e.synthetic) a.split = true; else a.n++;
      if (e.orderId) a.orders.set(e.orderId, r2((a.orders.get(e.orderId) ?? 0) + e[f]));
      m.set(k, a);
    }
    return [...m.entries()].filter(([, a]) => Math.abs(a.amount) >= 0.01).sort((x, y) => Math.abs(y[1].amount) - Math.abs(x[1].amount))
      .map(([k, a]) => {
        // Лише замовлення з ненульовим підсумком у цій категорії (комісія + її повернення = 0 — не показуємо)
        const nums = [...a.orders.entries()].filter(([, v]) => Math.abs(v) >= 0.01).map(([id]) => num(id));
        return {
          label: k, amount: a.amount,
          sub: nums.length ? `${nums.length} замовл.: ${nums.slice(0, 30).join(', ')}${nums.length > 30 ? ` і ще ${nums.length - 30}` : ''}`
            : a.split ? 'решта після рознесення по замовленнях: платежі, яким не знайшлось замовлення (у т.ч. поповнення балансу партнерів)'
            : `${a.n} ${a.n === 1 ? 'проводка' : a.n < 5 ? 'проводки' : 'проводок'} без замовлення`,
        };
      });
  };

  // ── Виручка ──────────────────────────────────────────────────────────────
  const factCohort = cohort.filter(o => o.hasFact);
  const openCohort = cohort.filter(o => !o.hasFact);
  const revStart = r2(cohort.reduce((s, o) => s + o.total, 0));
  const revOpen  = r2(openCohort.reduce((s, o) => s + o.total, 0));
  const revFactOf = new Map<string, number>();
  for (const e of entries) if (ofFact(e)) revFactOf.set(e.orderId!, r2((revFactOf.get(e.orderId!) ?? 0) + e.rev));
  const revFactAll = r2([...revFactOf.values()].reduce((s, v) => s + v, 0));
  const revFactOut = sum(entries.filter(e => ofFact(e) && !e.inPeriod), 'rev');
  const revDiff = r2(factCohort.reduce((s, o) => s + o.total, 0) - revFactAll);
  const revFact = sum(inP, 'rev');

  const openByStatus = new Map<string, { n: number; total: number }>();
  for (const o of openCohort) {
    const a = openByStatus.get(o.status) ?? { n: 0, total: 0 };
    a.n++; a.total = r2(a.total + o.total); openByStatus.set(o.status, a);
  }
  const diffDetails: BridgeDetail[] = factCohort
    .map(o => ({ o, posted: revFactOf.get(o.id) ?? 0 }))
    .filter(x => Math.abs(x.o.total - x.posted) >= 0.01)
    .sort((a, b) => Math.abs(b.o.total - b.posted) - Math.abs(a.o.total - a.posted))
    .map(x => ({ label: num(x.o.id), amount: r2(x.posted - x.o.total), sub: `сума замовлення ${x.o.total} → проведено ${x.posted}` }));

  const revLines: BridgeLine[] = [
    { key: 'open', label: 'ще не вручені (в роботі, в дорозі)', amount: -revOpen, hint: 'Виручка проводиться в день вручення — до того її в обліку немає.',
      details: [...openByStatus.entries()].map(([st, a]) => ({ label: STATUS_UA[st] ?? st, amount: -a.total, sub: `${a.n} замовл.` })) },
    { key: 'diff', label: 'вручені: сума замовлення ≠ проведена виручка', amount: -revDiff,
      hint: 'У замовленні — початкова сума, в обліку — фактичний продаж: частковий повернення, дроп за ціною партнера, безкоштовна досилка, недовкладений товар.',
      details: diffDetails },
    { key: 'out', label: 'вручені, але проведені поза періодом', amount: -revFactOut, hint: 'Створені в періоді, вручені вже після нього.',
      details: perOrder(entries.filter(e => ofFact(e) && !e.inPeriod), 'rev', -1) },
    { key: 'earlier', label: 'вручені в періоді, створені раніше', amount: by('earlier', 'rev'), details: perOrder(inBucket('earlier'), 'rev') },
    { key: 'cancelled', label: 'скасовані (сторно продажу)', amount: by('cancelled', 'rev'), details: perOrder(inBucket('cancelled'), 'rev') },
    { key: 'other', label: 'інші замовлення', amount: r2(by('cohort-open', 'rev') + by('other', 'rev') + by('none', 'rev')),
      details: perOrder([...inBucket('cohort-open'), ...inBucket('other')], 'rev') },
  ];
  const revExplained = r2(revStart + revLines.reduce((s, l) => s + l.amount, 0));

  // ── Валовий прибуток ─────────────────────────────────────────────────────
  const profStart = r2(factCohort.reduce((s, o) => s + o.estGross, 0));
  const profFactOf = new Map<string, number>();
  for (const e of entries) if (ofFact(e)) profFactOf.set(e.orderId!, r2((profFactOf.get(e.orderId!) ?? 0) + e.profit));
  const profFactAll = r2([...profFactOf.values()].reduce((s, v) => s + v, 0));
  const profFactOut = sum(entries.filter(e => ofFact(e) && !e.inPeriod), 'profit');
  const profFact = sum(inP, 'profit');
  const estDetails: BridgeDetail[] = factCohort
    .map(o => ({ o, d: r2((profFactOf.get(o.id) ?? 0) - o.estGross) }))
    .filter(x => Math.abs(x.d) >= 0.01).sort((a, b) => Math.abs(b.d) - Math.abs(a.d)).slice(0, DETAIL_MAX)
    .map(x => ({ label: num(x.o.id), amount: x.d }));

  const profLines: BridgeLine[] = [
    { key: 'est', label: 'вручені: оцінені складові (комісія ще не проведена)', amount: r2(profFactAll - profStart),
      hint: 'Прибуток вручених рахується з факту, але якщо комісію площадки ще не провели — бере її оцінку за ставкою.', details: estDetails },
    { key: 'out', label: 'вручені, але проведені поза періодом', amount: -profFactOut, details: perOrder(entries.filter(e => ofFact(e) && !e.inPeriod), 'profit', -1) },
    { key: 'earlier', label: 'вручені в періоді, створені раніше', amount: by('earlier', 'profit'), details: perOrder(inBucket('earlier'), 'profit') },
    { key: 'open', label: 'вже списані збори по замовленнях у дорозі', amount: by('cohort-open', 'profit'),
      hint: 'Збір Rozetka за видачу й винагорода RozetkaPay списуються до вручення.', details: perCategory(inBucket('cohort-open'), 'profit') },
    { key: 'cancelled', label: 'збори по скасованих замовленнях', amount: by('cancelled', 'profit'),
      hint: 'Що площадки утримали по замовленнях, які покупець не забрав або скасував. Продаж і собівартість по них сторновані в нуль.',
      details: perCategory(inBucket('cancelled'), 'profit') },
    { key: 'other', label: 'інші замовлення', amount: by('other', 'profit'), details: perOrder(inBucket('other'), 'profit') },
    { key: 'none', label: 'витрати без прив’язки до замовлення', amount: by('none', 'profit'),
      hint: 'Списання, які за своєю природою не належать жодному замовленню, або платіж, якому не знайшлось замовлення.',
      details: perCategory(inBucket('none'), 'profit') },
  ];
  const profExplained = r2(profStart + profLines.reduce((s, l) => s + l.amount, 0));

  const keep = (l: BridgeLine) => Math.abs(l.amount) >= 0.5;
  return {
    revenue: { start: revStart, lines: revLines.filter(keep), fact: revFact, unexplained: r2(revFact - revExplained) },
    profit:  { start: profStart, lines: profLines.filter(keep), fact: profFact, unexplained: r2(profFact - profExplained) },
  };
}

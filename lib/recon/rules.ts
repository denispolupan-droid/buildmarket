/**
 * Тижнева звірка з маркетплейсами й грошовими рахунками — чиста частина (під тести):
 * пороги, класифікація знахідок, динаміка проти минулого запуску, текст для Telegram.
 * Збір даних — lib/recon/run.ts, виправлення — lib/recon/fixes.ts.
 *
 * Принцип той самий, що в дайджесті: цифри рахує код за правилами, що вже працюють
 * на екранах «Маркетплейси» і «Взаєморозрахунки»; агент нічого не проводить сам —
 * лише пропонує, а проводить людина кнопкою.
 */
import { escTg } from '../telegram';

export type ReconLevel = 'red' | 'yellow' | 'green' | 'info';

export type ReconFinding = {
  key: string;            // стабільний ключ для динаміки між запусками
  area: string;           // «Rozetka», «Банк Mono», «Виплати площадок» …
  level: ReconLevel;
  title: string;
  detail: string;
  items: string[];
  /** числове розходження (наш облік − їхнє/живе), для динаміки */
  delta?: number | null;
  /** Виправлення в один клік (етап 2): лише пропозиції — проводить людина кнопкою. */
  fixes?: ReconFix[];
};

/**
 * Пропозиція виправлення. id стабільний і самодостатній (з нього сервер заново
 * збирає пропозицію з БД і перевіряє, що вона ще актуальна), сума — лише для показу.
 */
export type ReconFix = { id: string; label: string; detail: string; amount: number | null };

// ── НоваПей: категорія за прецедентами ─────────────────────────────────────────

export type NpHistoryRow = { counterparty: string | null; direction: string; category: string | null };

const normCp = (s: string | null) => String(s ?? '').toLowerCase().replace(/["'«»]/g, '').replace(/\s+/g, ' ').trim();

/**
 * Нерозібраний рядок виписки → категорія, якою ВСІ попередні документи того самого
 * контрагента в тому самому напрямку вже проведені. Різні категорії в минулому —
 * пропозиції немає (вирішує людина на екрані «НоваПей»).
 */
export function suggestNovapayCategory(row: { counterparty: string | null; direction: string }, history: NpHistoryRow[]): { category: string; count: number } | null {
  const cp = normCp(row.counterparty);
  if (!cp) return null;
  const same = history.filter(h => h.direction === row.direction && normCp(h.counterparty) === cp && h.category && h.category !== 'ignore');
  const cats = new Set(same.map(h => h.category!));
  if (cats.size !== 1) return null;
  return { category: [...cats][0], count: same.length };
}

const NP_CATEGORY_LABEL: Record<string, string> = {
  owner: 'вивід власника', 'transfer:bank': 'переказ на Mono', 'transfer:cash': 'переказ у касу',
  'topup:rozetka': 'поповнення Rozetka', 'topup:prom': 'поповнення Prom',
  'transfer-in:bank': 'переказ з Mono', 'transfer-in:cash': 'внесення готівки', 'transfer-in:owner': 'внесок власника',
  logistics: 'витрата: логістика', packaging: 'витрата: пакування', rent: 'витрата: оренда', salary: 'витрата: зарплата',
  marketing: 'витрата: маркетинг', opex: 'витрата: операційна', taxes: 'витрата: податки', loading: 'витрата: вантажні', customs: 'витрата: митниця',
};
export const npCategoryLabel = (c: string, supplierName?: string | null) =>
  c.startsWith('supplier:') ? `оплата постачальнику${supplierName ? ` ${supplierName}` : ''}` : NP_CATEGORY_LABEL[c] ?? c;

// ── Наложка: недоплата = позиція, якої не було в посилці ───────────────────────

export type SaleLine = { sku: string; name?: string | null; qty: number; price: number; cost_price: number | null; supplier_id: number | string | null; fulfillment_type: string | null };

/**
 * НоваПей виплатила менше за наложку — шукаємо позицію (або кілька штук однієї
 * позиції), ціна якої рівно дорівнює недоплаті. Лише один кандидат — інакше
 * пропозиції немає. Лише дропшип: товар зі свого складу при «не відправили»
 * лишився на складі, і це вже повернення залишку, а не дві проводки.
 */
export function findGapLine(gap: number, lines: SaleLine[]): { line: SaleLine; qty: number } | null {
  if (!(gap > MONEY_EPS)) return null;
  const hits: { line: SaleLine; qty: number }[] = [];
  for (const l of lines) {
    if (!(l.price > 0)) continue;
    const k = Math.round(gap / l.price);
    if (k >= 1 && k <= l.qty && Math.abs(k * l.price - gap) < 0.005) hits.push({ line: l, qty: k });
  }
  if (hits.length !== 1) return null;
  const h = hits[0];
  if (h.line.fulfillment_type !== 'dropship' || h.line.supplier_id == null || h.line.cost_price == null) return null;
  return h;
}

/** Скільки днів нормально чекати виплату по врученому замовленню. Довше — знахідка. */
export const PAYOUT_LAG_DAYS: Record<string, number> = {
  'np:cod': 3,        // НоваПей платить наложку день у день / наступного дня
  'mp:rozetka': 10,   // Rozetka Pay — наступного дня після оплати; накопичувальні виплати — до тижня
  'mp:prom': 14,      // Prom-оплата — лише після вручення, раз на кілька днів
  'mp:epicentr': 21,  // виплат ще не бачили — щедрий поріг
};
/** «Отримано наперед» (оплатили, а продажу немає) довше цього — підозра на невідображене повернення/скасування. */
export const PREPAID_STALE_DAYS = 30;
/** Розбіжність балансу менша за це — округлення, не знахідка. */
export const MONEY_EPS = 1;

const r2 = (v: number) => Math.round(v * 100) / 100;
export const fmtUah = (v: number) => `${v < 0 ? '−' : ''}${Math.abs(r2(v)).toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₴`;

export function daysBetween(fromYmd: string, now: Date): number {
  return Math.floor((now.getTime() - Date.parse(`${fromYmd}T12:00:00Z`)) / 86_400_000);
}

/**
 * Розходження залишку «наш облік ↔ живий/кабінетний» з урахуванням минулого запуску:
 * нове або зросле — червоне (щось сталося цього тижня), стабільне — жовте (відоме,
 * чекає розбору), нуль — зелене.
 */
export function balanceFinding(p: {
  key: string; area: string; ours: number; theirs: number; theirsLabel: string;
  previousDelta?: number | null; note?: string | null;
}): ReconFinding {
  const delta = r2(p.ours - p.theirs);
  const base = { key: p.key, area: p.area, delta, items: [] as string[] };
  const nums = `облік ${fmtUah(p.ours)}, ${p.theirsLabel} ${fmtUah(p.theirs)}`;
  if (Math.abs(delta) < MONEY_EPS) return { ...base, level: 'green', title: 'зійшлось', detail: nums };
  const prev = p.previousDelta;
  const changed = prev == null || Math.abs(delta - prev) >= MONEY_EPS;
  const trend = prev == null ? 'перший замір' : changed ? `минулого разу ${fmtUah(prev)}` : 'без змін з минулого тижня';
  return {
    ...base,
    level: changed ? 'red' : 'yellow',
    title: `розходиться на ${fmtUah(delta)}`,
    detail: `${nums}; ${trend}${p.note ? `. ${p.note}` : ''}`,
  };
}

export type OpenItemRow = { orderNumber: number | null; net: number; lastDate: string };

/**
 * Відкриті позиції по службовому контрагенту (як блок «Що не закрито» у
 * «Взаєморозрахунках»): net > 0 — вручено, а виплати немає; net < 0 — гроші
 * отримано наперед, продажу немає. Знахідка — лише те, що старше норми.
 */
export function payoutFinding(counterparty: string, label: string, items: OpenItemRow[], now: Date): ReconFinding {
  const lag = PAYOUT_LAG_DAYS[counterparty] ?? 14;
  const overdue = items.filter(i => i.net > MONEY_EPS && daysBetween(i.lastDate, now) > lag);
  const stalePrepaid = items.filter(i => i.net < -MONEY_EPS && daysBetween(i.lastDate, now) > PREPAID_STALE_DAYS);
  const overdueSum = r2(overdue.reduce((s, i) => s + i.net, 0));
  const prepaidSum = r2(stalePrepaid.reduce((s, i) => s + i.net, 0));
  const lines = [
    ...overdue.sort((a, b) => a.lastDate.localeCompare(b.lastDate)).slice(0, 8)
      .map(i => `№${i.orderNumber ?? '?'} — ${fmtUah(i.net)} до виплати, з ${i.lastDate} (${daysBetween(i.lastDate, now)} дн)`),
    ...stalePrepaid.sort((a, b) => a.lastDate.localeCompare(b.lastDate)).slice(0, 5)
      .map(i => `№${i.orderNumber ?? '?'} — ${fmtUah(-i.net)} отримано наперед, з ${i.lastDate} — продажу немає`),
  ];
  const level: ReconLevel = overdue.length >= 3 || overdueSum >= 1000 ? 'red' : overdue.length || stalePrepaid.length ? 'yellow' : 'green';
  return {
    key: `payout:${counterparty}`, area: label, level, delta: overdueSum,
    title: overdue.length || stalePrepaid.length
      ? `${overdue.length} без виплати понад ${lag} дн (${fmtUah(overdueSum)})${stalePrepaid.length ? `, ${stalePrepaid.length} «наперед» понад ${PREPAID_STALE_DAYS} дн (${fmtUah(-prepaidSum)})` : ''}`
      : `усе в межах норми (${lag} дн)`,
    detail: `відкритих позицій усього: ${items.length}`,
    items: lines,
  };
}

const ICON: Record<ReconLevel, string> = { red: '🔴', yellow: '🟡', green: '🟢', info: 'ℹ️' };
const ORDER: ReconLevel[] = ['red', 'yellow', 'info', 'green'];
const TG_LIMIT = 3900;

export function renderReconHtml(findings: ReconFinding[], meta: { periodLabel: string; adminUrl: string }): string {
  const sorted = [...findings].sort((a, b) => ORDER.indexOf(a.level) - ORDER.indexOf(b.level));
  const reds = findings.filter(f => f.level === 'red').length;
  const yellows = findings.filter(f => f.level === 'yellow').length;
  const lines = [
    `🧾 <b>Звірка з маркетплейсами й рахунками · ${escTg(meta.periodLabel)}</b>`,
    reds ? `Нових або зрослих розходжень: ${reds}${yellows ? `, відомих: ${yellows}` : ''}.` : yellows ? `Нового немає; відомих розходжень: ${yellows}.` : 'Усе зійшлось.',
    '',
  ];
  for (const f of sorted) {
    lines.push(`${ICON[f.level]} <b>${escTg(f.area)}</b>: ${escTg(f.title)}`);
    if (f.level !== 'green') {
      lines.push(`   ${escTg(f.detail)}`);
      for (const i of f.items.slice(0, 5)) lines.push(`   • ${escTg(i)}`);
      for (const x of (f.fixes ?? []).filter(x => x.id !== 'np-refresh').slice(0, 3)) lines.push(`   🛠 ${escTg(x.label)}`);
    }
  }
  const fixCount = findings.reduce((s, f) => s + (f.fixes ?? []).filter(x => x.id !== 'np-refresh').length, 0);
  if (fixCount) lines.push('', `🛠 Виправлень чекають підтвердження: ${fixCount} — <a href="${meta.adminUrl}/digest">Дайджест → Звірка</a>`);
  lines.push('', `<a href="${meta.adminUrl}/finance/marketplace-balance">Маркетплейси</a> · <a href="${meta.adminUrl}/finance/mutual">Взаєморозрахунки</a>`);
  let out = lines.join('\n');
  if (out.length > TG_LIMIT) out = out.slice(0, TG_LIMIT - 1) + '…';
  return out;
}

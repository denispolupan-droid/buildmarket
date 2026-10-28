/**
 * Тижнева звірка з маркетплейсами й грошовими рахунками — чиста частина (під тести):
 * пороги, класифікація знахідок, динаміка проти минулого запуску, текст для Telegram.
 * Збір даних — lib/recon/run.ts. У БД агент нічого не пише, крім журналу запусків.
 *
 * Принцип той самий, що в дайджесті: цифри рахує код за правилами, що вже працюють
 * на екранах «Маркетплейси» і «Взаєморозрахунки»; агент нічого не проводить сам.
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
};

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
    }
  }
  lines.push('', `<a href="${meta.adminUrl}/finance/marketplace-balance">Маркетплейси</a> · <a href="${meta.adminUrl}/finance/mutual">Взаєморозрахунки</a>`);
  let out = lines.join('\n');
  if (out.length > TG_LIMIT) out = out.slice(0, TG_LIMIT - 1) + '…';
  return out;
}

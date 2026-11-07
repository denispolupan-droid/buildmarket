/**
 * Період дашбордів фінансів («Огляд», «Аналітика») — чиста логіка, без БД.
 *
 * Усі межі — за КИЇВСЬКИМ календарем і в UTC-мить для фільтрів по timestamptz
 * (created_at). До 08.11.2026 межі будувались `new Date(y, m, 1)` у локальній
 * зоні сервера (Vercel — UTC): місяць починався о 02:00/03:00 за Києвом, і
 * замовлення, створене 01.11 о 01:30, в когорту листопада не потрапляло, хоча
 * леджер (business_date — київська дата) його вже бачив у листопаді.
 */
import { kyivDayBounds, kyivYmd } from '../../../lib/kyiv-date';

export type Preset = 'cur_month' | 'prev_month' | 'quarter' | 'ytd';
export const PRESETS: readonly Preset[] = ['cur_month', 'prev_month', 'quarter', 'ytd'] as const;

export const UA_MONTHS = ['Січ','Лют','Бер','Кві','Тра','Чер','Лип','Серп','Вер','Жов','Лис','Гру'];

const pad = (n: number) => String(n).padStart(2, '0');

/** YYYY-MM-DD → Date (UTC-опівніч цієї календарної дати) — лише для арифметики календаря. */
const ymdToUtc = (ymd: string) => { const [y, m, d] = ymd.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const utcToYmd = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

/** Календарна дата ± n днів (без зон і DST — чиста арифметика на UTC-датах). */
export function addDays(ymd: string, n: number): string {
  const d = ymdToUtc(ymd); d.setUTCDate(d.getUTCDate() + n); return utcToYmd(d);
}

/** Усі календарні дати від from до to включно (обидві YYYY-MM-DD). */
export function ymdRange(from: string, to: string, cap = 370): string[] {
  const out: string[] = [];
  for (let d = from; d <= to && out.length < cap; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Перше число місяця за Києвом: year, month0 (може виходити за 0..11 — нормалізується). */
export function monthStartYmd(year: number, month0: number): string {
  const d = new Date(Date.UTC(year, month0, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-01`;
}

/** Київська опівніч календарної дати як UTC-мить (для created_at). */
export const kyivStart = (ymd: string) => new Date(kyivDayBounds(ymd).start);

export type ResolvedPeriod = {
  now: Date;
  preset: Preset;
  /** Київський рік і місяць (0..11) «зараз» */
  kyivYear: number;
  kyivMonth0: number;
  /** Сьогодні за Києвом, YYYY-MM-DD */
  todayYmd: string;
  periodFrom: Date;          // включно
  periodTo: Date | null;     // ексклюзивно; null = відкритий період (до зараз)
  periodEnd: Date;           // periodTo ?? now
  prevFrom: Date;            // початок попереднього періоду тієї самої довжини (у днях)
  fromYmd: string;           // київські календарні межі періоду
  toYmdIncl: string;
  days: string[];            // календарні дні періоду (до сьогодні включно для відкритого)
  prevDays: string[];        // дні попереднього періоду тієї самої довжини
  periodLabel: string;
};

export function resolvePeriod(p?: string, now: Date = new Date()): ResolvedPeriod {
  const preset: Preset = PRESETS.includes(p as Preset) ? p as Preset : 'cur_month';
  const todayYmd = kyivYmd(now);
  const [kyivYear, kyivMonth1] = todayYmd.split('-').map(Number);
  const kyivMonth0 = kyivMonth1 - 1;

  let fromYmd: string, toYmd: string | null = null;   // toYmd — ексклюзивна межа (перше число наступного місяця)
  if (preset === 'prev_month') {
    fromYmd = monthStartYmd(kyivYear, kyivMonth0 - 1);
    toYmd   = monthStartYmd(kyivYear, kyivMonth0);
  } else if (preset === 'quarter') {
    fromYmd = monthStartYmd(kyivYear, Math.floor(kyivMonth0 / 3) * 3);
  } else if (preset === 'ytd') {
    fromYmd = monthStartYmd(kyivYear, 0);
  } else {
    fromYmd = monthStartYmd(kyivYear, kyivMonth0);
  }
  const periodFrom = kyivStart(fromYmd);
  const periodTo   = toYmd ? kyivStart(toYmd) : null;
  const periodEnd  = periodTo ?? now;
  const toYmdIncl  = toYmd ? addDays(toYmd, -1) : todayYmd;

  const days = ymdRange(fromYmd, toYmdIncl);
  // Попередній період — стільки ж календарних днів назад (порівняння «до попереднього»)
  const prevFromYmd = addDays(fromYmd, -days.length);
  const prevFrom = kyivStart(prevFromYmd);
  const prevDays = ymdRange(prevFromYmd, addDays(fromYmd, -1));

  const prevMonth0 = (kyivMonth0 + 11) % 12;
  const prevMonthYear = kyivMonth0 === 0 ? kyivYear - 1 : kyivYear;
  const periodLabel = preset === 'cur_month'  ? `${UA_MONTHS[kyivMonth0]} ${kyivYear}`
                    : preset === 'prev_month' ? `${UA_MONTHS[prevMonth0]} ${prevMonthYear}`
                    : preset === 'quarter'    ? `${Math.floor(kyivMonth0 / 3) + 1}-й квартал ${kyivYear}`
                    : `${kyivYear} рік`;

  return { now, preset, kyivYear, kyivMonth0, todayYmd, periodFrom, periodTo, periodEnd, prevFrom, fromYmd, toYmdIncl, days, prevDays, periodLabel };
}

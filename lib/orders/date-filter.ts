/**
 * Фільтр періоду в журналі замовлень.
 *
 * Два дефекти, через які «Доставлено · Сьогодні» показувало нуль (18.10.2026):
 *  1. Період завжди фільтрував за created_at — тобто «створені сьогодні», а не
 *     «доставлені сьогодні». Тепер у кожного статусу своя дата події:
 *     доставлені — delivered_at, скасовані — cancelled_at, відправлені —
 *     shipped_at, решта — created_at.
 *  2. Межі дня бралися в UTC («2026-10-17T00:00:00» без зони), а не за Києвом:
 *     замовлення з 00:00 до 03:00 за Києвом потрапляли в попередній день.
 */
import { kyivDayRange } from '../kyiv-date';

/** Яка дата відповідає вкладці статусу. */
export const STATUS_DATE_COLUMN: Record<string, string> = {
  delivered: 'delivered_at',
  cancelled: 'cancelled_at',
  shipped: 'shipped_at',
};

/** UTC-межі київського дня без мілісекунд (крапка ламала б розбір or() у PostgREST). */
function kyivDayStartUtc(ymd: string, plusDays = 0): string {
  const { start, end } = kyivDayRange(new Date(`${ymd}T12:00:00Z`), 0);
  return (plusDays ? end : start).toISOString().slice(0, 19) + 'Z';
}

export type DateBounds = { gte?: string; lt?: string };

/** Межі періоду [від початку dateFrom; до початку дня після dateTo) за Києвом. */
export function kyivBounds(dateFrom?: string, dateTo?: string): DateBounds {
  return {
    ...(dateFrom ? { gte: kyivDayStartUtc(dateFrom) } : {}),
    ...(dateTo ? { lt: kyivDayStartUtc(dateTo, 1) } : {}),
  };
}

function cond(col: string, b: DateBounds): string[] {
  const out: string[] = [];
  if (b.gte) out.push(`${col}.gte.${b.gte}`);
  if (b.lt) out.push(`${col}.lt.${b.lt}`);
  return out;
}

/**
 * Вираз для PostgREST .or(): рядок проходить, якщо дата ЙОГО статусу лежить у
 * періоді. Один вираз на всі статуси — тож лічильники вкладок, суми й список
 * рахуються однаково. null — періоду немає.
 */
/**
 * Вкладка «Всі»: період за датою створення — «що надійшло за цей час».
 * 19.10.2026: на «Всі» відправлені фільтрувались за shipped_at, і під «з 18.10»
 * потрапляли замовлення від 16.10, відправлені 19.10.
 */
export function createdOrFilter(b: DateBounds): string | null {
  if (!b.gte && !b.lt) return null;
  return `and(${cond('created_at', b).join(',')})`;
}

type DatedRow = { status?: string | null; created_at?: string | null; [k: string]: unknown };
const inRange = (v: unknown, b: DateBounds) =>
  typeof v === 'string' && (!b.gte || new Date(v) >= new Date(b.gte)) && (!b.lt || new Date(v) < new Date(b.lt));

/** Те саме правило, що statusDateOrFilter, — для рядків, уже вибраних із бази. */
export function matchesEventDate(row: DatedRow, b: DateBounds): boolean {
  if (!b.gte && !b.lt) return true;
  const col = STATUS_DATE_COLUMN[row.status ?? ''] ?? 'created_at';
  return inRange(row[col], b);
}
export function matchesCreatedDate(row: DatedRow, b: DateBounds): boolean {
  if (!b.gte && !b.lt) return true;
  return inRange(row.created_at, b);
}

export function statusDateOrFilter(b: DateBounds): string | null {
  if (!b.gte && !b.lt) return null;
  const special = Object.keys(STATUS_DATE_COLUMN);
  const parts = special.map(s => `and(status.eq.${s},${cond(STATUS_DATE_COLUMN[s], b).join(',')})`);
  parts.push(`and(status.not.in.(${special.join(',')}),${cond('created_at', b).join(',')})`);
  return parts.join(',');
}

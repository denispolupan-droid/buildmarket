/**
 * Єдині форматери для адмінки (аудит 31.10.2026, §1: 25 локальних копій fmt()
 * грошей і 12 — дат). Гроші: uk-UA, пробіл тисяч, кома. Дати — за Києвом.
 *
 * fmtMoney(1234.5) → "1 234,50";  fmtInt(1234.5) → "1 235";  fmtAbs(-5) → "5,00"
 * fmtDate("2026-11-03T08:00:00Z") → "03.11.2026";  fmtDateTime(…) → "03.11.2026, 10:00"
 */
const UK = 'uk-UA';
const KYIV = 'Europe/Kyiv';

export function fmtMoney(n: number): string {
  return n.toLocaleString(UK, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtInt(n: number): string {
  return n.toLocaleString(UK, { maximumFractionDigits: 0 });
}

/** Модуль суми — для таблиць, де знак показує окрема колонка/колір. */
export function fmtAbs(n: number): string {
  return fmtMoney(Math.abs(n));
}

export function fmtDate(iso: string | Date | null | undefined): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString(UK, { timeZone: KYIV, day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function fmtDateTime(iso: string | Date | null | undefined): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString(UK, { timeZone: KYIV, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/**
 * Київська доба в UTC без залежності від часової зони сервера (Vercel — UTC,
 * localhost — Київ). Літо +3, зима +2 — зсув береться з Intl для конкретної
 * миті, тому перехід на зимовий час не ламає межі доби.
 */

const fmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Kyiv', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
});

/** Зсув Києва відносно UTC у мілісекундах для цієї миті (+2 або +3 години). */
export function kyivOffsetMs(at: Date): number {
  const p = Object.fromEntries(fmt.formatToParts(at).map(x => [x.type, x.value]));
  const asUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour) % 24, Number(p.minute), Number(p.second));
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/** Дата за Києвом у форматі YYYY-MM-DD. */
export function kyivYmd(at: Date): string {
  const p = Object.fromEntries(fmt.formatToParts(at).map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

/**
 * Межі київської доби [start, end) в UTC. offsetDays: 0 — сьогодні, -1 — вчора.
 */
export function kyivDayRange(now: Date, offsetDays = 0): { start: Date; end: Date; ymd: string } {
  const [y, m, d] = kyivYmd(now).split('-').map(Number);
  // Опівніч Києва цього дня: беремо UTC-опівніч і віднімаємо зсув, який діє в ту мить
  const guess = new Date(Date.UTC(y, m - 1, d + offsetDays, 0, 0, 0));
  const start = new Date(guess.getTime() - kyivOffsetMs(guess));
  const nextGuess = new Date(Date.UTC(y, m - 1, d + offsetDays + 1, 0, 0, 0));
  const end = new Date(nextGuess.getTime() - kyivOffsetMs(nextGuess));
  return { start, end, ymd: kyivYmd(start) };
}

/** «03.10.2026, пʼятниця» для заголовків. */
export function kyivHuman(at: Date): string {
  return at.toLocaleDateString('uk-UA', { timeZone: 'Europe/Kyiv', day: '2-digit', month: '2-digit', year: 'numeric', weekday: 'long' });
}

// Дати з API Нової Пошти.
//
// НП віддає час київський і без зони, ще й у двох форматах у межах однієї
// відповіді: «18.08.2026 14:32:11» (RecipientDateTime) і «2026-08-18 14:32:11»
// (ActualDeliveryDate). Якщо покласти такий рядок у timestamptz як є, Postgres
// прочитає його як UTC — і час отримання посилки з'їде на 2–3 години.

/** Зсув Києва в хвилинах для конкретного моменту (влітку +180, взимку +120). */
function kyivOffsetMinutes(utcGuess: Date): number {
  const name = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Kyiv',
    timeZoneName: 'longOffset',
  }).formatToParts(utcGuess).find(p => p.type === 'timeZoneName')?.value ?? 'GMT+02:00';
  const m = /GMT([+-])(\d{2}):(\d{2})/.exec(name);
  if (!m) return 120;
  const sign = m[1] === '-' ? -1 : 1;
  return sign * (Number(m[2]) * 60 + Number(m[3]));
}

/**
 * Київський рядок НП → ISO в UTC. `null`, якщо формат чужий або дата порожня —
 * краще не показати нічого, ніж показати вигаданий час.
 */
export function parseNpDateTime(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  if (!s) return null;

  const dmy = /^(\d{2})\.(\d{2})\.(\d{4})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(s);
  const ymd = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(s);
  if (!dmy && !ymd) return null;

  const [year, month, day, hour, minute, second] = dmy
    ? [+dmy[3], +dmy[2], +dmy[1], +dmy[4], +dmy[5], +(dmy[6] ?? 0)]
    : [+ymd![1], +ymd![2], +ymd![3], +ymd![4], +ymd![5], +(ymd![6] ?? 0)];

  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) return null;

  // Спершу вважаємо час UTC, за цим моментом дізнаємось київський зсув і
  // віднімаємо його. Похибка можлива лише в годину переводу стрілок, коли
  // локальний час двозначний, — там НП і сама не розрізняє.
  const asUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  const offset = kyivOffsetMinutes(new Date(asUtc));
  const real = new Date(asUtc - offset * 60_000);
  return Number.isNaN(real.getTime()) ? null : real.toISOString();
}

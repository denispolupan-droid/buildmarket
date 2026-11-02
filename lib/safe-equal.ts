import { timingSafeEqual } from 'crypto';

/**
 * Порівняння секретів за сталий час (аудит 31.10.2026, §5 Low): звичайне `===`
 * зупиняється на першому розбіжному байті, і за часом відповіді секрет можна
 * підбирати посимвольно. Різна довжина → false без порівняння байтів (довжина
 * секрету і так не таємниця). Для заголовка крона є cronAuthorized (lib/cron-auth).
 */
export function safeEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

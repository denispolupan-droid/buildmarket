import { timingSafeEqual } from 'crypto';

/**
 * Авторизація кронів і службових викликів за CRON_SECRET.
 *
 * До 03.10.2026 кожен із 22 крон-роутів порівнював заголовок сам:
 * `authorization !== \`Bearer ${process.env.CRON_SECRET}\``. Дві вади:
 *  1) без змінної оточення рядок стає «Bearer undefined» — і такий заголовок
 *     проходить, тобто крони відкриті для всіх, щойно секрет зникне з оточення;
 *  2) звичайне порівняння рядків не є сталим у часі.
 * Тут — закрито за замовчуванням (немає секрету → 401 для всіх) і порівняння
 * через timingSafeEqual. Vercel Cron і GitHub Actions шлють той самий
 * `Authorization: Bearer <CRON_SECRET>`, тож поведінка для них не змінюється.
 */
export function cronAuthorized(authHeader: string | null | undefined): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(authHeader ?? '');
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

// Окремим модулем — щоб перевірку строку життя jwt можна було покрити тестом,
// не тягнучи за собою клієнт Supabase (а з ним і валідацію env).

/**
 * Скільки секунд лишилось жити jwt NovaPay.
 *
 * Вони видають його рівно на ХВИЛИНУ (заміряно 26.08: виданий о 18:01:10,
 * exp 18:02:10) — тобто збережений між прогонами крону майже завжди вже мертвий.
 * Без цієї перевірки кожен прогін витрачав на нього повільний виклик (8–60 с),
 * ловив «User not logged in», ішов авторизуватись — і однаково ротував
 * одноразовий refresh-токен. Тобто економія від кешу jwt була уявною, а кожна
 * зайва ротація — це шанс втратити ланцюжок сесії назавжди.
 *
 * Повертає 0, якщо jwt немає, він не розбирається або в ньому немає exp.
 */
export function jwtSecondsLeft(jwt: string | null | undefined, now = Date.now()): number {
  if (!jwt) return 0;
  const part = jwt.split('.')[1];
  if (!part) return 0;
  try {
    const payload = JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as { exp?: number };
    if (!payload.exp) return 0;
    return Math.max(0, (payload.exp * 1000 - now) / 1000);
  } catch {
    return 0;
  }
}

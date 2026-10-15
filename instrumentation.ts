/**
 * Серверні помилки → алерт адміну (етап 1 плану зростання, 15.10.2026).
 *
 * До цього про 500-ту на сайті чи в адмінці ми дізнавались від покупця або з
 * логів Vercel постфактум: жодного моніторингу помилок у проєкті не було.
 * onRequestError — штатний хук Next.js: викликається на кожну неперехоплену
 * помилку рендера, route handler-а чи server action. Шлемо в той самий
 * Telegram, що й решта алертів; alertAdmin тротлить однакові заголовки
 * (один на 30 хв), тож зламаний роут під трафіком не перетвориться на спам —
 * заголовок групує по маршруту, а не по тексту помилки.
 *
 * Лише Node.js-рантайм: на edge немає доступу до service role, а alertAdmin
 * і так пише в БД для тротлінгу.
 */

type RequestInfo = { path: string; method: string };
type ErrorContext = { routerKind: string; routePath: string; routeType: string };

export async function register(): Promise<void> {
  // Нічого ініціалізувати не треба; файл існує заради onRequestError.
}

export async function onRequestError(err: unknown, request: RequestInfo, context: ErrorContext): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const message = err instanceof Error ? err.message : String(err);
  const digest = typeof err === 'object' && err !== null && 'digest' in err ? String((err as { digest: unknown }).digest) : '';
  // Навігаційні «помилки» Next (notFound/redirect) сюди не мають потрапляти, але
  // на випадок зміни поведінки фреймворку — не алертимо на них.
  if (digest.startsWith('NEXT_')) return;

  try {
    const { alertAdmin } = await import('./lib/alert');
    const path = request.path.split('?')[0];
    alertAdmin(
      `500 у ${context.routeType}: ${context.routePath || path}`,
      `${request.method} ${path}\n${message.slice(0, 600)}${digest ? `\n(digest ${digest})` : ''}`,
    );
  } catch (e) {
    // Алерт ніколи не має ламати обробку запиту, який і так уже впав.
    console.error('[instrumentation] alert failed:', e);
  }
}

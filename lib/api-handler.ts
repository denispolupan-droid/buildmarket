import { NextResponse, type NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
import { log, runWithLogContext } from './log';
import { alertAdmin } from './alert';

/**
 * Обгортка кожного обробника app/api (аудит 31.10.2026, §1: 146 із 291 роутів
 * без catch — необроблена помилка давала порожній 500 без сліду):
 *  - request-id (rid): x-vercel-id від платформи або uuid; у відповіді —
 *    заголовок x-request-id, у JSON помилки — поле rid, у логах — rid у кожному рядку;
 *  - усе, що викинуто з обробника, стає одним рядком лога api.unhandled + алертом
 *    у Telegram (тротлінг у alertAdmin) + відповіддю 500 { error, rid };
 *  - повільні запити (> SLOW_MS) — рядок api.slow.
 * Поведінку обробника не змінює: що він повернув, те й віддається.
 *
 *   async function _POST(req: NextRequest) { … }
 *   export const POST = withApi('admin/orders/confirm', _POST);
 */
const SLOW_MS = 5000;

type Handler<C> = (req: NextRequest, ctx: C) => Promise<Response> | Response;

export function withApi<C>(route: string, handler: Handler<C>): Handler<C> {
  return async (req, ctx) => {
    const rid = req.headers.get('x-vercel-id') ?? randomUUID();
    const started = Date.now();
    return runWithLogContext({ rid, route }, async () => {
      try {
        const res = await handler(req, ctx);
        const ms = Date.now() - started;
        if (ms > SLOW_MS) log.warn('api.slow', { ms, method: req.method, status: res.status });
        try { res.headers.set('x-request-id', rid); } catch { /* immutable headers (redirect/static) */ }
        return res;
      } catch (err) {
        const ms = Date.now() - started;
        log.error('api.unhandled', { err, method: req.method, ms });
        alertAdmin(`API ${route}: необроблена помилка`, `${err instanceof Error ? err.message : String(err)}\nrid ${rid}`);
        const res = NextResponse.json({ error: 'Внутрішня помилка сервера', rid }, { status: 500 });
        res.headers.set('x-request-id', rid);
        return res;
      }
    });
  };
}

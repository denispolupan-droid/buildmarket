import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Структуровані логи (аудит 31.10.2026, §4/§10 п. 21). Один рядок JSON на подію:
 * { t, level, event, rid, route, ...fields }. Vercel показує їх у Runtime Logs,
 * а по rid (request-id) можна зібрати все, що сталось у межах одного запиту —
 * від роуту до синку й алерту.
 *
 *   log.info('np.ttn.created', { orderId, ttn });
 *   log.error('rozetka.sync.failed', { err, page });
 *
 * rid береться з контексту withApi (lib/api-handler) автоматично; поза роутом
 * (крон без обгортки, скрипт) — порожній. Error у полях розгортається в
 * { message, stack }, щоб не лягав у лог як {}.
 */
export type LogFields = Record<string, unknown>;

type Ctx = { rid: string; route: string };
const als = new AsyncLocalStorage<Ctx>();

export function runWithLogContext<T>(ctx: Ctx, fn: () => T): T {
  return als.run(ctx, fn);
}
export function logContext(): Ctx | undefined {
  return als.getStore();
}

function plain(v: unknown): unknown {
  if (v instanceof Error) return { message: v.message, name: v.name, stack: v.stack?.split('\n').slice(0, 6).join('\n') };
  return v;
}

function emit(level: 'info' | 'warn' | 'error', event: string, fields?: LogFields) {
  const ctx = als.getStore();
  const rec: Record<string, unknown> = { t: new Date().toISOString(), level, event };
  if (ctx) { rec.rid = ctx.rid; rec.route = ctx.route; }
  if (fields) for (const [k, v] of Object.entries(fields)) rec[k] = plain(v);
  let line: string;
  try { line = JSON.stringify(rec); } catch { line = JSON.stringify({ t: rec.t, level, event, rid: ctx?.rid, unserializable: true }); }
  (level === 'error' ? console.error : level === 'warn' ? console.warn : console.log)(line);
}

export const log = {
  info: (event: string, fields?: LogFields) => emit('info', event, fields),
  warn: (event: string, fields?: LogFields) => emit('warn', event, fields),
  error: (event: string, fields?: LogFields) => emit('error', event, fields),
};

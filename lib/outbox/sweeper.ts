import { createServiceClient, type TableUpdate } from '../supabase-service';
import { alertAdmin } from '../alert';
import { log } from '../log';
import { isExhausted, nextAttemptAt } from './backoff';
import { runOutboxHandler } from './handlers';
import type { OutboxRow } from './types';

type Db = ReturnType<typeof createServiceClient>;

export type SweepResult = { claimed: number; done: number; skipped: number; retried: number; failed: number };

/**
 * Один тік диспетчера: взяти пачку (по одній події на замовлення, оренда
 * 5 хв), виконати, записати результат. Події різних замовлень — до 5
 * паралельно (ліміти НП/Prom «To many requests»). Помилка однієї події не
 * зупиняє решту.
 */
export async function sweepOutbox(db: Db = createServiceClient(), limit = 20): Promise<SweepResult> {
  const { data, error } = await db.rpc('outbox_claim', { p_limit: limit, p_lease_seconds: 300 });
  if (error) throw new Error(`outbox_claim: ${error.message}`);
  const rows = (data ?? []) as OutboxRow[];
  const res: SweepResult = { claimed: rows.length, done: 0, skipped: 0, retried: 0, failed: 0 };

  const CONCURRENCY = 5;
  for (let i = 0; i < rows.length; i += CONCURRENCY) {
    await Promise.all(rows.slice(i, i + CONCURRENCY).map(async row => {
      const outcome = await processOne(db, row);
      res[outcome] += 1;
    }));
  }
  if (rows.length) log.info('outbox.sweep', res);
  return res;
}

/** Запис результату; помилка запису — у лог, рядок лишиться в оренді до її кінця й повториться. */
async function mark(db: Db, id: number, patch: TableUpdate<'outbox_events'>): Promise<void> {
  const { error } = await db.from('outbox_events').update(patch).eq('id', id);
  if (error) log.error('outbox.mark_failed', { id, patch, err: error.message });
}

async function processOne(db: Db, row: OutboxRow): Promise<'done' | 'skipped' | 'retried' | 'failed'> {
  const now = new Date().toISOString();
  try {
    const r = await runOutboxHandler(db, row);
    if (r.ok) {
      await mark(db, row.id, { status: 'done', done_at: now, locked_until: null, last_error: null });
      return 'done';
    }
    await mark(db, row.id, { status: 'skipped', done_at: now, locked_until: null, last_error: r.skipped });
    log.info('outbox.skipped', { id: row.id, handler: row.handler, order: row.aggregate_id, reason: r.skipped });
    return 'skipped';
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // attempts уже збільшено в outbox_claim
    if (isExhausted(row.attempts)) {
      await mark(db, row.id, { status: 'failed', locked_until: null, last_error: msg });
      log.error('outbox.failed', { id: row.id, handler: row.handler, order: row.aggregate_id, attempts: row.attempts, err: msg });
      const p = row.payload as { order_number?: number; channel?: string; ttn?: string };
      alertAdmin(
        `⚠ Подія ${row.handler} для #${p.order_number ?? row.aggregate_id} не доставлена за годину (${row.attempts} спроб)`,
        `${p.channel ?? ''} ${p.ttn ?? ''}: ${msg}`.trim(),
      );
      return 'failed';
    }
    await mark(db, row.id, { status: 'pending', next_at: nextAttemptAt(row.attempts) ?? now, locked_until: null, last_error: msg });
    log.warn('outbox.retry', { id: row.id, handler: row.handler, order: row.aggregate_id, attempts: row.attempts, err: msg });
    return 'retried';
  }
}

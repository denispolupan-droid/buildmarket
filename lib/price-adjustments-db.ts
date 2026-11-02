/**
 * Корекції цін маркетплейсів — робота з базою (лише сервер, service_role).
 *
 * Чиста логіка — lib/price-adjustments. Тут: завантаження живих корекцій для
 * фідів і екранів (loadFactorMap → adjustFactor у lib/marketplace-pricing),
 * створення/вимкнення корекцій і обробка дат кроном. Ціни нікуди не пишуться:
 * фіди й екрани рахують ціну МП на льоту, тож зміна корекції діє одразу.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchAllRows } from './db-paginate';
import { insertPriceChangeLog, type PriceLogInput } from './price-change-log';
import {
  type AdjChannel, type AdjRow, type FactorMap,
  ADJ_CHANNELS, adjState, appliedStateFor, buildFactorMap, kyivToday,
} from './price-adjustments';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any, any, any>;

const ADJ_COLS = 'id, log_id, channel, sku, pct, is_promo, starts_on, ends_on, cancelled_at, applied_state, comment';
const CHUNK = 200;

function normRow(r: Record<string, unknown>): AdjRow {
  return {
    id:            Number(r.id),
    log_id:        r.log_id != null ? Number(r.log_id) : null,
    channel:       r.channel as AdjChannel,
    sku:           String(r.sku),
    pct:           Number(r.pct),
    is_promo:      !!r.is_promo,
    starts_on:     String(r.starts_on),
    ends_on:       r.ends_on != null ? String(r.ends_on) : null,
    cancelled_at:  (r.cancelled_at as string | null) ?? null,
    applied_state: r.applied_state as AdjRow['applied_state'],
    comment:       (r.comment as string | null) ?? null,
  };
}

/**
 * Живі корекції: не вимкнені й не закінчені за датою (активні + заплановані).
 * channels/skus — необов'язкові фільтри.
 */
export async function loadLiveAdjustments(
  db: Db,
  opts: { channels?: readonly AdjChannel[]; skus?: string[] } = {},
): Promise<AdjRow[]> {
  const today = kyivToday();
  const build = (skus?: string[]) => (f: number, t: number) => {
    let q = db.from('price_adjustments').select(ADJ_COLS)
      .is('cancelled_at', null)
      .or(`ends_on.is.null,ends_on.gt.${today}`);
    if (opts.channels?.length) q = q.in('channel', [...opts.channels]);
    if (skus) q = q.in('sku', skus);
    return q.order('id').range(f, t);
  };
  if (!opts.skus) return (await fetchAllRows(build())).map(normRow);
  const out: AdjRow[] = [];
  for (let i = 0; i < opts.skus.length; i += CHUNK) {
    out.push(...(await fetchAllRows(build(opts.skus.slice(i, i + CHUNK)))).map(normRow));
  }
  return out;
}

/** Множники активних корекцій для каналів (фіди, екрани МП). */
export async function loadFactorMap(db: Db, channels: readonly AdjChannel[] = ADJ_CHANNELS, skus?: string[]): Promise<FactorMap> {
  const rows = await loadLiveAdjustments(db, { channels, skus });
  return buildFactorMap(rows, kyivToday());
}

// ── Створення ───────────────────────────────────────────────────────────────

export type CreateAdjustmentsInput = {
  /** Що бачить журнал: type/value/target/comment/count/snapshot переоцінки */
  log: Omit<PriceLogInput, 'adjustment' | 'status' | 'revert_at' | 'effective_from' | 'is_promo'>;
  items: { sku: string; channel: AdjChannel; pct: number }[];
  is_promo?: boolean;
  starts_on?: string | null;   // YYYY-MM-DD, порожньо або минуле = сьогодні
  ends_on?: string | null;     // YYYY-MM-DD, виключно
};

export async function createAdjustments(db: Db, userId: string | null, input: CreateAdjustmentsInput) {
  const today = kyivToday();
  const startsOn = input.starts_on && input.starts_on > today ? input.starts_on : today;
  const endsOn = input.ends_on || null;
  if (endsOn && endsOn <= startsOn) return { ok: false as const, error: 'Дата повернення має бути пізніше за дату початку' };

  const items = input.items.filter(i => i.sku && Number.isFinite(i.pct) && i.pct > -100 && i.pct < 1000);
  if (!items.length) return { ok: false as const, error: 'Немає товарів для корекції' };

  const isScheduled = startsOn > today;
  const logRes = await insertPriceChangeLog(db, userId, {
    ...input.log,
    adjustment: true,
    is_promo: !!input.is_promo,
    status: isScheduled ? 'pending' : 'applied',
    effective_from: isScheduled ? new Date(`${startsOn}T00:00:00`).toISOString() : null,
    revert_at: endsOn,
  });
  if ('error' in logRes) return { ok: false as const, error: logRes.error };

  const rows = items.map(i => ({
    log_id: logRes.id, channel: i.channel, sku: i.sku,
    pct: Math.round(i.pct * 1e6) / 1e6,
    is_promo: !!input.is_promo, starts_on: startsOn, ends_on: endsOn,
    applied_state: isScheduled ? 'pending' : 'active',
    comment: input.log.comment ?? null, created_by: userId,
  }));
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db.from('price_adjustments').insert(rows.slice(i, i + 500));
    if (error) {
      // Без корекцій запис журналу брехав би — прибираємо вставлене й гасимо запис
      await db.from('price_adjustments').delete().eq('log_id', logRes.id);
      await db.from('price_change_log').update({ status: 'cancelled', comment: `Помилка створення корекцій: ${error.message}` }).eq('id', logRes.id);
      return { ok: false as const, error: error.message };
    }
  }

  return { ok: true as const, log_id: logRes.id, count: new Set(items.map(i => i.sku)).size, scheduled: isScheduled };
}

// ── Вимкнення ───────────────────────────────────────────────────────────────

/** Записи журналу, у яких не лишилось живих корекцій, — позначаємо відкоченими. */
async function closeEmptyLogs(db: Db, logIds: number[]): Promise<number[]> {
  const today = kyivToday();
  const closed: number[] = [];
  for (const id of [...new Set(logIds)]) {
    const rows = await fetchAllRows((f, t) => db.from('price_adjustments')
      .select('id, starts_on, ends_on, cancelled_at').eq('log_id', id).order('id').range(f, t));
    const live = rows.some(r => { const s = adjState(r as AdjRow, today); return s === 'active' || s === 'scheduled'; });
    if (live) continue;
    const { data } = await db.from('price_change_log')
      .update({ status: 'reverted', reverted_at: new Date().toISOString() })
      .eq('id', id).is('reverted_at', null).select('id');
    if (data?.length) closed.push(id);
  }
  return closed;
}

export type CancelFilter =
  | { logId: number }
  | { skus: string[]; channels: readonly AdjChannel[]; promoOnly?: boolean };

/**
 * Вимикає живі корекції (за записом журналу або «повернути до наценки» по
 * товарах і каналах) і пише рядок у журнал.
 */
export async function cancelAdjustments(
  db: Db,
  filter: CancelFilter,
  userId: string | null,
  opts: { comment?: string | null; target?: string } = {},
) {
  const live = 'logId' in filter
    ? (await fetchAllRows((f, t) => db.from('price_adjustments').select(ADJ_COLS)
        .eq('log_id', filter.logId).is('cancelled_at', null).order('id').range(f, t))).map(normRow)
    : (await loadLiveAdjustments(db, { channels: filter.channels, skus: filter.skus }))
        .filter(r => !filter.promoOnly || r.is_promo);
  const today = kyivToday();
  const targets = live.filter(r => { const s = adjState(r, today); return s === 'active' || s === 'scheduled'; });
  if (!targets.length) return { ok: false as const, error: 'Немає діючих корекцій', status: 409 };

  const ids = targets.map(r => r.id!);
  const now = new Date().toISOString();
  for (let i = 0; i < ids.length; i += 500) {
    const { error } = await db.from('price_adjustments').update({ cancelled_at: now, applied_state: 'ended' }).in('id', ids.slice(i, i + 500));
    if (error) return { ok: false as const, error: error.message, status: 500 };
  }

  await closeEmptyLogs(db, targets.map(r => r.log_id).filter((x): x is number => x != null));

  const skuCount = new Set(targets.map(r => r.sku)).size;
  await insertPriceChangeLog(db, userId, {
    type: 'logId' in filter ? 'adj_revert' : 'adj_reset',
    value: 0,
    target: opts.target ?? channelsToTarget(targets.map(r => r.channel)),
    count: skuCount,
    comment: opts.comment ?? null,
  });

  return { ok: true as const, cancelled: ids.length, skus: skuCount };
}

/** Набір каналів → target журналу (як у панелі переоцінки). */
export function channelsToTarget(channels: readonly string[]): string {
  const s = new Set(channels);
  if (s.size === 1) return [...s][0];
  return 'mp';
}

/** target панелі переоцінки → канали корекцій. */
export function targetToChannels(target: string): AdjChannel[] {
  switch (target) {
    case 'rozetka': return ['rozetka'];
    case 'prom':    return ['prom'];
    case 'mp':      return ['prom', 'rozetka'];
    default:        return [];
  }
}

// ── Дати (крон) ─────────────────────────────────────────────────────────────

/**
 * Приводить журнал у відповідність до дат корекцій: почались заплановані —
 * запис «застосовано»; закінчились — запис «відкочено» + рядок
 * «Автозавершення». Ціни перераховувати не треба: фіди рахують на льоту.
 */
export async function processAdjustmentBoundaries(db: Db) {
  const today = kyivToday();
  const rows = (await fetchAllRows((f, t) => db.from('price_adjustments').select(ADJ_COLS)
    .is('cancelled_at', null).in('applied_state', ['pending', 'active']).order('id').range(f, t))).map(normRow);

  const moved = rows
    .map(r => ({ r, want: appliedStateFor(adjState(r, today)) }))
    .filter(x => x.want !== x.r.applied_state);
  const errors: string[] = [];
  if (!moved.length) return { moved: 0, errors };

  for (const state of ['active', 'ended'] as const) {
    const ids = moved.filter(x => x.want === state).map(x => x.r.id!);
    for (let i = 0; i < ids.length; i += 500) {
      const { error } = await db.from('price_adjustments').update({ applied_state: state }).in('id', ids.slice(i, i + 500));
      if (error) errors.push(error.message);
    }
  }

  // Почались — pending → applied
  const started = [...new Set(moved.filter(x => x.want === 'active').map(x => x.r.log_id).filter((x): x is number => x != null))];
  if (started.length) {
    await db.from('price_change_log').update({ status: 'applied' }).in('id', started).eq('status', 'pending');
  }

  // Закінчились за датою — закрити записи й лишити слід у журналі
  const endedLogs = [...new Set(moved.filter(x => x.want === 'ended').map(x => x.r.log_id).filter((x): x is number => x != null))];
  const closed = await closeEmptyLogs(db, endedLogs);
  for (const logId of closed) {
    const { data: logRow } = await db.from('price_change_log').select('target, created_at, is_promo').eq('id', logId).maybeSingle();
    const groupSkus = new Set(moved.filter(x => x.r.log_id === logId).map(x => x.r.sku));
    await insertPriceChangeLog(db, null, {
      type: 'adj_revert', value: 0, target: String(logRow?.target ?? 'mp'), count: groupSkus.size,
      comment: `Автозавершення ${logRow?.is_promo ? 'акції' : 'корекції'} від ${logRow?.created_at ? new Date(String(logRow.created_at)).toLocaleDateString('uk-UA') : '—'} — дата повернення настала`,
    });
  }

  return { moved: moved.length, errors };
}

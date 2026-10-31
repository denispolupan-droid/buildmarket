/**
 * Переоцінка маркетплейсів з розділу «Ціни».
 *
 * Ціни Rozetka/Prom не зберігаються — фід рахує їх на льоту від собівартості
 * через націнку товару (products.rozetka_markup_pct / prom_markup_pct) або,
 * коли товарної немає, категорії (lib/marketplace-pricing). Тому переоцінка МП
 * міняє не ціну, а товарну націнку: нова націнка = така, щоб ціна зросла на
 * N % (markupForPriceChange) або просто задане число.
 *
 * Механізм фіда при цьому не змінюється: собівартість від синку постачальника
 * далі проходить через ту саму формулу, лише з іншою націнкою. Ручна ціна Prom
 * (product_stock.price_wholesale) має пріоритет над формулою і від націнки не
 * залежить — такі товари переоцінка не зачіпає.
 *
 * Відкат: журнал переоцінок зберігає у snapshot товарну націнку ДО (null =
 * «рахувалась від категорії») — повернення цих значень повертає й попередній
 * механізм ціноутворення для кожного SKU.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { insertPriceChangeLog } from './price-change-log';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any, any, any>;

export const MP_TARGETS = ['rozetka', 'prom', 'mp'] as const;
export type MpTarget = typeof MP_TARGETS[number];

export function isMpTarget(target: string | null | undefined): target is MpTarget {
  return (MP_TARGETS as readonly string[]).includes(target ?? '');
}

/** Стан товару в одному каналі: товарна націнка (null = категорійна) і ціна фіда. */
export type MpChannelState = {
  rz_markup?: number | null;
  rz_price?: number | null;
  prom_markup?: number | null;
  prom_price?: number | null;
};

export type MpSnapshotRow = {
  sku: string;
  name: string;
  before: MpChannelState;
  after: MpChannelState;
};

export type MpMarkupItem = {
  sku: string;
  rozetka_markup_pct?: number | null;
  prom_markup_pct?: number | null;
};

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * Валідація пакета з клієнта: SKU непорожній, націнка — число в розумних межах
 * або null (скинути на категорійну). Поля, яких немає, не чіпаємо.
 */
export function normalizeMpItems(raw: unknown): { items: MpMarkupItem[]; errors: string[] } {
  const items: MpMarkupItem[] = [];
  const errors: string[] = [];
  if (!Array.isArray(raw)) return { items, errors: ['items має бути масивом'] };
  for (const r of raw as Record<string, unknown>[]) {
    const sku = typeof r?.sku === 'string' ? r.sku.trim() : '';
    if (!sku) { errors.push('порожній sku'); continue; }
    const item: MpMarkupItem = { sku };
    let has = false;
    for (const key of ['rozetka_markup_pct', 'prom_markup_pct'] as const) {
      if (!(key in r)) continue;
      const v = r[key];
      if (v === null) { item[key] = null; has = true; continue; }
      if (!isNum(v) || v < -100 || v > 1000) { errors.push(`${sku}: ${key} = ${String(v)}`); continue; }
      item[key] = Math.round(v * 100) / 100;
      has = true;
    }
    if (has) items.push(item);
  }
  return { items, errors };
}

/**
 * Пакет для відкату: кожному SKU повертаємо націнки «до». Ключ беремо лише
 * якщо він був у знімку — переоцінка лише Rozetka не має зачепити Prom.
 */
export function mpRevertItems(snapshot: MpSnapshotRow[]): MpMarkupItem[] {
  const out: MpMarkupItem[] = [];
  for (const row of snapshot) {
    const item: MpMarkupItem = { sku: row.sku };
    let has = false;
    if ('rz_markup' in row.before)   { item.rozetka_markup_pct = row.before.rz_markup ?? null; has = true; }
    if ('prom_markup' in row.before) { item.prom_markup_pct    = row.before.prom_markup ?? null; has = true; }
    if (has) out.push(item);
  }
  return out;
}

/**
 * SKU, чия поточна націнка вже не та, що записана «після»: хтось міняв її
 * пізніше (екран Rozetka/Prom, масові дії, інша переоцінка). Відкат такі теж
 * повертає до «до», але користувачу варто про них сказати.
 */
export function mpDriftedSkus(
  snapshot: MpSnapshotRow[],
  current: Map<string, { rozetka_markup_pct: number | null; prom_markup_pct: number | null }>,
): string[] {
  const eq = (a: number | null | undefined, b: number | null | undefined) =>
    (a ?? null) === null ? (b ?? null) === null : b != null && Math.abs(Number(a) - Number(b)) < 0.005;
  const out: string[] = [];
  for (const row of snapshot) {
    const cur = current.get(row.sku);
    if (!cur) continue;
    const rzDrift   = 'rz_markup'   in row.after && !eq(row.after.rz_markup,   cur.rozetka_markup_pct);
    const promDrift = 'prom_markup' in row.after && !eq(row.after.prom_markup, cur.prom_markup_pct);
    if (rzDrift || promDrift) out.push(row.sku);
  }
  return out;
}

/**
 * Пакет для ВІДКЛАДЕНОГО застосування: націнки «після» зі знімка.
 */
export function mpApplyItems(snapshot: MpSnapshotRow[]): MpMarkupItem[] {
  const out: MpMarkupItem[] = [];
  for (const row of snapshot) {
    const item: MpMarkupItem = { sku: row.sku };
    let has = false;
    if ('rz_markup' in row.after)   { item.rozetka_markup_pct = row.after.rz_markup ?? null; has = true; }
    if ('prom_markup' in row.after) { item.prom_markup_pct    = row.after.prom_markup ?? null; has = true; }
    if (has) out.push(item);
  }
  return out;
}

/**
 * Перед відкладеним застосуванням оновлюємо «до» зі стану бази на момент
 * застосування: між плануванням і запуском крона націнку могли змінити, а
 * відкат має повертати саме те, що було перед цією переоцінкою. Якщо націнка
 * розійшлась — ціну «до» прибираємо (вона рахувалась від старої націнки).
 */
export function refreshMpBefore(
  snapshot: MpSnapshotRow[],
  current: Map<string, { rozetka_markup_pct: number | null; prom_markup_pct: number | null }>,
): MpSnapshotRow[] {
  const same = (a: number | null | undefined, b: number | null) =>
    (a ?? null) === null ? b === null : b != null && Math.abs(Number(a) - b) < 0.005;
  return snapshot.map(row => {
    const cur = current.get(row.sku);
    if (!cur) return row;
    const before = { ...row.before };
    if ('rz_markup' in before && !same(before.rz_markup, cur.rozetka_markup_pct)) {
      before.rz_markup = cur.rozetka_markup_pct; before.rz_price = null;
    }
    if ('prom_markup' in before && !same(before.prom_markup, cur.prom_markup_pct)) {
      before.prom_markup = cur.prom_markup_pct; before.prom_price = null;
    }
    return { ...row, before };
  });
}

/** Записує націнки в products пачками. Повертає список помилок. */
export async function applyMpMarkups(db: Db, items: MpMarkupItem[]): Promise<string[]> {
  const errors: string[] = [];
  const CHUNK = 20;
  for (let i = 0; i < items.length; i += CHUNK) {
    await Promise.all(items.slice(i, i + CHUNK).map(async item => {
      const update: Record<string, unknown> = {};
      if (item.rozetka_markup_pct !== undefined) update.rozetka_markup_pct = item.rozetka_markup_pct;
      if (item.prom_markup_pct    !== undefined) update.prom_markup_pct    = item.prom_markup_pct;
      if (!Object.keys(update).length) return;
      const { error } = await db.from('products').update(update).eq('sku', item.sku);
      if (error) errors.push(`${item.sku}: ${error.message}`);
    }));
  }
  return errors;
}

/** Поточні товарні націнки для набору SKU (для перевірки дрейфу перед відкатом). */
export async function loadMpMarkups(
  db: Db,
  skus: string[],
): Promise<Map<string, { rozetka_markup_pct: number | null; prom_markup_pct: number | null }>> {
  const out = new Map<string, { rozetka_markup_pct: number | null; prom_markup_pct: number | null }>();
  for (let i = 0; i < skus.length; i += 300) {
    const { data } = await db
      .from('products')
      .select('sku, rozetka_markup_pct, prom_markup_pct')
      .in('sku', skus.slice(i, i + 300));
    for (const r of data ?? []) {
      out.set(r.sku, {
        rozetka_markup_pct: r.rozetka_markup_pct != null ? Number(r.rozetka_markup_pct) : null,
        prom_markup_pct:    r.prom_markup_pct    != null ? Number(r.prom_markup_pct)    : null,
      });
    }
  }
  return out;
}

// ── Операції над записом журналу ─────────────────────────────────────────────

export type MpLogEntry = {
  id: number;
  type: string;
  target: string;
  status: string | null;
  reverted_at: string | null;
  snapshot: unknown;
  created_at: string;
  revert_at?: string | null;
};

/**
 * Відкат переоцінки МП: повертає націнки «до» зі знімка, позначає запис
 * reverted і пише окремий рядок type=mp_revert (знімок дзеркальний). Спільний
 * для кнопки в журналі (userId) і крона за датою «повернути після» (null).
 */
export async function revertMpEntry(
  db: Db,
  entry: MpLogEntry,
  userId: string | null,
  source: 'manual' | 'cron' = 'manual',
): Promise<{ ok: true; reverted: number; drifted: string[]; reverted_at: string; log_error?: string } | { ok: false; error: string; status: number }> {
  if (!isMpTarget(entry.target) || entry.type === 'mp_revert') {
    return { ok: false, error: 'Відкат доступний лише для переоцінок маркетплейсів', status: 400 };
  }
  if (entry.status !== 'applied' || entry.reverted_at) {
    return { ok: false, error: 'Цю переоцінку вже відкочено або вона не застосована', status: 409 };
  }

  const snapshot = (entry.snapshot ?? []) as MpSnapshotRow[];
  const items = mpRevertItems(snapshot);
  if (!items.length) return { ok: false, error: 'У знімку немає націнок для відкату', status: 400 };

  const current = await loadMpMarkups(db, items.map(i => i.sku));
  const drifted = mpDriftedSkus(snapshot, current);

  const errs = await applyMpMarkups(db, items);
  if (errs.length) return { ok: false, error: 'Відкат частково не вдався: ' + errs.slice(0, 5).join('; '), status: 500 };

  const now = new Date().toISOString();
  await db.from('price_change_log').update({ status: 'reverted', reverted_at: now }).eq('id', entry.id);

  const when = new Date(entry.created_at).toLocaleDateString('uk-UA');
  const res = await insertPriceChangeLog(db, userId, {
    type: 'mp_revert', value: 0, target: entry.target, status: 'applied',
    count: items.length,
    comment: (source === 'cron' ? `Автовідкат переоцінки від ${when} (дата повернення ${entry.revert_at ?? ''})` : `Відкат переоцінки від ${when}`)
      + (drifted.length ? ` · ${drifted.length} товарів змінювались після неї` : ''),
    snapshot: snapshot.map(r => ({ sku: r.sku, name: r.name, before: r.after, after: r.before })),
  });

  return { ok: true, reverted: items.length, drifted, reverted_at: now, ...('error' in res ? { log_error: res.error } : {}) };
}

/**
 * Відкладене застосування (крон): «до» оновлюємо зі стану бази, пишемо націнки
 * «після», знімок зберігаємо оновленим. Статус на applied ставить викликач.
 */
export async function applyScheduledMpEntry(db: Db, entry: MpLogEntry): Promise<{ applied: number; errors: string[] }> {
  const snapshot = (entry.snapshot ?? []) as MpSnapshotRow[];
  const items = mpApplyItems(snapshot);
  if (!items.length) return { applied: 0, errors: [] };
  const current = await loadMpMarkups(db, items.map(i => i.sku));
  const refreshed = refreshMpBefore(snapshot, current);
  const errors = await applyMpMarkups(db, items);
  if (!errors.length) {
    const { error } = await db.from('price_change_log').update({ snapshot: refreshed }).eq('id', entry.id);
    if (error) errors.push(`snapshot #${entry.id}: ${error.message}`);
  }
  return { applied: items.length - errors.length, errors };
}

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

/** Записує націнки в products пачками. Повертає список помилок. */
export async function applyMpMarkups(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: SupabaseClient<any, any, any>,
  items: MpMarkupItem[],
): Promise<string[]> {
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: SupabaseClient<any, any, any>,
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

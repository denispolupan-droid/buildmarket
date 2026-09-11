/**
 * Активний пуш цін і наявності в Епіцентр через /v1/offers (за SKU).
 *
 * Фід кабінет перечитує раз на добу — між читаннями товар може продатись або
 * зникнути в постачальника, а на Епіцентрі досі «в наявності». Цей модуль
 * проштовхує актуальний стан одразу (кнопка на дашборді, після синку
 * постачальників). Ціна — ТІЄЮ САМОЮ формулою, що й фід (lib/marketplace-pricing).
 *
 * Ідентифікація: наш SKU без дефіса (toEpicentrId) = <offer id> фіда = «Артикул»
 * картки в кабінеті = sku в /v1/offers. Невідомий кабінету SKU повертається зі status=forbidden — це
 * не помилка, просто картка ще не заведена/не пройшла модерацію.
 */
import { createServiceClient } from './supabase';
import { fetchAllRows } from './db-paginate';
import { batchUpdateEpicentrOffers, EPICENTR_OFFERS_BATCH, type EpicentrOfferUpdate } from './epicentr-api';
import { epicentrPrice } from './marketplace-pricing';
import { epicentrAvailabilityOf } from './epicentr-availability';

export type EpicentrPushResult = {
  ok: boolean;
  skipped?: string;
  total: number;      // скільки SKU відправили
  enqueued: number;   // прийнято в обробку
  unknown: number;    // forbidden — картки немає в кабінеті
  noop: number;       // cache_noop / duplicate — без змін
  errors: number;     // валідація
  error_sample?: string;
  request_ids: string[];
};

type Cat = { slug: string; epicentr_commission_pct: number | null; epicentr_markup_pct: number | null };
type Stock = { price_retail: number | null; price_cost: number | null; price_old: number | null; stock_qty: number | null; stock_status: string | null };
type Row = { sku: string; on_epicentr: boolean | null; epicentr_markup_pct: number | null; category_slug: string; stock: Stock | Stock[] | null };

export async function pushEpicentrOffers(opts: { onlySkus?: string[] } = {}): Promise<EpicentrPushResult> {
  const db = createServiceClient();
  const base: EpicentrPushResult = { ok: true, total: 0, enqueued: 0, unknown: 0, noop: 0, errors: 0, request_ids: [] };

  const [cats, rows] = await Promise.all([
    fetchAllRows<Cat>((from, to) => db.from('categories').select('slug, epicentr_commission_pct, epicentr_markup_pct').order('slug').range(from, to)),
    fetchAllRows<Row>((from, to) => {
      let q = db.from('products')
        .select('sku, on_epicentr, epicentr_markup_pct, category_slug, stock:product_stock(price_retail, price_cost, price_old, stock_qty, stock_status)')
        .eq('is_active', true);
      if (opts.onlySkus?.length) q = q.in('sku', opts.onlySkus);
      return q.order('sku').range(from, to);
    }),
  ]);
  const catMap = new Map(cats.map(c => [c.slug, c]));

  const updates: EpicentrOfferUpdate[] = [];
  for (const p of rows) {
    const stock = Array.isArray(p.stock) ? p.stock[0] ?? null : p.stock;
    const cat = catMap.get(p.category_slug);
    const retail = Number(stock?.price_retail) || 0;
    // Вимкнені або без ціни — лише наявність (не гасимо ціну нулем)
    const enabled = p.on_epicentr === true && retail > 0;
    const upd: EpicentrOfferUpdate = { sku: p.sku, availability: epicentrAvailabilityOf(enabled, stock) };
    if (enabled) {
      upd.price = epicentrPrice({
        cost: stock?.price_cost != null ? Number(stock.price_cost) : null,
        retail,
        productMarkupPct: p.epicentr_markup_pct != null ? Number(p.epicentr_markup_pct) : null,
        categoryMarkupPct: cat?.epicentr_markup_pct != null ? Number(cat.epicentr_markup_pct) : null,
        commissionPct: Number(cat?.epicentr_commission_pct ?? 0),
      });
      const old = stock?.price_old ? Number(stock.price_old) : null;
      upd.oldPrice = old && old > upd.price ? old : null;
    }
    updates.push(upd);
  }
  if (!updates.length) return { ...base, skipped: 'Немає товарів для пушу' };

  const errorSamples: string[] = [];
  for (let i = 0; i < updates.length; i += EPICENTR_OFFERS_BATCH) {
    const chunk = updates.slice(i, i + EPICENTR_OFFERS_BATCH);
    let res;
    try {
      res = await batchUpdateEpicentrOffers(chunk);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (i === 0) return { ...base, ok: false, skipped: `API Епіцентру недоступний: ${msg.slice(0, 200)}` };
      errorSamples.push(msg.slice(0, 120));
      base.errors += chunk.length;
      continue;
    }
    base.total += chunk.length;
    base.request_ids.push(res.requestId);
    for (const it of res.items ?? []) {
      if (it.status === 'enqueued' || it.status === 'processed') base.enqueued++;
      else if (it.status === 'forbidden') base.unknown++;
      else {
        const codes = Object.values(it.errors ?? {}).flat();
        if (codes.some(c => /cache_noop|duplicate/.test(c))) base.noop++;
        else { base.errors++; if (errorSamples.length < 5) errorSamples.push(`${it.id}: ${codes.join(', ')}`); }
      }
    }
  }
  if (errorSamples.length) base.error_sample = errorSamples.join('; ');
  return base;
}

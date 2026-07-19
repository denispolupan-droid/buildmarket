/**
 * Активний пуш залишків у Prom.ua через API (products/edit).
 *
 * Фід (YML) Prom перечитує лише кілька разів на день — між читаннями є вікно,
 * коли товар вже проданий/зник у постачальника, а на Prom досі «в наявності»
 * (оверсейл). Цей модуль проштовхує актуальні залишки одразу після синку
 * постачальників і за кнопкою в адмінці.
 *
 * updatePromProducts був написаний давно, але ніде не викликався (аудит, розділ B).
 *
 * Ідентифікація: наш SKU = external_id товару на Prom (так Prom імпортує
 * <offer id> з фіда); fallback — поле sku картки Prom.
 */
import { createServiceClient } from './supabase';
import { getPromProducts, updatePromProducts } from './prom-api';
import { fetchAllRows } from './db-paginate';

export type PromStockPushResult = {
  ok: boolean;
  skipped?: string;
  prom_total: number;   // скільки товарів у кабінеті Prom
  matched: number;      // скільки зіставлено з нашими SKU
  pushed: number;       // скільки оновлень надіслано (тільки зміни)
};

export async function pushPromStock(): Promise<PromStockPushResult> {
  const db = createServiceClient();

  // 1. Всі товари кабінету Prom (пагінація за last_id)
  const promProducts: { id: number; key: string | null; quantity: number }[] = [];
  let lastId: number | undefined;
  for (let page = 0; page < 100; page++) {
    let batch;
    try {
      batch = await getPromProducts({ limit: 100, lastId });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Немає токена / магазин ще не підключений — тихо пропускаємо
      return { ok: false, skipped: `Prom API недоступний: ${msg.slice(0, 200)}`, prom_total: 0, matched: 0, pushed: 0 };
    }
    if (!batch.length) break;
    for (const p of batch) {
      promProducts.push({ id: p.id, key: p.external_id ?? p.sku ?? null, quantity: Number(p.quantity ?? 0) });
    }
    lastId = batch[batch.length - 1].id;
    if (batch.length < 100) break;
  }

  if (!promProducts.length) {
    return { ok: true, skipped: 'У кабінеті Prom немає товарів', prom_total: 0, matched: 0, pushed: 0 };
  }

  // 2. Наші залишки по on_prom товарах
  type Row = { sku: string; stock: { quantity: number | null }[] | { quantity: number | null } | null };
  const ours = await fetchAllRows<Row>((f, t) => db
    .from('products')
    .select('sku, stock:product_stock(quantity)')
    .eq('is_active', true)
    .eq('on_prom', true)
    .range(f, t));

  const qtyBySku = new Map<string, number>();
  for (const r of ours) {
    const stock = Array.isArray(r.stock) ? r.stock[0] : r.stock;
    qtyBySku.set(r.sku, Math.max(0, Math.floor(Number(stock?.quantity ?? 0))));
  }

  // 3. Диф: пушимо лише те, що змінилось
  const updates: { id: number; quantity: number; presence: 'available' | 'not_available' }[] = [];
  let matched = 0;
  for (const p of promProducts) {
    if (!p.key || !qtyBySku.has(p.key)) continue;
    matched++;
    const qty = qtyBySku.get(p.key)!;
    if (qty !== p.quantity) {
      updates.push({ id: p.id, quantity: qty, presence: qty > 0 ? 'available' : 'not_available' });
    }
  }

  // 4. Надсилаємо чанками
  for (let i = 0; i < updates.length; i += 50) {
    await updatePromProducts(updates.slice(i, i + 50));
  }

  return { ok: true, prom_total: promProducts.length, matched, pushed: updates.length };
}

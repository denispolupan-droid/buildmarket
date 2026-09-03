/**
 * Активний пуш наявності у Prom.ua через API (products/edit).
 *
 * Фід (YML) Prom перечитує лише кілька разів на день — між читаннями є вікно,
 * коли товар вже проданий/зник у постачальника, а на Prom досі «в наявності»
 * (оверсейл). Цей модуль проштовхує актуальну наявність одразу після синку
 * постачальників і за кнопкою в адмінці.
 *
 * Правило наявності — спільне з фідом (lib/prom-ready-to-ship): presence,
 * прапорець «Готово до відправки» (in_stock) і залишок quantity_in_stock.
 * Залишок, як і фід (<stock_quantity>), шлемо ЛИШЕ коли він > 0: у ~700 товарів
 * статус in_stock при stock_qty = 0 (постачальники з умовним залишком), і
 * quantity_in_stock: 0 Prom може трактувати як порожній склад.
 *
 * Ідентифікація: наш SKU = external_id товару на Prom (так Prom імпортує
 * <offer id> з фіда); fallback — поле sku картки Prom.
 *
 * Історія: до 09.2026 модуль читав неіснуючу колонку product_stock.quantity
 * (PostgREST: column does not exist) і слав тіло {products: [...]}, на яке Prom
 * відповідає HTTP 200 «Ожидается список товаров» — пуш ніколи не спрацьовував.
 */
import { createServiceClient } from './supabase';
import { getPromProducts, updatePromProducts } from './prom-api';
import { fetchAllRows } from './db-paginate';
import { PROM_READY_TO_SHIP_KEY, promAvailability, readyToShipEnabled } from './prom-ready-to-ship';

export type PromStockPushResult = {
  ok: boolean;
  skipped?: string;
  ready_to_ship: boolean; // чи увімкнено «Готово до відправки»
  prom_total: number;     // скільки товарів у кабінеті Prom
  matched: number;        // скільки зіставлено з нашими SKU
  pushed: number;         // скільки оновлень надіслано (тільки зміни)
  errors: number;         // скільки карток Prom відхилив
  error_sample?: string;  // перші кілька помилок для журналу/дашборда
};

type PromRow = { id: number; key: string | null; presence: string | null; in_stock: boolean | null; qty: number };

export async function pushPromStock(): Promise<PromStockPushResult> {
  const db = createServiceClient();

  const { data: rtsRow } = await db.from('app_settings').select('value').eq('key', PROM_READY_TO_SHIP_KEY).maybeSingle();
  const readyToShip = readyToShipEnabled((rtsRow as { value?: string } | null)?.value);
  const base = { ready_to_ship: readyToShip, prom_total: 0, matched: 0, pushed: 0, errors: 0 };

  // 1. Всі товари кабінету Prom (пагінація за last_id)
  const promProducts: PromRow[] = [];
  let lastId: number | undefined;
  for (let page = 0; page < 100; page++) {
    let batch;
    try {
      batch = await getPromProducts({ limit: 100, lastId });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Немає токена / магазин ще не підключений — тихо пропускаємо
      return { ...base, ok: false, skipped: `Prom API недоступний: ${msg.slice(0, 200)}` };
    }
    if (!batch.length) break;
    for (const p of batch) {
      if (p.status === 'deleted') continue;   // видалені картки не редагуються
      promProducts.push({
        id: p.id,
        key: p.external_id ?? p.sku ?? null,
        presence: p.presence ?? null,
        in_stock: p.in_stock ?? null,
        qty: Number(p.quantity_in_stock ?? 0),
      });
    }
    lastId = batch[batch.length - 1].id;
    if (batch.length < 100) break;
  }

  if (!promProducts.length) {
    return { ...base, ok: true, skipped: 'У кабінеті Prom немає товарів' };
  }

  // 2. Наша наявність. Вимкнені для Prom товари (on_prom=false) теж беремо — їх
  //    треба тримати «немає в наявності», як робить фід.
  type StockRel = { stock_qty: number | null; stock_status: string | null };
  type Row = { sku: string; on_prom: boolean | null; stock: StockRel[] | StockRel | null };
  const ours = await fetchAllRows<Row>((f, t) => db
    .from('products')
    .select('sku, on_prom, stock:product_stock(stock_qty, stock_status)')
    .eq('is_active', true)
    .order('sku')
    .range(f, t));

  const bySku = new Map<string, ReturnType<typeof promAvailability>>();
  for (const r of ours) {
    const stock = Array.isArray(r.stock) ? r.stock[0] : r.stock;
    bySku.set(r.sku, promAvailability({
      enabled: r.on_prom === true,
      stockStatus: stock?.stock_status,
      stockQty: stock?.stock_qty,
      readyToShip,
    }));
  }

  // 3. Диф: пушимо лише те, що змінилось
  const updates: Parameters<typeof updatePromProducts>[0] = [];
  let matched = 0;
  for (const p of promProducts) {
    if (!p.key) continue;
    const want = bySku.get(p.key);
    if (!want) continue;
    matched++;
    // Залишок порівнюємо лише коли шлемо його (want > 0) — див. шапку файлу
    const sendQty = want.quantity_in_stock > 0;
    const same = want.presence === p.presence
      && want.in_stock === (p.in_stock ?? false)
      && (!sendQty || want.quantity_in_stock === p.qty);
    if (same) continue;
    updates.push({
      id: p.id,
      presence: want.presence,
      in_stock: want.in_stock,
      ...(sendQty ? { quantity_in_stock: want.quantity_in_stock } : {}),
    });
  }

  // 4. Надсилаємо чанками; помилки по окремих картках збираємо, а не зупиняємось
  let errors = 0;
  const samples: string[] = [];
  for (let i = 0; i < updates.length; i += 50) {
    const res = await updatePromProducts(updates.slice(i, i + 50));
    for (const [id, e] of Object.entries(res.errors)) {
      errors++;
      if (samples.length < 3) samples.push(`#${id}: ${typeof e === 'string' ? e : JSON.stringify(e)}`);
    }
  }

  return {
    ...base,
    ok: true,
    prom_total: promProducts.length,
    matched,
    pushed: updates.length - errors,
    errors,
    ...(samples.length ? { error_sample: samples.join('; ') } : {}),
  };
}

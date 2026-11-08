import { createServiceClient, asJson } from '../supabase-service';

/**
 * Єдиний модуль ЗАПИСУ рядків замовлення (етап C плану docs/ORDER-LINES-PLAN.md,
 * 08.11.2026). До цього 14 місць писали `orders.items` (jsonb) кожне по-своєму
 * і самі рахували total_price; тепер:
 *
 *  - нове замовлення: `newOrderLines(lines)` → `{ items, total_price }` для insert
 *    (jsonb лишається вхідною формою для створення, тригер-дзеркало будує рядки;
 *    BEFORE-тригер БД сам ставить total_price = Σ qty×price — сума від клієнта не
 *    потрапляє в базу навіть якщо хтось її передасть);
 *  - зміна позицій наявного замовлення: `setOrderLines(db, id, lines, patch?)` →
 *    SQL `order_set_lines`: рядки в order_lines, jsonb items перебудовується з
 *    рядків (кеш для старих читачів), total_price — тригером, усе однією
 *    транзакцією. Інші колонки того самого запису (discount_pct, price_type …)
 *    їдуть у patch.
 *
 * Правила на значення (раніше жили в кожному писарі окремо): рядок — об'єкт з
 * sku (рядок; порожній допустимий — вільна позиція, рішення власника 31.10),
 * qty > 0, price ≥ 0, обидва — числа (кома як десятковий роздільник теж). Ціна
 * округлюється до копійок. Решта ключів (name, brand, price_base, is_promo,
 * is_bonus, cost_price, volume, imageUrl …) зберігаються як є.
 */

export type OrderLineInput = {
  sku: string;
  qty: number;
  price: number;
  name?: string;
  brand?: string;
  price_base?: number | null;
  is_promo?: boolean;
  is_bonus?: boolean;
  [extra: string]: unknown;
};

export type NormalizedLines =
  | { ok: true; lines: OrderLineInput[]; total: number }
  | { ok: false; error: string };

const round2 = (n: number) => Math.round(n * 100) / 100;

function toNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  const n = Number(v.trim().replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** Перевірка й приведення рядків; підсумок — лише з рядків (копійки по кожному). */
export function normalizeLines(raw: unknown): NormalizedLines {
  if (!Array.isArray(raw) || raw.length === 0) return { ok: false, error: 'У замовленні має бути хоча б одна позиція' };
  const lines: OrderLineInput[] = [];
  for (const [i, item] of (raw as unknown[]).entries()) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return { ok: false, error: `Позиція ${i + 1}: не обʼєкт` };
    const o = item as Record<string, unknown>;
    const sku = String(o.sku ?? '').trim();
    const label = sku || `позиція ${i + 1}`;
    const qty = toNumber(o.qty);
    const price = toNumber(o.price);
    if (qty === null || qty <= 0) return { ok: false, error: `Кількість у рядку ${label} має бути більшою за нуль` };
    if (price === null || price < 0) return { ok: false, error: `Некоректна ціна у рядку ${label}` };
    const priceBase = o.price_base === undefined || o.price_base === null || o.price_base === '' ? undefined : toNumber(o.price_base);
    if (priceBase === null) return { ok: false, error: `Некоректна базова ціна у рядку ${label}` };
    const line: OrderLineInput = {
      ...o,
      sku,
      name: typeof o.name === 'string' ? o.name : String(o.name ?? ''),
      brand: typeof o.brand === 'string' ? o.brand : String(o.brand ?? ''),
      qty,
      price: round2(price),
      is_promo: o.is_promo === true,
      is_bonus: o.is_bonus === true,
    };
    // null/порожня базова ціна — ключа не буде зовсім (у дзеркалі price_base = NULL)
    if (priceBase === undefined) delete line.price_base; else line.price_base = round2(priceBase);
    lines.push(line);
  }
  return { ok: true, lines, total: linesTotal(lines) };
}

/** Σ qty × price з округленням до копійок по кожному рядку — та сама формула, що в БД (I10). */
export function linesTotal(lines: ReadonlyArray<{ qty: number; price: number }>): number {
  return round2(lines.reduce((s, l) => s + round2(Number(l.qty) * Number(l.price)), 0));
}

/** Поля для insert нового замовлення: позиції + підсумок із них. */
export function newOrderLines(lines: ReadonlyArray<OrderLineInput>) {
  return { items: asJson(lines), total_price: linesTotal(lines) };
}

type Db = ReturnType<typeof createServiceClient>;

/**
 * Замінити позиції наявного замовлення (+ інші колонки тим самим записом).
 * Повертає новий total_price, порахований базою з рядків.
 */
export async function setOrderLines(
  db: Db,
  orderId: string,
  lines: ReadonlyArray<OrderLineInput>,
  patch: Record<string, unknown> = {},
): Promise<number> {
  const norm = normalizeLines(lines);
  if (!norm.ok) throw new Error(`setOrderLines: ${norm.error}`);
  const { data, error } = await db.rpc('order_set_lines', { p_order_id: orderId, p_lines: asJson(norm.lines), p_patch: asJson(patch) });
  if (error) throw new Error(`setOrderLines: ${orderId}: ${error.message}`);
  return Number(data);
}

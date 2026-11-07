import { fetchAllRows } from '../db-paginate';
import { createServiceClient } from '../supabase-service';

/**
 * Читання позицій замовлення з таблиці order_lines (етап B плану
 * docs/ORDER-LINES-PLAN.md): звіти й аналітика беруть рядки звідси, а не з
 * jsonb orders.items. Таблицю веде тригер БД (етап A, міграція 136), I9 стежить,
 * що вона збігається з jsonb, тому форма рядка та сама, що й у items.
 *
 * Поки писарі (етап C) ще пишуть jsonb, цей модуль — єдине місце читання таблиці
 * в коді: якщо щось розійдеться, повернути читачів на items — один імпорт.
 */
type Db = ReturnType<typeof createServiceClient>;

export type OrderLine = {
  order_id: string;
  sku: string;
  name: string;
  brand: string;
  qty: number;
  price: number;
  amount: number;
  is_bonus: boolean;
  is_promo: boolean;
  product_id: number | null;
};

const CHUNK = 300; // .in() з сотнями uuid — у межах довжини URL PostgREST

/** Рядки для набору замовлень → Map<order_id, рядки у порядку sort_order>. */
export async function loadOrderLines(db: Db, orderIds: string[]): Promise<Map<string, OrderLine[]>> {
  const out = new Map<string, OrderLine[]>();
  const ids = [...new Set(orderIds)];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const rows = await fetchAllRows((f, t) => db
      .from('order_lines')
      .select('order_id, sort_order, sku, name, brand, qty, price, amount, is_bonus, is_promo, product_id')
      .in('order_id', chunk)
      .order('order_id').order('sort_order')
      .range(f, t));
    for (const r of rows) {
      const line: OrderLine = {
        order_id: r.order_id, sku: r.sku, name: r.name, brand: r.brand,
        qty: Number(r.qty), price: Number(r.price), amount: Number(r.amount ?? Number(r.qty) * Number(r.price)),
        is_bonus: !!r.is_bonus, is_promo: !!r.is_promo, product_id: r.product_id,
      };
      const arr = out.get(r.order_id);
      if (arr) arr.push(line); else out.set(r.order_id, [line]);
    }
  }
  return out;
}

/** Зручно для звітів: рядки замовлення або порожній масив. */
export const linesOf = (map: Map<string, OrderLine[]>, orderId: string): OrderLine[] => map.get(orderId) ?? [];

/**
 * Відкритий попит покупців по SKU: скільки замовлень у заданих статусах містять
 * SKU і скільки штук разом (закупівля: «Треба докупити», /procurement/demand).
 * Замовлення рахується раз на SKU, кількість — сума рядків.
 */
export async function loadDemandBySku(
  db: Db, skus: string[], statuses: string[],
): Promise<Map<string, { orders: number; qty: number }>> {
  const agg = new Map<string, { orders: Set<string>; qty: number }>();
  const uniq = [...new Set(skus)];
  for (let i = 0; i < uniq.length; i += CHUNK) {
    const part = uniq.slice(i, i + CHUNK);
    const rows = await fetchAllRows((f, t) => db
      .from('order_lines')
      .select('sku, qty, order_id, orders!inner(status)')
      .in('sku', part)
      .in('orders.status', statuses)
      .order('id')
      .range(f, t));
    for (const r of rows) {
      const a = agg.get(r.sku) ?? { orders: new Set<string>(), qty: 0 };
      a.orders.add(r.order_id);
      a.qty += Number(r.qty) || 0;
      agg.set(r.sku, a);
    }
  }
  return new Map([...agg].map(([sku, a]) => [sku, { orders: a.orders.size, qty: a.qty }]));
}

/**
 * Позиція у формі jsonb-елемента orders.items — для облікових читачів (резерв,
 * планування виконання, відгрузка), які досі очікують { sku, qty, price, name,
 * brand, cost_price?, … }. Допоміжні ключі (cost_price, volume, imageUrl …)
 * повертаються з meta, як і лежали в jsonb.
 */
export type OrderItem = Record<string, unknown> & {
  sku: string; name: string; brand: string; qty: number; price: number;
  price_base: number | null; is_promo: boolean; is_bonus: boolean; cost_price?: number;
};

export async function loadOrderItems(db: Db, orderId: string): Promise<OrderItem[]> {
  const rows = await fetchAllRows((f, t) => db
    .from('order_lines')
    .select('sort_order, sku, name, brand, qty, price, price_base, is_promo, is_bonus, meta')
    .eq('order_id', orderId)
    .order('sort_order')
    .range(f, t));
  return rows.map(r => ({
    ...((r.meta ?? {}) as Record<string, unknown>),
    sku: r.sku, name: r.name, brand: r.brand,
    qty: Number(r.qty), price: Number(r.price),
    price_base: r.price_base == null ? null : Number(r.price_base),
    is_promo: !!r.is_promo, is_bonus: !!r.is_bonus,
  }));
}

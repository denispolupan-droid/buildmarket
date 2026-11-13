/**
 * Фактичний постачальник і собівартість позиції З ВЛАСНОГО СКЛАДУ (13.11.2026).
 *
 * Блок «Прибуток по постачальниках» брав постачальника з прив'язки товару
 * (supplier_sku_map — «хто зазвичай возить»), а ціну — з product_stock. Для
 * товару, купленого на склад в іншого постачальника (2004-002: прив'язка ЗРХ,
 * партія з «Ринку» по 626 ₴), це неправда. Яку саме партію списано, база не
 * пише, але списання — строго FIFO за received_at (consume_stock_fifo), тож
 * його можна відтворити: прокрутити приходи (партії) і розходи (рухи < 0)
 * товару на складі в хронологічному порядку.
 *
 *  • відвантажене замовлення — частини з його власних розходів;
 *  • ще не відвантажене — наступні одиниці черги після всіх розходів
 *    (наближення: резерви інших замовлень не враховуються).
 */

import type { createServiceClient } from '../supabase-service';

export type FifoBatch = { id: string; supplier_id: number | null; cost_price: number; initial_qty: number; received_at: string; created_at: string };
export type FifoOut = { id: number; qty: number; order_id: string | null; moved_at: string };
export type SourcePart = { supplier_id: number | null; qty: number; unit_cost: number };

const EPS = 1e-9;

/** Додати частину, зливаючи з попередньою того самого постачальника й ціни. */
function push(parts: SourcePart[], p: SourcePart) {
  const last = parts.find(x => x.supplier_id === p.supplier_id && Math.abs(x.unit_cost - p.unit_cost) < 0.005);
  if (last) last.qty += p.qty; else parts.push({ ...p });
}

/**
 * Чиста частина. Повертає частини для orderId: з його розходів, а якщо їх
 * немає — з черги, що лишилась (wantQty одиниць).
 */
export function attributeFifo(batches: FifoBatch[], outs: FifoOut[], orderId: string, wantQty: number): SourcePart[] {
  const queue = batches.map(b => ({ ...b, left: Number(b.initial_qty) }));
  // Партія доступна розходу, лише якщо створена до нього
  const events = [
    ...queue.map(b => ({ t: b.created_at, kind: 'in' as const, b, o: null as FifoOut | null })),
    ...outs.map(o => ({ t: o.moved_at, kind: 'out' as const, b: null, o })),
  ].sort((a, b) => a.t.localeCompare(b.t) || (a.kind === b.kind ? 0 : a.kind === 'in' ? -1 : 1));

  const avail: typeof queue = [];
  const own: SourcePart[] = [];
  for (const e of events) {
    if (e.kind === 'in') {
      avail.push(e.b!);
      avail.sort((x, y) => x.received_at.localeCompare(y.received_at));
      continue;
    }
    let need = Math.abs(Number(e.o!.qty));
    for (const b of avail) {
      if (need <= EPS) break;
      if (b.left <= EPS) continue;
      const take = Math.min(need, b.left);
      b.left -= take; need -= take;
      if (e.o!.order_id === orderId) push(own, { supplier_id: b.supplier_id, qty: take, unit_cost: Number(b.cost_price) });
    }
  }
  if (own.length) return own;

  const preview: SourcePart[] = [];
  let need = wantQty;
  for (const b of avail) {
    if (need <= EPS) break;
    if (b.left <= EPS) continue;
    const take = Math.min(need, b.left);
    need -= take;
    push(preview, { supplier_id: b.supplier_id, qty: take, unit_cost: Number(b.cost_price) });
  }
  return preview;
}

/** Частини по SKU для позицій замовлення, що йдуть із власного складу. */
export async function loadOwnStockSources(
  db: ReturnType<typeof createServiceClient>,
  orderId: string,
  items: { sku: string; qty: number; warehouse_id: number }[],
): Promise<Map<string, SourcePart[]>> {
  const out = new Map<string, SourcePart[]>();
  for (const it of items) {
    if (!it.warehouse_id) continue;
    const [{ data: batches }, { data: moves }] = await Promise.all([
      db.from('stock_batches').select('id, supplier_id, cost_price, initial_qty, received_at, created_at')
        .eq('sku', it.sku).eq('warehouse_id', it.warehouse_id).order('received_at').limit(1000),
      db.from('stock_movements').select('id, qty, order_id, moved_at')
        .eq('sku', it.sku).eq('warehouse_id', it.warehouse_id).lt('qty', 0).order('id').limit(5000),
    ]);
    const parts = attributeFifo((batches ?? []) as FifoBatch[], (moves ?? []) as FifoOut[], orderId, Number(it.qty));
    if (parts.length) out.set(it.sku, parts);
  }
  return out;
}

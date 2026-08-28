// Звідки фактично їде кожна позиція замовлення: з нашого складу чи від постачальника.
//
// Питання здається простим, але відповідь лежить у двох різних місцях, і брати
// треба саме ту, що ближча до факту:
//
//   1. Рядки видаткової накладної. Це вже ухвалене рішення — за ним поїхав
//      (або поїде) товар, там же зафіксована собівартість і борг постачальнику.
//   2. Якщо РН ще немає — план роутера (resolveOrderFulfillment), тобто те,
//      як воно поїде, коли менеджер натисне «Відвантажити».
//
// НЕ можна брати orders.fulfillment_mode: це вибір менеджера при підтвердженні,
// і роутер його цілком може перерішити. Живий випадок 27.08 — замовлення
// #26081151: mode='supplier', а в РН одна позиція «own», бо товар знайшовся на
// своєму складі. Лист постачальнику через це пішов із зайвою позицією.

import type { createServiceClient } from '../supabase';
import { resolveOrderFulfillment } from '../accounting/fulfillment';
import { type ItemSource } from './fulfillment-mode';

export { modeFromSources, type ItemSource } from './fulfillment-mode';

type Db = ReturnType<typeof createServiceClient>;

/**
 * Джерела, які вже ВІДОМІ з фактів: рядки РН і активні резерви. Без плану —
 * тобто для позицій, доля яких ще не вирішена, ключа просто не буде.
 *
 * Саме це потрібно там, де план брехав би: для вже відвантаженого замовлення він
 * рахується від СЬОГОДНІШНІХ залишків, і позиція, яку ми списали зі складу
 * останньою, заднім числом виглядає як «від постачальника».
 */
export type KnownSource = {
  fulfillment_type: ItemSource;
  qty:              number;
  warehouse_id:     number | null;
  supplier_id:      number | null;
};

/**
 * Те саме, але з деталями рядка (склад, постачальник, кількість) — щоб картка
 * замовлення могла показати зафіксоване джерело, НЕ питаючи роутер заново.
 * Саме перерахунок плану на кожне відкриття створював враження, що система
 * щоразу вирішує наново, хоча рішення давно записане в накладній.
 */
export async function knownItemPlan(db: Db, orderId: string): Promise<Map<string, KnownSource>> {
  const out = new Map<string, KnownSource>();

  const { data: docs } = await db
    .from('acc_documents')
    .select('id')
    .eq('order_id', orderId)
    .eq('doc_type', 'sale')
    .neq('status', 'cancelled');

  const docIds = (docs ?? []).map(d => d.id as string);
  if (docIds.length) {
    const { data: lines } = await db
      .from('acc_document_lines')
      .select('sku, qty, fulfillment_type, warehouse_id, supplier_id')
      .in('document_id', docIds)
      .limit(1000);
    for (const l of lines ?? []) {
      const sku = l.sku as string;
      const type = (l.fulfillment_type === 'dropship' ? 'dropship' : 'own') as ItemSource;
      const prev = out.get(sku);
      // Часткові відвантаження: сумуємо кількість, а тип «дропшип» переважає.
      out.set(sku, {
        fulfillment_type: prev?.fulfillment_type === 'dropship' ? 'dropship' : type,
        qty:              (prev?.qty ?? 0) + Number(l.qty),
        warehouse_id:     (l.warehouse_id as number) ?? prev?.warehouse_id ?? null,
        supplier_id:      (l.supplier_id as number) ?? prev?.supplier_id ?? null,
      });
    }
  }

  // Активний резерв — теж уже прийняте рішення «беремо зі свого складу», і питати
  // про такі позиції роутера НЕ МОЖНА: власний резерв цього ж замовлення зменшує
  // qty_available, і позиція виглядає недоступною сама для себе — роутер відповів
  // би «дропшип» саме на те, що ми відклали собі.
  if (!out.size) {
    const { data: reserved } = await db
      .from('stock_reservations')
      .select('sku, qty, warehouse_id')
      .eq('order_id', orderId)
      .eq('reservation_status', 'active')
      .is('released_at', null);
    for (const r of reserved ?? []) {
      out.set(r.sku as string, {
        fulfillment_type: 'own',
        qty:              Number(r.qty),
        warehouse_id:     (r.warehouse_id as number) ?? null,
        supplier_id:      null,
      });
    }
  }

  return out;
}

export async function knownItemSources(db: Db, orderId: string): Promise<Map<string, ItemSource>> {
  const plan = await knownItemPlan(db, orderId);
  return new Map([...plan].map(([sku, src]) => [sku, src.fulfillment_type]));
}

export async function orderItemSources(
  db: Db,
  orderId: string,
  items: { sku: string; qty: number }[],
  channelCode?: string | null,
): Promise<Map<string, ItemSource>> {
  if (!items.length) return new Map();

  const out = await knownItemSources(db, orderId);

  // Те, чого в накладних ще немає (не відвантажене), питаємо в роутера
  const missing = items.filter(i => !out.has(i.sku));
  if (missing.length) {
    const plan = await resolveOrderFulfillment(
      missing.map(i => ({ sku: i.sku, qty: i.qty })),
      { channel_code: channelCode ?? 'website' },
    );
    for (const p of plan.items) out.set(p.sku, p.fulfillment_type);
    // Роутер не знайшов джерела взагалі — тоді це замовлення постачальнику
    // (саме так поводиться і сам роутер: фолбек на дропшип).
    for (const i of missing) if (!out.has(i.sku)) out.set(i.sku, 'dropship');
  }

  return out;
}

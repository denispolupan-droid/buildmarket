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

export async function orderItemSources(
  db: Db,
  orderId: string,
  items: { sku: string; qty: number }[],
  channelCode?: string | null,
): Promise<Map<string, ItemSource>> {
  const out = new Map<string, ItemSource>();
  if (!items.length) return out;

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
      .select('sku, fulfillment_type')
      .in('document_id', docIds)
      .limit(1000);
    for (const l of lines ?? []) {
      // Часткові відвантаження: та сама SKU може траплятись у кількох РН. Досить
      // одного дропшип-рядка, щоб позиція вважалась постачальниковою — саме її
      // він і має побачити в листі.
      const prev = out.get(l.sku as string);
      const cur = (l.fulfillment_type === 'dropship' ? 'dropship' : 'own') as ItemSource;
      out.set(l.sku as string, prev === 'dropship' ? 'dropship' : cur);
    }
  }

  // Активний резерв — це вже прийняте рішення «беремо зі свого складу», і питати
  // про такі позиції роутера НЕ МОЖНА: власний резерв цього ж замовлення
  // зменшує qty_available, і позиція виглядає недоступною сама для себе —
  // роутер відповів би «дропшип» саме на те, що ми відклали собі.
  if (!out.size) {
    const { data: reserved } = await db
      .from('stock_reservations')
      .select('sku')
      .eq('order_id', orderId)
      .eq('reservation_status', 'active')
      .is('released_at', null);
    for (const r of reserved ?? []) out.set(r.sku as string, 'own');
  }

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

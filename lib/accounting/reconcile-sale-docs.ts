/**
 * Звірка: чи не розійшлось замовлення з проведеною видатковою.
 *
 * Це страховка, яка нікому нічого не забороняє. Позиції замовлення можна
 * правити з кількох екранів; якщо правка приїхала після того, як РН уже
 * проведена, рядки документа лишаються старими — надрукований документ і
 * проводки живуть окремо. Знайти це «на очі» неможливо, тому шукаємо
 * автоматично і раз на добу показуємо список.
 *
 * Порівнюємо ТОВАРНУ частину (сума рядків), а не orders.total_price: у
 * підсумок замовлення можуть входити доставка й ручна знижка, яких у рядках
 * накладної немає — інакше звірка сипала б хибними спрацюваннями.
 *
 * Мультипосилки: по замовленню може бути кілька проведених РН, тож рахуємо
 * суму всіх — часткові відвантаження це нормальний випадок, і поки товар
 * розвезли не весь, «недостача» очікувана. Тому недовідвантаження (документи
 * на суму МЕНШУ за замовлення) не вважаємо розбіжністю самі по собі — на них
 * дивимось лише коли замовлення вже доставлене.
 */

import { createServiceClient } from '../supabase';
import { fetchAllRows } from '../db-paginate';

export type SaleDivergence = {
  orderId: string;
  orderNumber: number | null;
  status: string | null;
  docNumbers: string[];
  orderAmount: number;
  docAmount: number;
  diff: number;
};

const round2 = (n: number) => Math.round(n * 100) / 100;
/** Копійчана різниця — це округлення, а не розбіжність. */
const TOLERANCE = 0.05;

export async function findSaleDivergences(sinceDays = 120): Promise<SaleDivergence[]> {
  const db = createServiceClient();
  const since = new Date(Date.now() - sinceDays * 86_400_000).toISOString();

  const docs = await fetchAllRows<{ id: string; order_id: string | null; doc_number: string }>(
    (from, to) => db
      .from('acc_documents')
      .select('id, order_id, doc_number')
      .eq('doc_type', 'sale')
      .eq('status', 'confirmed')
      // Сторно дзеркалить свій скасований оригінал (рядки з мінусом) — порівнювати
      // його з позиціями замовлення безглуздо: хибний алерт по №26071005, 02.09.2026
      .is('reversal_of', null)
      .gte('doc_date', since)
      .range(from, to),
  );

  const withOrder = docs.filter(d => d.order_id);
  if (withOrder.length === 0) return [];

  const docIds = withOrder.map(d => d.id);
  const lines = await fetchAllRows<{ document_id: string; qty: number; price: number }>(
    (from, to) => db
      .from('acc_document_lines')
      .select('document_id, qty, price')
      .in('document_id', docIds)
      .range(from, to),
  );

  const byDoc = new Map<string, number>();
  for (const l of lines) {
    byDoc.set(l.document_id, round2((byDoc.get(l.document_id) ?? 0) + round2(Number(l.qty) * Number(l.price))));
  }

  const orderIds = [...new Set(withOrder.map(d => d.order_id!))];
  const orders = await fetchAllRows<{ id: string; order_number: number | null; status: string | null; items: unknown }>(
    (from, to) => db
      .from('orders')
      .select('id, order_number, status, items')
      .in('id', orderIds)
      .range(from, to),
  );
  const orderMap = new Map(orders.map(o => [o.id, o]));

  const agg = new Map<string, { docAmount: number; docNumbers: string[] }>();
  for (const d of withOrder) {
    const cur = agg.get(d.order_id!) ?? { docAmount: 0, docNumbers: [] };
    cur.docAmount = round2(cur.docAmount + (byDoc.get(d.id) ?? 0));
    cur.docNumbers.push(d.doc_number);
    agg.set(d.order_id!, cur);
  }

  const out: SaleDivergence[] = [];
  for (const [orderId, a] of agg) {
    const order = orderMap.get(orderId);
    if (!order) continue;
    const items = Array.isArray(order.items) ? order.items as { qty?: unknown; price?: unknown }[] : [];
    const orderAmount = round2(items.reduce(
      (s, i) => s + round2((Number(i?.qty) || 0) * (Number(i?.price) || 0)), 0));

    const diff = round2(a.docAmount - orderAmount);
    if (Math.abs(diff) <= TOLERANCE) continue;
    // Документів менше, ніж у замовленні — це ще може бути частина посилки,
    // яка поїде окремо. Скарга лише коли везти вже нічого.
    if (diff < 0 && order.status !== 'delivered' && order.status !== 'cancelled') continue;

    out.push({
      orderId,
      orderNumber: order.order_number ?? null,
      status: order.status ?? null,
      docNumbers: a.docNumbers,
      orderAmount,
      docAmount: a.docAmount,
      diff,
    });
  }

  return out.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
}

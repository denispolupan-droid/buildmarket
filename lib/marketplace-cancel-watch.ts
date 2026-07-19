/**
 * Детектор скасувань/повернень на маркетплейсах (хвіст Етапу 2 аудиту).
 *
 * Синки тягнуть лише «в обробці», тому замовлення, скасоване покупцем на
 * Rozetka/Prom ПІСЛЯ створення в нас, лишалось активним у нас назавжди
 * (а якщо було відвантажене — виручка/комісія висіли без сторно).
 *
 * Політика безпеки — авто-сторно грошей не робимо:
 *  - замовлення ще НЕ відвантажене (немає проведеної РН) → авто-скасовуємо
 *    у нас (зняття резерву + статус cancelled + історія) і повідомляємо;
 *  - замовлення ВЖЕ відвантажене → лише Telegram-алерт менеджеру: фізичне
 *    повернення товару треба прийняти і оформити кнопкою «↩ Повернення»
 *    в картці замовлення (це зробить сторно виручки/COGS/боргу коректно).
 */
import { createServiceClient } from './supabase';
import { getRozetkaOrders } from './rozetka-api';
import { getPromOrders } from './prom-api';
import { releaseReservation } from './accounting/reservations';
import { alertAdmin } from './alert';

const LOOKBACK_DAYS = 45;

type OurOrder = {
  id: string;
  order_number: number;
  status: string;
  rozetka_order_id: number | null;
  prom_order_id: number | null;
  status_history: { status: string; at: string; by: string }[] | null;
};

async function activeMarketplaceOrders(db: ReturnType<typeof createServiceClient>, channel: 'rozetka' | 'prom'): Promise<OurOrder[]> {
  const since = new Date(Date.now() - LOOKBACK_DAYS * 86400_000).toISOString();
  const { data } = await db
    .from('orders')
    .select('id, order_number, status, rozetka_order_id, prom_order_id, status_history')
    .eq('channel_code', channel)
    .not('status', 'in', '(cancelled,delivered)')
    .gte('created_at', since);
  return (data ?? []) as OurOrder[];
}

async function handleCancelledOrder(
  db: ReturnType<typeof createServiceClient>,
  order: OurOrder,
  marketplace: string,
): Promise<'auto_cancelled' | 'needs_return'> {
  const { data: saleDoc } = await db
    .from('acc_documents')
    .select('id, doc_number')
    .eq('order_id', order.id)
    .eq('doc_type', 'sale')
    .eq('status', 'confirmed')
    .maybeSingle();

  if (saleDoc) {
    // Відвантажено — фізичне повернення приймає людина
    alertAdmin(
      `${marketplace}: замовлення #${order.order_number} скасовано/повернуто покупцем, але воно ВЖЕ ВІДВАНТАЖЕНЕ (${saleDoc.doc_number})`,
      'Прийміть товар і оформіть «↩ Повернення» в картці замовлення — це коректно сторнує виручку, COGS і борг постачальнику.',
    );
    return 'needs_return';
  }

  // Не відвантажено — безпечно скасовуємо у нас (маркетплейс уже скасував у себе)
  const now = new Date().toISOString();
  const history = Array.isArray(order.status_history) ? order.status_history : [];
  await db.from('orders').update({
    status:         'cancelled',
    cancelled_at:   now,
    status_history: [...history, { status: 'cancelled', at: now, by: `cron:${marketplace.toLowerCase()}-cancel-watch` }],
  }).eq('id', order.id);

  try {
    await releaseReservation(order.id, 'cancelled');
  } catch { /* резерву могло не бути */ }

  alertAdmin(
    `${marketplace}: замовлення #${order.order_number} скасовано покупцем — автоматично скасовано і в нас`,
    'Товар не був відвантажений, облікових сторно не потрібно.',
  );
  return 'auto_cancelled';
}

export async function watchRozetkaCancellations(): Promise<{ checked: number; auto_cancelled: number; needs_return: number }> {
  const db = createServiceClient();
  const ours = await activeMarketplaceOrders(db, 'rozetka');
  const result = { checked: ours.length, auto_cancelled: 0, needs_return: 0 };
  if (!ours.length) return result;

  // Група 3 = скасовані/неуспішні на Rozetka
  const createdFrom = new Date(Date.now() - LOOKBACK_DAYS * 86400_000).toISOString().slice(0, 10);
  const cancelledIds = new Set<number>();
  for (let page = 1; page <= 5; page++) {
    const batch = await getRozetkaOrders({ createdFrom, statusGroup: 3, page });
    for (const o of batch) cancelledIds.add(o.id);
    if (batch.length < 50) break;
  }

  for (const order of ours) {
    if (!order.rozetka_order_id || !cancelledIds.has(Number(order.rozetka_order_id))) continue;
    const outcome = await handleCancelledOrder(db, order, 'Rozetka');
    result[outcome === 'auto_cancelled' ? 'auto_cancelled' : 'needs_return']++;
  }
  return result;
}

export async function watchPromCancellations(): Promise<{ checked: number; auto_cancelled: number; needs_return: number }> {
  const db = createServiceClient();
  const ours = await activeMarketplaceOrders(db, 'prom');
  const result = { checked: ours.length, auto_cancelled: 0, needs_return: 0 };
  if (!ours.length) return result;

  const dateFrom = new Date(Date.now() - LOOKBACK_DAYS * 86400_000).toISOString();
  const cancelledIds = new Set<number>();
  // Ті самі значення статусів, що фільтрує prom-sync при імпорті
  for (const status of ['declined', 'cancelled', 'cancelled_by_client'] as const) {
    try {
      const batch = await getPromOrders({ dateFrom, status, limit: 100 });
      for (const o of batch) cancelledIds.add(o.id);
    } catch { /* один зі статусів може не підтримуватись — не валимо весь прохід */ }
  }

  for (const order of ours) {
    if (!order.prom_order_id || !cancelledIds.has(Number(order.prom_order_id))) continue;
    const outcome = await handleCancelledOrder(db, order, 'Prom');
    result[outcome === 'auto_cancelled' ? 'auto_cancelled' : 'needs_return']++;
  }
  return result;
}

import { createServiceClient } from '../supabase-service';
import { setPromTTN } from '../prom-api';
import { getEpicentrOrder, setEpicentrOrderStatus, setEpicentrTTN } from '../epicentr-api';
import { getRozetkaOrderStatusInfo, ourStatusToRozetkaStatus, setRozetkaOrderStatusChained } from '../rozetka-api';
import type { HandlerResult, OutboxRow, PushTtnPayload } from './types';

type Db = ReturnType<typeof createServiceClient>;

/**
 * Обробники outbox. Кожен — ідемпотентний: його можуть викликати двічі (повтор
 * після таймауту, і в фазі 1 — паралельно з прямим пушем із /ship). Перед
 * викликом площадки обробник звіряє, що замовлення досі в тому стані, під який
 * писалась подія: інакше skipped, не помилка.
 */
export async function runOutboxHandler(db: Db, row: OutboxRow): Promise<HandlerResult> {
  switch (row.handler) {
    case 'mp.push_ttn': return pushTtn(db, row.aggregate_id, row.payload as PushTtnPayload);
    default: throw new Error(`outbox: невідомий обробник ${row.handler}`);
  }
}

const EPICENTR_AT_OR_PAST_SENT = new Set(['sent', 'received', 'delivered', 'completed', 'closed']);

async function pushTtn(db: Db, orderId: string, p: PushTtnPayload): Promise<HandlerResult> {
  const { data: order } = await db.from('orders').select('status, tracking_number').eq('id', orderId).maybeSingle();
  if (!order) return { ok: false, skipped: 'замовлення не знайдено' };
  if (order.status === 'cancelled') return { ok: false, skipped: 'замовлення скасовано' };
  if (order.tracking_number !== p.ttn) return { ok: false, skipped: `ЕН змінилась: ${order.tracking_number ?? '—'}` };

  switch (p.channel) {
    case 'prom': {
      // «Этот ЭН уже добавлен» setPromTTN вважає успіхом (PROM_TTN_ALREADY_SET)
      await setPromTTN(Number(p.external_id), p.ttn, p.delivery_type ?? 'nova_poshta');
      return { ok: true };
    }
    case 'epicentr': {
      const id = String(p.external_id);
      const live = await getEpicentrOrder(id);
      if (!live) return { ok: false, skipped: 'Епіцентр не знає такого замовлення' };
      if (EPICENTR_AT_OR_PAST_SENT.has(live.statusCode)) return { ok: true }; // уже відправлене — нічого пушити
      if (live.statusCode.startsWith('canceled') || live.statusCode.startsWith('closed')) return { ok: false, skipped: `Епіцентр: ${live.statusCode}` };
      await setEpicentrTTN(id, p.ttn);
      if (p.fully_shipped) await setEpicentrOrderStatus(id, 'sent');
      return { ok: true };
    }
    case 'rozetka': {
      const target = ourStatusToRozetkaStatus(p.status);
      if (!target) return { ok: false, skipped: `немає статусу Rozetka для ${p.status}` };
      let live: number | null = null;
      try { live = (await getRozetkaOrderStatusInfo(Number(p.external_id)))?.status ?? null; } catch { /* кабінет не відповів — підказка з payload */ }
      if (live === target) return { ok: true };
      await setRozetkaOrderStatusChained(Number(p.external_id), target, { ttn: p.ttn, currentStatus: live ?? p.cabinet_status });
      return { ok: true };
    }
    default:
      throw new Error(`outbox mp.push_ttn: невідомий канал ${String((p as { channel?: string }).channel)}`);
  }
}

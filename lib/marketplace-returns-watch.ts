/**
 * Вотчер заявок на повернення Rozetka (/order-refund/search).
 *
 * Покупець відкриває заявку в кабінеті Rozetka — без вотчера її видно лише
 * в кабінеті, і фізичне повернення легко пропустити (виручка/COGS лишаться
 * без сторно). Вотчер:
 *  - тягне заявки за останні 90 днів, upsert-ить у marketplace_refunds;
 *  - НОВА заявка → Telegram-алерт (+ причина, товар, ТТН зворотної доставки);
 *  - зміна статусу заявки → алерт;
 *  - ставить orders.mp_refund_status (банер/бейдж в адмінці);
 *  - гасить прапорець, щойно в нас проведено документ повернення (return_in).
 *
 * Грошових проводок вотчер НЕ робить — сторно виручки/COGS/комісії оформлює
 * людина кнопкою «↩ Повернення» в картці замовлення (та сама політика, що в
 * marketplace-cancel-watch). Prom окремого API заявок не має: повернення там
 * видно як скасування замовлення, їх ловить cancel-watch.
 */
import { createServiceClient } from './supabase';
import { getRozetkaRefunds } from './rozetka-api';
import { alertAdmin } from './alert';

const LOOKBACK_DAYS = 90;

export async function watchRozetkaRefunds(): Promise<{ checked: number; new_refunds: number; status_changed: number; flags_cleared: number }> {
  const db = createServiceClient();
  const result = { checked: 0, new_refunds: 0, status_changed: 0, flags_cleared: 0 };

  const dateFrom = new Date(Date.now() - LOOKBACK_DAYS * 86400_000).toISOString().slice(0, 10);
  const refunds = await getRozetkaRefunds({ dateFrom });
  result.checked = refunds.length;

  if (refunds.length) {
    const { data: known } = await db
      .from('marketplace_refunds')
      .select('refund_id, status_title')
      .eq('marketplace', 'rozetka')
      .in('refund_id', refunds.map(r => String(r.id)))
      .limit(refunds.length);
    const knownMap = new Map((known ?? []).map(k => [k.refund_id as string, k]));

    const rzOrderIds = [...new Set(refunds.map(r => Number(r.order_id)).filter(Boolean))];
    const { data: orders } = rzOrderIds.length
      ? await db.from('orders')
          .select('id, order_number, rozetka_order_id')
          .in('rozetka_order_id', rzOrderIds)
          .limit(rzOrderIds.length)
      : { data: [] as never[] };
    const orderByRz = new Map((orders ?? []).map(o => [Number(o.rozetka_order_id), o]));

    for (const r of refunds) {
      const prev = knownMap.get(String(r.id));
      const our = orderByRz.get(Number(r.order_id));
      const orderLabel = our ? `#${our.order_number}` : `rz ${r.order_id}`;

      await db.from('marketplace_refunds').upsert({
        marketplace:  'rozetka',
        refund_id:    String(r.id),
        mp_order_id:  r.order_id ?? null,
        order_id:     our?.id ?? null,
        status_code:  r.status_code != null ? String(r.status_code) : null,
        status_title: r.status_title ?? null,
        reason_title: r.reason_title ?? null,
        item_name:    r.item_name ?? null,
        ttn:          r.ttn ?? null,
        opened_at:    r.datetime ? new Date(r.datetime.replace(' ', 'T') + 'Z').toISOString() : null,
        raw:          r as unknown as Record<string, unknown>,
        updated_at:   new Date().toISOString(),
      }, { onConflict: 'marketplace,refund_id' });

      if (!prev) {
        result.new_refunds++;
        alertAdmin(
          `Rozetka: покупець відкрив ПОВЕРНЕННЯ по замовленню ${orderLabel}`,
          [
            r.reason_title && `Причина: ${r.reason_title}`,
            r.item_name && `Товар: ${r.item_name}`,
            r.ttn && `ТТН зворотної доставки: ${r.ttn}`,
            r.status_title && `Статус заявки: ${r.status_title}`,
            'Прийміть товар і оформіть «↩ Повернення» в картці замовлення — це сторнує виручку, COGS і комісію.',
          ].filter(Boolean).join('\n'),
        );
      } else if ((prev.status_title ?? '') !== (r.status_title ?? '')) {
        result.status_changed++;
        alertAdmin(
          `Rozetka: повернення по ${orderLabel} — новий статус`,
          `${prev.status_title ?? '—'} → ${r.status_title ?? '—'}${r.ttn ? `\nТТН: ${r.ttn}` : ''}`,
        );
      }

      if (our) {
        await db.from('orders')
          .update({ mp_refund_status: r.status_title ?? 'Повернення' })
          .eq('id', our.id);
      }
    }
  }

  // Гасимо прапорець на замовленнях, де повернення вже оформлене в нас
  // (проведений return_in) — банер своє відпрацював.
  const { data: flagged } = await db
    .from('orders')
    .select('id')
    .eq('channel_code', 'rozetka')
    .not('mp_refund_status', 'is', null)
    .limit(500);
  const flaggedIds = (flagged ?? []).map(o => o.id);
  if (flaggedIds.length) {
    const { data: returnDocs } = await db
      .from('acc_documents')
      .select('order_id')
      .in('order_id', flaggedIds)
      .eq('doc_type', 'return_in')
      .eq('status', 'confirmed')
      .limit(flaggedIds.length);
    const doneIds = [...new Set((returnDocs ?? []).map(d => d.order_id).filter(Boolean))];
    if (doneIds.length) {
      await db.from('orders').update({ mp_refund_status: null }).in('id', doneIds);
      result.flags_cleared = doneIds.length;
    }
  }

  return result;
}

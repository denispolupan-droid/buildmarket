import { getPromOrders, getPromOrder, promOrderToOurFormat, buildPromComment, ourStatusToPromStatus, setPromOrderStatus, setPromTTN, promAcceptsTtnFor, needsPromTtnRepush, type PromStatus, type PromOrder } from './prom-api';
import { importMarketplaceOrder } from './marketplace/import-order';
import { promAdapter, getPromCommissionSettings } from './marketplace/prom';
import { completeOrderDelivery, allOrderSalesPosted } from './accounting/completion';
import { transitionOrder } from './orders/status';
import { promDeliveryPatch, isPromLedDelivery } from './prom-delivery-state';
import { createServiceClient, type TableUpdate, asJson } from './supabase-service';

const db = createServiceClient();

// Самолікування пушів статусів (дзеркало rozetka-sync): пуш при підтвердженні —
// fire-and-forget, а до 2026-07-27 він ще й був мовчазним no-op (невалідне значення
// 'accepted' + помилка в тілі HTTP 200) — замовлення висіли в кабінеті Prom «Новими».
// Ключ — цільовий статус Prom, значення — живі статуси, з яких допушуємо.
const REPUSH_FROM: Record<PromStatus, string[]> = {
  received:  ['pending', 'paid'],
  delivered: ['pending', 'paid', 'received'],
  canceled:  ['pending', 'paid', 'received'],
};

// Колонки нашого замовлення, потрібні і в основному циклі, і в другому проході
const SYNCED_COLS = 'id, order_number, status, payment_confirmed, total_price, comment, prom_data, tracking_number, delivery_type, carrier_delivered_at, carrier_accepted_at, carrier_status_text, prom_order_id';

type SyncedOrder = {
  id: string; order_number: number; status: string; payment_confirmed: boolean; total_price: number;
  comment: string | null; prom_data: unknown; tracking_number: string | null; delivery_type: string | null;
  carrier_delivered_at: string | null; carrier_accepted_at: string | null; carrier_status_text: string | null;
  prom_order_id: number | null;
};

/**
 * Рух посилки за даними Prom. Prom трекає свою декларацію сам (unified_status:
 * on_the_way → in_warehouse → delivered) — для «Магазинів Rozetka» (PRM-…, Meest
 * за договором Prom) це ЄДИНЕ джерело, наші крони той номер не бачать. Для НП
 * це резерв: крон НП зробить те саме і перезапише carrier_delivered_at точним
 * часом вручення. Проводки ідемпотентні; «доставлено» — лише коли всі РН
 * проведені (як у крона доставки). Проміжні стани дають «прийнято перевізником»
 * і текст статусу — без них замовлення висіло «До відправки» до самого вручення.
 */
async function applyPromDeliveryState(existing: SyncedOrder, promOrder: PromOrder): Promise<{ accepted: boolean; delivered: boolean }> {
  const now = new Date().toISOString();
  const { patch, accepted, delivered } = promDeliveryPatch(existing, promOrder.delivery_provider_data, now);
  if (delivered && !existing.carrier_delivered_at) patch.carrier_delivered_at = now;
  if (Object.keys(patch).length) {
    const { error } = await db.from('orders').update(patch as TableUpdate<'orders'>).eq('id', existing.id);
    if (error) {
      console.error('[prom-sync] delivery state update failed:', existing.order_number, error.message);
      return { accepted: false, delivered: false };
    }
    if (accepted) console.log(`[prom-sync] carrier accepted by Prom status: #${existing.order_number} (${existing.tracking_number ?? promOrder.delivery_provider_data?.declaration_number ?? '—'})`);
  }
  if (!delivered) return { accepted, delivered: false };

  const actor = 'cron:prom-sync';
  try {
    await completeOrderDelivery(existing.id, actor);
    if (await allOrderSalesPosted(existing.id)) {
      await transitionOrder(db, existing.id, 'delivered', actor, 'prom-sync');
      existing.status = 'delivered';
      console.log(`[prom-sync] delivered by Prom status: #${existing.order_number} (${existing.tracking_number ?? '—'})`);
      return { accepted, delivered: true };
    }
  } catch (err) {
    console.error('[prom-sync] delivery by Prom status failed:', existing.order_number, err);
  }
  return { accepted, delivered: false };
}

export async function syncPromOrders() {
  if (!process.env.PROM_API_TOKEN) {
    return { ok: false, error: 'PROM_API_TOKEN not set' };
  }

  // Pull orders from the last 48 hours — covers any gaps between cron runs.
  // Порожній список — не привід виходити: другий прохід нижче працює по НАШИХ
  // відвантажених замовленнях, яких у цьому вікні вже немає.
  const dateFrom = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const orders   = await getPromOrders({ dateFrom, limit: 100 });

  // Налаштування комісії — раз на прогін; адаптер несе їх у знімок _commission
  const adapter = promAdapter(await getPromCommissionSettings(db));

  let created = 0;
  let skipped = 0;
  let repushed = 0;
  let ttnRepushed = 0;
  let deliveredFromProm = 0;
  let carrierAccepted = 0;


  let paidUpdated = 0;

  for (const promOrder of orders) {
    const { data: existing } = await db
      .from('orders')
      .select(SYNCED_COLS)
      .eq('prom_order_id', promOrder.id)
      .maybeSingle<SyncedOrder>();

    if (existing) {
      // Пізня оплата. «Пром-оплата» (evopay) в API з'являється зі status=unpaid —
      // покупець платить уже ПІСЛЯ створення замовлення, а наш знімок prom_data
      // застигав на моменті імпорту, і замовлення назавжди висіло «Очікує оплату».
      // Тому в кожному прогоні звіряємо живий payment_data і допроводимо оплату.
      if (!existing.payment_confirmed && promOrder.payment_data?.status === 'paid') {
        const { error: payErr } = await db.from('orders').update({
          payment_confirmed: true,
          amount_paid:       existing.total_price,
          payment_type:      'prepaid',
          prom_data: { ...(existing.prom_data as Record<string, unknown> ?? {}), payment_data: promOrder.payment_data },
        }).eq('id', existing.id);
        if (payErr) {
          console.error('[prom-sync] late payment update failed:', promOrder.id, payErr.message);
        } else {
          paidUpdated++;
          console.log(`[prom-sync] late payment confirmed for order ${promOrder.id}`);
        }
      }

      // Бекфіл коментаря покупця: до фікса client_notes не мапився взагалі,
      // тож у вже імпортованих замовлень comment порожній. Свій текст менеджера
      // не перетираємо — дописуємо лише в порожнє поле.
      if (!existing.comment) {
        const promComment = buildPromComment(promOrder);
        if (promComment) {
          const { error: cErr } = await db.from('orders').update({ comment: promComment }).eq('id', existing.id);
          if (cErr) console.error('[prom-sync] comment backfill failed:', promOrder.id, cErr.message);
        }
      }

      // Рух посилки за даними Prom (див. applyPromDeliveryState)
      const delivery = await applyPromDeliveryState(existing, promOrder);
      if (delivery.accepted) carrierAccepted++;
      if (delivery.delivered) deliveredFromProm++;

      const desired = ourStatusToPromStatus(existing.status);
      if (desired && REPUSH_FROM[desired].includes(promOrder.status)) {
        try {
          await setPromOrderStatus(promOrder.id, desired);
          repushed++;
          console.log(`[prom-sync] re-pushed status ${desired} for order ${promOrder.id} (was ${promOrder.status})`);
        } catch (err) {
          console.error('[prom-sync] status re-push failed:', promOrder.id, err);
        }
      }

      // Допуш ЕН — дзеркало допушу статусів. Пуш при відвантаженні — fire-and-forget
      // і без повтору, а з'єднання з my.prom.ua періодично рветься (ETIMEDOUT):
      // 3 з 19 накладних за 1–7.09.2026 так і не дійшли до кабінету. Тут звіряємо
      // наш номер із тим, що бачить Prom, і досилаємо. Лише для типів, які
      // save_declaration_id приймає; «Магазини Rozetka» Prom веде сам (PRM-…).
      const ourTtn = existing.tracking_number as string | null;
      if (['shipped', 'delivered'].includes(existing.status) && ourTtn
          && promAcceptsTtnFor(existing.delivery_type as string | null)
          && needsPromTtnRepush(ourTtn, promOrder.delivery_provider_data?.declaration_number)) {
        try {
          await setPromTTN(promOrder.id, ourTtn, (existing.delivery_type as string | null) ?? 'nova_poshta');
          ttnRepushed++;
          console.log(`[prom-sync] re-pushed TTN ${ourTtn} for order ${promOrder.id}`);
        } catch (err) {
          console.error('[prom-sync] TTN re-push failed:', promOrder.id, err);
        }
      }
      skipped++;
      continue;
    }

    // Новий — спільний імпорт (клієнт за телефоном, знімок _commission, вставка)
    const res = await importMarketplaceOrder(db, adapter, promOrder);
    if (res.status === 'created') created++;
    else if (res.status === 'skipped' || res.status === 'exists') skipped++;
  }

  // ── Другий прохід: відвантажені замовлення, які веде сам Prom, поза вікном ──
  // /orders/list фільтрує за датою СТВОРЕННЯ, а посилка їде днями: замовлення
  // від 24.09 (#26091224, Meest) список уже не віддавав, і навіть «вручено» по
  // ньому ніколи б не спрацювало. Тягнемо адресно — таких одиниці, і лише ті,
  // чий рух наші крони не бачать (isPromLedDelivery).
  const seenPromIds = new Set(orders.map(o => Number(o.id)));
  let staleChecked = 0;
  const { data: shippedProm, error: shippedErr } = await db
    .from('orders')
    .select(SYNCED_COLS)
    .eq('status', 'shipped')
    .not('prom_order_id', 'is', null)
    .order('id')
    .limit(200)
    .returns<SyncedOrder[]>();
  if (shippedErr) console.error('[prom-sync] stale shipped pull failed:', shippedErr.message);
  for (const o of shippedProm ?? []) {
    if (!o.prom_order_id || seenPromIds.has(Number(o.prom_order_id)) || !isPromLedDelivery(o)) continue;
    let promOrder: PromOrder | null = null;
    try {
      promOrder = await getPromOrder(Number(o.prom_order_id));
    } catch (err) {
      console.error('[prom-sync] stale order fetch failed:', o.order_number, err);
      continue;
    }
    if (!promOrder) continue;
    staleChecked++;
    const delivery = await applyPromDeliveryState(o, promOrder);
    if (delivery.accepted) carrierAccepted++;
    if (delivery.delivered) deliveredFromProm++;
  }

  return { ok: true, created, skipped, repushed, ttnRepushed, deliveredFromProm, carrierAccepted, staleChecked, paidUpdated, total: orders.length };
}

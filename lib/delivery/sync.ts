import { createServiceClient, type TableUpdate } from '../supabase-service';
import { fetchAllRows } from '../db-paginate';
import { completeShipmentByTtn, saleDocCounts, settleLegacyCommission } from '../accounting/completion';
import { recordTxn } from '../accounting/money';
import { alertAdmin } from '../alert';
import { log } from '../log';
import { transitionOrder } from '../orders/status';
import { customerNotifyEvents } from '../outbox/enqueue';
import { notifyParcelEvent } from '../notify/parcel';
import { ROZETKA_DELIVERY_TYPE } from '../rozetka-delivery';
import { DELIVERY_PROVIDERS, providerFor } from './registry';
import type { DeliveryProvider, ParcelUpdate, TrackedOrder } from './types';

/**
 * Синхронізація руху посилок — один конвеєр для всіх перевізників
 * (DeliveryProvider, аудит 31.10 п. 17; до 08.11.2026 три копії гілок у
 * lib/delivery-sync.ts: НП, точки видачі Rozetka, ROZETKA Доставка).
 *
 * Крок конвеєра для кожного замовлення з відповіддю перевізника:
 *  1) текст статусу й колонки перевізника — для всіх, включно зі скасованими
 *     (посилка їде назад, менеджеру треба бачити, де вона);
 *  2) «прийнято перевізником» (carrier_accepted_at один раз) → сповіщення
 *     «поїхала» і гак провайдера (Rozetka: статус 3);
 *  3) «прибула» → сповіщення покупцю (дедуп у customer_notifications);
 *  4) «вручено» (не для скасованих): РН посилки проводиться за ЕН (Варіант 3),
 *     витрати продавця від перевізника, і лише коли всі РН замовлення проведені —
 *     «Доставлено» з подіями outbox покупцю (Telegram + email).
 * Живе в lib: викликається з крона й з кнопки адмінки.
 */
const serviceClient = createServiceClient();

export type DeliverySyncResult = { updated: number; accepted: number; checked: number; np: number; rozetka: number; rzOwn: number };

/** Прапорець у orders.flags: про відсутність видаткової вже сповіщено. */
export const SALE_DOC_MISSING_FLAG = 'sale_doc_missing';

const ORDER_COLS = 'id, status, tracking_number, carrier_accepted_at, channel_code, partner_code, rozetka_order_id, delivery_type, telegram_chat_id, order_number, flags, phone, email, contact, company, total_price, rz_payment_fee, rz_delivery_cost, rz_delivery_payer';

/**
 * Чи можна ставити «Доставлено»: усі РН замовлення проведені. Видаткової немає
 * ВЗАГАЛІ — «Відправлено» поставили селектом, минаючи відгрузку (#26091195):
 * сповіщаємо один раз і ставимо прапорець; після полагодження прапорець знімаємо.
 */
async function salesPostedOrAlert(o: TrackedOrder): Promise<boolean> {
  const { confirmed, draft } = await saleDocCounts(o.id);
  const flags = Array.isArray(o.flags) ? (o.flags as string[]) : [];
  if (draft === 0 && confirmed > 0) {
    if (flags.includes(SALE_DOC_MISSING_FLAG)) {
      const next = flags.filter(f => f !== SALE_DOC_MISSING_FLAG);
      await serviceClient.from('orders').update({ flags: next }).eq('id', o.id);
      o.flags = next;
    }
    return true;
  }
  if (confirmed === 0 && draft === 0 && !flags.includes(SALE_DOC_MISSING_FLAG)) {
    alertAdmin(
      `Посилка вручена, а видаткової по #${o.order_number} немає — замовлення лишається «Відвантажено»`,
      'Схоже, статус «Відправлено» поставили вручну, минаючи відгрузку, і РН не створилась. '
      + 'Полагодити: npx tsx --env-file=.env.local scripts/repair-delivered-without-sale.mts '
      + `--order=${o.order_number} --apply`,
    );
    const next = [...flags, SALE_DOC_MISSING_FLAG];
    await serviceClient.from('orders').update({ flags: next }).eq('id', o.id);
    o.flags = next;
  }
  return false;
}

/** «Доставлено» + сповіщення покупцю подіями outbox (Telegram, email) — одним записом. */
async function markDelivered(o: TrackedOrder, actor: string): Promise<boolean> {
  try {
    const events = customerNotifyEvents(o.id, {
      order_number: o.order_number, tracking_number: o.tracking_number, delivery_type: o.delivery_type,
      telegram_chat_id: o.telegram_chat_id, email: o.email, phone: o.phone, contact: o.contact, company: o.company,
      channel_code: o.channel_code, total_price: o.total_price,
    }, 'delivered', ['telegram', 'email']);
    await transitionOrder(serviceClient, o.id, 'delivered', actor, 'delivery-sync', {}, events);
    return true;
  } catch (err) {
    log.error('delivery.delivered_transition_failed', { order: o.id, err: err instanceof Error ? err.message : String(err) });
    return false;
  }
}

async function applyUpdate(provider: DeliveryProvider, o: TrackedOrder, u: ParcelUpdate, actor: string, counters: { updated: number; accepted: number }): Promise<void> {
  const now = new Date().toISOString();
  // 1) Текст і колонки перевізника — для всіх
  const patch: Record<string, unknown> = { carrier_status_synced_at: now, ...(u.patch ?? {}) };
  if (u.statusText) patch.carrier_status_text = u.statusText;
  if (u.deliveredAt) patch.carrier_delivered_at = u.deliveredAt;
  const justAccepted = u.carrierAccepted && !o.carrier_accepted_at;
  if (justAccepted) patch.carrier_accepted_at = now;
  const { error } = await serviceClient.from('orders').update(patch as TableUpdate<'orders'>).eq('id', o.id);
  if (error) log.error('delivery.patch_failed', { order: o.id, err: error.message });

  // Скасовані відстежуємо ТІЛЬКИ заради тексту: жодних проводок, сповіщень і «Доставлено»
  if (o.status === 'cancelled') return;

  // 2) Перевізник прийняв. Якщо посилку вперше бачимо вже врученою (самовивіз у той
  //    самий день між двома прогонами крона) — «поїхала» покупцю не шлемо і статус
  //    «відправлено» в кабінет не підказуємо: далі піде «доставлено» (ревю 08.11)
  if (justAccepted) {
    counters.accepted++;
    if (u.phase !== 'delivered') {
      if (provider.notifiesParcelEvents) {
        notifyParcelEvent(o, 'shipped').catch((err: unknown) => log.warn('delivery.notify_shipped_failed', { order: o.id, err: String(err) }));
      }
      if (u.onAccepted) await u.onAccepted();
    }
  }
  // 3) Прибула — момент, коли покупцю справді є що сказати (дедуп у notifyParcelEvent)
  if (u.phase === 'arrived' && provider.notifiesParcelEvents) {
    notifyParcelEvent(o, 'arrived').catch((err: unknown) => log.warn('delivery.notify_arrived_failed', { order: o.id, err: String(err) }));
  }
  if (u.phase !== 'delivered' || !o.tracking_number) return;

  // 4) Вручено: Варіант 3 — спершу проводимо РН посилки за її ЕН (ідемпотентно)
  try {
    await completeShipmentByTtn(o.tracking_number, actor);
    await settleLegacyCommission(o.id, actor);
  } catch (err) {
    log.error('delivery.complete_failed', { order: o.id, provider: provider.code, err: err instanceof Error ? err.message : String(err) });
    return;
  }
  for (const e of u.expenses ?? []) {
    try {
      await recordTxn({
        debitAccount: 'logistics', creditAccount: 'supplier', creditParty: e.creditParty,
        amount: e.amount, docType: e.docType, orderId: o.id, description: e.description,
        idempotencyKey: e.idempotencyKey, createdBy: actor,
      });
    } catch (err) {
      log.error('delivery.expense_failed', { order: o.id, key: e.idempotencyKey, err: err instanceof Error ? err.message : String(err) });
    }
  }
  // «Доставлено» лише коли ВСІ РН замовлення проведені (мультипосилка)
  if (!(await salesPostedOrAlert(o))) return;
  if (await markDelivered(o, actor)) counters.updated++;
}

/**
 * opts.providers — підміна реєстру (інтеграційний тест конвеєра з фіктивним
 * перевізником: без мережі, але з живою базою, РН і outbox).
 */
export async function syncDeliveryStatuses(actor: string, opts: { providers?: readonly DeliveryProvider[] } = {}): Promise<DeliverySyncResult> {
  const providers = opts.providers ?? DELIVERY_PROVIDERS;
  // Відвантажені + скасовані, чию посилку перевізник уже прийняв (їде назад) +
  // скасовані відправлення в точки видачі Rozetka без carrier_accepted_at за 60 днів
  // (#26071055: заявка на повернення не потрапляла ні під одну умову).
  const returnWindow = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  // Посторінково з ORDER BY id: без цього PostgREST віддає перші 1000 у довільному
  // порядку, і замовлення за межею мовчки не синкаються (на тестовій базі так і було)
  const orders = (await fetchAllRows((f, t) => serviceClient
    .from('orders')
    .select(ORDER_COLS)
    .or([
      'status.eq.shipped',
      'and(status.eq.cancelled,carrier_accepted_at.not.is.null)',
      `and(status.eq.cancelled,delivery_type.eq.${ROZETKA_DELIVERY_TYPE},created_at.gte.${returnWindow})`,
    ].join(','))
    .not('tracking_number', 'is', null)
    .order('id')
    .range(f, t))) as unknown as TrackedOrder[];
  const empty: DeliverySyncResult = { updated: 0, accepted: 0, checked: 0, np: 0, rozetka: 0, rzOwn: 0 };
  if (!orders.length) return empty;

  // Групуємо за провайдером: кожен перевізник бачить лише свої замовлення
  const byProvider = new Map<DeliveryProvider, TrackedOrder[]>();
  for (const o of orders) {
    const p = opts.providers ? (providers.find(x => x.handles(o.delivery_type)) ?? null) : providerFor(o.delivery_type);
    if (!p) continue;
    byProvider.set(p, [...(byProvider.get(p) ?? []), o]);
  }

  const counters = { updated: 0, accepted: 0 };
  const sizes: Record<string, number> = {};
  for (const provider of providers) {
    const list = byProvider.get(provider) ?? [];
    sizes[provider.code] = list.length;
    if (!list.length) continue;
    let updates: Map<string, ParcelUpdate>;
    try {
      updates = await provider.track(list, { actor });
    } catch (err) {
      log.error('delivery.track_failed', { provider: provider.code, err: err instanceof Error ? err.message : String(err) });
      continue;
    }
    for (const o of list) {
      const u = updates.get(o.id);
      if (!u) continue;
      try {
        await applyUpdate(provider, o, u, actor, counters);
      } catch (err) {
        // Збій по одному замовленню не зриває решту
        log.error('delivery.apply_failed', { order: o.id, provider: provider.code, err: err instanceof Error ? err.message : String(err) });
      }
    }
  }

  return {
    updated: counters.updated, accepted: counters.accepted, checked: orders.length,
    np: sizes.np ?? 0, rozetka: sizes.rozetka ?? 0, rzOwn: sizes.rzOwn ?? 0,
  };
}

import { createClient } from '@supabase/supabase-js';
import { getPromOrders, promOrderToOurFormat, buildPromComment, ourStatusToPromStatus, setPromOrderStatus, setPromTTN, promAcceptsTtnFor, needsPromTtnRepush, type PromStatus } from './prom-api';
import { computePromCommission } from './prom-commission';
import { completeOrderDelivery, allOrderSalesPosted } from './accounting/completion';

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// Самолікування пушів статусів (дзеркало rozetka-sync): пуш при підтвердженні —
// fire-and-forget, а до 2026-07-27 він ще й був мовчазним no-op (невалідне значення
// 'accepted' + помилка в тілі HTTP 200) — замовлення висіли в кабінеті Prom «Новими».
// Ключ — цільовий статус Prom, значення — живі статуси, з яких допушуємо.
const REPUSH_FROM: Record<PromStatus, string[]> = {
  received:  ['pending', 'paid'],
  delivered: ['pending', 'paid', 'received'],
  canceled:  ['pending', 'paid', 'received'],
};

export async function syncPromOrders() {
  if (!process.env.PROM_API_TOKEN) {
    return { ok: false, error: 'PROM_API_TOKEN not set' };
  }

  // Pull orders from the last 48 hours — covers any gaps between cron runs
  const dateFrom = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const orders   = await getPromOrders({ dateFrom, limit: 100 });

  if (!orders.length) return { ok: true, created: 0, skipped: 0, repushed: 0, ttnRepushed: 0, deliveredFromProm: 0, paidUpdated: 0 };

  // Read plan setting once for all orders in this batch
  const { data: planRow } = await db.from('app_settings').select('value').eq('key', 'prom_plan').maybeSingle();
  const { data: fallbackRow } = await db.from('app_settings').select('value').eq('key', 'prom_commission_pct').maybeSingle();
  const plan        = (planRow?.value ?? 'single') as 'single' | 'econom';
  const fallbackPct = parseFloat(fallbackRow?.value ?? '3');

  let created = 0;
  let skipped = 0;
  let repushed = 0;
  let ttnRepushed = 0;
  let deliveredFromProm = 0;


  let paidUpdated = 0;

  for (const promOrder of orders) {
    const { data: existing } = await db
      .from('orders')
      .select('id, order_number, status, payment_confirmed, total_price, comment, prom_data, tracking_number, delivery_type, carrier_delivered_at')
      .eq('prom_order_id', promOrder.id)
      .maybeSingle();

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

      // Вручення за даними Prom. Prom трекає свою декларацію сам (unified_status:
      // on_the_way → in_warehouse → delivered) — для «Магазинів Rozetka» (PRM-…, Meest
      // за договором Prom) це ЄДИНЕ джерело, наші крони той номер не бачать. Для НП
      // це резерв: крон НП зробить те саме і перезапише carrier_delivered_at точним
      // часом вручення. Проводки ідемпотентні; «доставлено» — лише коли всі РН
      // проведені (як у крона доставки).
      const promDelivered = promOrder.delivery_provider_data?.unified_status === 'delivered';
      if (promDelivered && existing.status === 'shipped') {
        const actor = 'cron:prom-sync';
        try {
          const now = new Date().toISOString();
          if (!existing.carrier_delivered_at) {
            await db.from('orders').update({ carrier_delivered_at: now, carrier_status_text: 'Вручено (за даними Prom)', carrier_status_synced_at: now }).eq('id', existing.id);
          }
          await completeOrderDelivery(existing.id, actor);
          if (await allOrderSalesPosted(existing.id)) {
            await db.from('orders').update({ status: 'delivered', delivered_at: now }).eq('id', existing.id);
            existing.status = 'delivered';
            deliveredFromProm++;
            console.log(`[prom-sync] delivered by Prom status: #${existing.order_number} (${existing.tracking_number ?? '—'})`);
          }
        } catch (err) {
          console.error('[prom-sync] delivery by Prom status failed:', existing.order_number, err);
        }
      }

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

    if (['declined', 'cancelled', 'cancelled_by_client'].includes(promOrder.status)) {
      skipped++;
      continue;
    }

    const mapped = promOrderToOurFormat(promOrder);

    // Compute per-item commission breakdown and store with the order
    const commissionResult = await computePromCommission(mapped.items, { plan, fallbackPct });
    const enrichedPromData = { ...mapped.prom_data, _commission: commissionResult };

    let customerId: string | null = null;
    if (mapped.phone) {
      const { data: cust } = await db
        .from('customers')
        .select('id')
        .eq('phone', mapped.phone)
        .maybeSingle();
      customerId = cust?.id ?? null;
    }

    if (!customerId) {
      const { data: newCust } = await db
        .from('customers')
        .insert({
          name:          mapped.contact,
          phone:         mapped.phone || null,
          email:         mapped.email || null,
          type:          'retail',
          price_tier:    'retail',
          is_active:     true,
          orders_count:  0,
          total_revenue: 0,
          balance:       0,
          balance_held:  0,
          meta:          {},
        })
        .select('id')
        .single();
      customerId = newCust?.id ?? null;
    }

    const { error } = await db.from('orders').insert({
      customer_id:      customerId,
      contact:          mapped.contact,
      phone:            mapped.phone,
      prom_data:        enrichedPromData,
      email:            mapped.email,
      delivery_type:    mapped.delivery_type,
      delivery_subtype: mapped.delivery_subtype,
      delivery_address: mapped.delivery_address,
      delivery_city_ref:      mapped.delivery_city_ref,
      delivery_city_name:     mapped.delivery_city_name,
      delivery_warehouse_ref: mapped.delivery_warehouse_ref,
      payment_type:      mapped.payment_type,
      payment_confirmed: mapped.paid,
      amount_paid:       mapped.paid ? mapped.total_price : 0,
      price_type:       'retail',
      comment:          mapped.comment,
      items:            mapped.items,
      total_price:      mapped.total_price,
      status:           'new',
      channel_code:     'prom',
      prom_order_id:    mapped.prom_order_id,
    });

    if (error) {
      console.error('[prom-sync] insert failed:', error.message, 'prom_id:', promOrder.id);
    } else {
      created++;
    }
  }

  return { ok: true, created, skipped, repushed, ttnRepushed, deliveredFromProm, paidUpdated, total: orders.length };
}

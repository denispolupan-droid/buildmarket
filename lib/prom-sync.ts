import { createClient } from '@supabase/supabase-js';
import { getPromOrders, promOrderToOurFormat, ourStatusToPromStatus, setPromOrderStatus, type PromStatus } from './prom-api';
import { computePromCommission } from './prom-commission';

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

  if (!orders.length) return { ok: true, created: 0, skipped: 0, repushed: 0 };

  // Read plan setting once for all orders in this batch
  const { data: planRow } = await db.from('app_settings').select('value').eq('key', 'prom_plan').maybeSingle();
  const { data: fallbackRow } = await db.from('app_settings').select('value').eq('key', 'prom_commission_pct').maybeSingle();
  const plan        = (planRow?.value ?? 'single') as 'single' | 'econom';
  const fallbackPct = parseFloat(fallbackRow?.value ?? '3');

  let created = 0;
  let skipped = 0;
  let repushed = 0;

  for (const promOrder of orders) {
    const { data: existing } = await db
      .from('orders')
      .select('id, status')
      .eq('prom_order_id', promOrder.id)
      .maybeSingle();

    if (existing) {
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

  return { ok: true, created, skipped, repushed, total: orders.length };
}

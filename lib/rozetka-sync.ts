import { createClient } from '@supabase/supabase-js';
import { getRozetkaOrders, rozetkaOrderToOurFormat } from './rozetka-api';
import { computeRozetkaCommission } from './rozetka-commission';

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function syncRozetkaOrders() {
  // Pull orders created in the last 48 hours — covers any gaps between cron runs, same window
  // as the Prom sync. statusGroup 1 = "в обробці" (processing/new) — that's the only group we
  // need to pull in; already-completed/cancelled orders on Rozetka's side don't need a row here.
  const createdFrom = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const orders = await getRozetkaOrders({ createdFrom, statusGroup: 1 });

  if (!orders.length) return { ok: true, created: 0, skipped: 0 };

  // Read the Rozetka commission fallback once for the whole batch (per-category rate wins;
  // this covers SKUs without a category rate). Mirrors the Prom sync.
  const { data: fallbackRow } = await db.from('app_settings').select('value').eq('key', 'rozetka_commission_pct').maybeSingle();
  const fallbackPct = parseFloat(fallbackRow?.value ?? '15');

  let created = 0;
  let skipped = 0;

  for (const rzOrder of orders) {
    const { data: existing } = await db
      .from('orders')
      .select('id')
      .eq('rozetka_order_id', rzOrder.id)
      .maybeSingle();

    if (existing) { skipped++; continue; }

    const mapped = rozetkaOrderToOurFormat(rzOrder);

    // Compute per-item commission breakdown and store with the order (parity with Prom)
    const commissionResult = await computeRozetkaCommission(mapped.items, { fallbackPct });
    const enrichedRozetkaData = { ...mapped.rozetka_data, _commission: commissionResult };

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
      email:            mapped.email,
      delivery_type:      mapped.delivery_type,
      delivery_address:   mapped.delivery_address,
      delivery_city_name: mapped.delivery_city_name,
      delivery_subtype:   mapped.delivery_subtype,
      payment_type:      mapped.payment_type,
      payment_confirmed: mapped.paid,
      amount_paid:       mapped.paid ? mapped.total_price : 0,
      price_type:       'retail',
      comment:          mapped.comment,
      items:            mapped.items,
      total_price:      mapped.total_price,
      status:           'new',
      channel_code:     'rozetka',
      rozetka_order_id: mapped.rozetka_order_id,
      rozetka_data:     enrichedRozetkaData,
    });

    if (error) {
      console.error('[rozetka-sync] insert failed:', error.message, 'rozetka_id:', rzOrder.id);
    } else {
      created++;
    }
  }

  return { ok: true, created, skipped, total: orders.length };
}

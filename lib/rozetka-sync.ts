import { createClient } from '@supabase/supabase-js';
import { getRozetkaOrders, rozetkaOrderToOurFormat, ourStatusToRozetkaStatus, setRozetkaOrderStatusChained, type RozetkaOrder } from './rozetka-api';
import { computeRozetkaCommission } from './rozetka-commission';

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// Самолікування пушів статусів: пуш при підтвердженні/відправці — fire-and-forget і може
// впасти на мережевому збої (реальний кейс 2026-07-27: «other side closed», замовлення висіло
// в кабінеті як «Нове»). Тут для кожного вже відомого замовлення звіряємо фактичний статус на
// Rozetka з тим, який мав бути за нашим, і допушуємо, якщо Rozetka відстає.
// Ключ — цільовий статус Rozetka, значення — статуси, з яких його можна досягти допушем.
const REPUSH_FROM: Record<number, number[]> = {
  26: [1],          // Обробляється менеджером ← Нове замовлення
  61: [1, 26],      // Заплановано передачу перевізникові (потрібен ТТН)
  6:  [1, 26, 61],  // Замовлення виконано
  13: [1, 26],      // Скасовано адміністратором
};

export async function syncRozetkaOrders() {
  // Pull orders created in the last 48 hours — covers any gaps between cron runs, same window
  // as the Prom sync. statusGroup 1 = "в обробці" (processing/new) — that's the only group we
  // need to pull in; already-completed/cancelled orders on Rozetka's side don't need a row here.
  const createdFrom = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const orders = await getRozetkaOrders({ createdFrom, statusGroup: 1 });

  // Групи 2 (виконані) і 3 (скасовані) тягнемо ТІЛЬКИ щоб освіжити знімок кабінету
  // у вже відомих замовленнях — нових рядків звідси не створюємо. Без цього плашка
  // «що в кабінеті» замерзала б на останньому статусі групи 1: замовлення виїхало
  // з «в обробці», і синк його більше не бачив. Помилка тут не має валити синк —
  // це лише показ, а не гроші.
  const refreshOnly: RozetkaOrder[] = [];
  for (const group of [2, 3] as const) {
    try {
      refreshOnly.push(...await getRozetkaOrders({ createdFrom, statusGroup: group }));
    } catch (err) {
      console.error(`[rozetka-sync] refresh pull group ${group} failed:`, err);
    }
  }
  const refreshOnlyIds = new Set(refreshOnly.map(o => o.id));

  if (!orders.length && !refreshOnly.length) {
    return { ok: true, created: 0, skipped: 0, repushed: 0, refreshed: 0 };
  }

  // Read the Rozetka commission fallback once for the whole batch (per-category rate wins;
  // this covers SKUs without a category rate). Mirrors the Prom sync.
  const { data: fallbackRow } = await db.from('app_settings').select('value').eq('key', 'rozetka_commission_pct').maybeSingle();
  const fallbackPct = parseFloat(fallbackRow?.value ?? '15');

  let created = 0;
  let skipped = 0;
  let repushed = 0;
  let refreshed = 0;

  for (const rzOrder of [...orders, ...refreshOnly]) {
    const { data: existing } = await db
      .from('orders')
      .select('id, status, tracking_number, rozetka_data')
      .eq('rozetka_order_id', rzOrder.id)
      .maybeSingle();

    if (existing) {
      // Освіжаємо знімок кабінету. Раніше тут оновлювався тільки is_smart, а
      // status лишався таким, яким приїхав у момент імпорту — тому замовлення,
      // прийняте менеджером у кабінеті Rozetka, в адмінці й далі виглядало
      // новим. Наш власний status НЕ чіпаємо: «Підтверджено» у нас — не мітка,
      // а складська операція (резерв / замовлення постачальнику), і режим
      // виконання обирає людина. Тут лише те, що показує плашка.
      const storedData = (existing.rozetka_data ?? {}) as Record<string, unknown>;
      const liveSmart = Boolean(rzOrder.is_smart);
      const liveTtn = rzOrder.ttn || null;
      const moved = Boolean(storedData.is_smart) !== liveSmart
        || storedData.status !== rzOrder.status
        || (storedData.ttn ?? null) !== liveTtn;

      if (moved) {
        const patch: Record<string, unknown> = {
          rozetka_data: {
            ...storedData,
            is_smart:          liveSmart,
            status:            rzOrder.status,
            status_group:      rzOrder.status_group,
            ttn:               liveTtn,
            _status_synced_at: new Date().toISOString(),
          },
        };
        // ТТН із кабінету беремо, ТІЛЬКИ якщо свого немає: коли накладну
        // створювали ми, наш номер авторитетніший — його ж ми туди й пушили.
        if (!existing.tracking_number && liveTtn) patch.tracking_number = liveTtn;
        await db.from('orders').update(patch).eq('id', existing.id);
        refreshed++;
      }
      // Самолікування пушу — лише для замовлень «в обробці». Для груп 2/3 ми їх
      // сюди й не тягнули б, якби не плашка: допушувати статус у виконане чи
      // скасоване замовлення безглуздо, а драбина статусів там усе одно відіб'ється.
      const desired = refreshOnlyIds.has(rzOrder.id) ? null : ourStatusToRozetkaStatus(existing.status);
      const lagging = desired != null && (REPUSH_FROM[desired] ?? []).includes(rzOrder.status);
      if (lagging && !(desired === 61 && !existing.tracking_number)) {
        try {
          // Chained: Rozetka не дає стрибнути через статус (напр. 1→61) — драбинка 26→61
          await setRozetkaOrderStatusChained(
            rzOrder.id, desired,
            desired === 61 ? { ttn: existing.tracking_number ?? undefined } : undefined,
          );
          repushed++;
          console.log(`[rozetka-sync] re-pushed status ${desired} for order ${rzOrder.id} (was ${rzOrder.status})`);
        } catch (err) {
          console.error('[rozetka-sync] status re-push failed:', rzOrder.id, err);
        }
      }
      skipped++;
      continue;
    }

    // Замовлення з груп 2/3 тягнулися лише заради освіження плашки. Якщо такого
    // рядка в нас немає — його й не має бути: створювати виконане чи скасоване
    // замовлення заднім числом означало б завести його в облік як робоче.
    if (refreshOnlyIds.has(rzOrder.id)) { skipped++; continue; }

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

  return { ok: true, created, skipped, repushed, refreshed, total: orders.length + refreshOnly.length };
}

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { notifyCustomerStatus } from '../../../../lib/telegram';
import { setRozetkaOrderStatus } from '../../../../lib/rozetka-api';
import { completeShipmentByTtn, allOrderSalesPosted, settleLegacyCommission } from '../../../../lib/accounting/completion';
import { recordTxn } from '../../../../lib/accounting/money';

const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// NP status codes that mean the parcel was delivered to recipient
const DELIVERED_CODES = new Set(['9', '10', '11']);
// Code 1 is specifically and only "sender created the waybill, hasn't handed it over yet"
// (verified against a live tracking response) — any other code means NP has registered some
// movement on the parcel, i.e. it was actually accepted at the branch/pickup.
const NOT_HANDED_OVER_CODE = '1';

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Fetch all shipped orders with a tracking number
  const { data: orders, error } = await serviceClient
    .from('orders')
    .select('id, tracking_number, carrier_accepted_at, channel_code, rozetka_order_id')
    .eq('status', 'shipped')
    .not('tracking_number', 'is', null);

  if (error || !orders?.length) {
    return NextResponse.json({ updated: 0, checked: 0 });
  }

  // NP API allows up to 100 documents per request
  const CHUNK = 100;
  let updated = 0;
  let accepted = 0;

  for (let i = 0; i < orders.length; i += CHUNK) {
    const chunk = orders.slice(i, i + CHUNK);

    const res = await fetch('https://api.novaposhta.ua/v2.0/json/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        apiKey: process.env.NOVA_POSHTA_API_KEY,
        modelName: 'TrackingDocument',
        calledMethod: 'getStatusDocuments',
        methodProperties: {
          Documents: chunk.map(o => ({ DocumentNumber: o.tracking_number })),
        },
      }),
    });

    if (!res.ok) continue;
    const data = await res.json();
    if (!data.success) continue;

    const deliveredIds: string[] = [];
    const acceptedOrders: typeof chunk = [];
    const statusTextUpdates: PromiseLike<unknown>[] = [];
    const now = new Date().toISOString();

    // ТТН → вартість доставки і платник (для проводки витрати при доставці)
    const deliveryByTtn = new Map<string, { cost: number; payer: string }>();

    for (const doc of (data.data ?? [])) {
      const order = chunk.find(o => o.tracking_number === doc.Number);
      if (!order) continue;
      const code = String(doc.StatusCode);

      // Вартість доставки НП (DocumentCost) і платник (PayerType) — довідково на замовленні;
      // якщо платник Sender, при доставці проведемо як витрату продавця.
      const npCost  = parseFloat(String(doc.DocumentCost ?? '')) || null;
      const npPayer = doc.PayerType ? String(doc.PayerType) : null;
      if (npCost != null && npPayer) deliveryByTtn.set(String(doc.Number), { cost: npCost, payer: npPayer });

      if (doc.Status) {
        statusTextUpdates.push(
          serviceClient
            .from('orders')
            .update({
              carrier_status_text: doc.Status, carrier_status_synced_at: now,
              ...(npCost != null ? { np_delivery_cost: npCost } : {}),
              ...(npPayer ? { np_delivery_payer: npPayer } : {}),
            })
            .eq('id', order.id),
        );
      }

      if (DELIVERED_CODES.has(code)) {
        deliveredIds.push(order.id);
      } else if (code !== NOT_HANDED_OVER_CODE && !order.carrier_accepted_at) {
        acceptedOrders.push(order);
      }
    }

    if (statusTextUpdates.length) await Promise.all(statusTextUpdates);

    if (deliveredIds.length) {
      // Варіант 3: спершу ПРОВОДИМО РН-чернетку доставленої посилки за її ТТН
      // (виручка/COGS/склад + комісія по позиціях; резерв знімається). Ідемпотентно;
      // помилка по одному замовленню не зриває весь батч.
      const trulyDelivered: string[] = [];
      for (const orderId of deliveredIds) {
        const ttn = chunk.find(o => o.id === orderId)?.tracking_number;
        if (!ttn) continue;
        try {
          await completeShipmentByTtn(ttn, 'cron:sync-delivery-status');
          // Legacy-замовлення (старий потік): донарахувати комісію, якщо чернетки не було.
          await settleLegacyCommission(orderId, 'cron:sync-delivery-status');
        } catch (err) {
          console.error('[sync-delivery-status] completeShipmentByTtn failed:', orderId, err);
          continue;
        }
        // Доставка за наш рахунок (PayerType=Sender): проводимо витрату продавця.
        // Ключ по ТТН — коректно для мультипосилок; помилка не зриває батч.
        const del = deliveryByTtn.get(ttn);
        if (del && del.payer === 'Sender' && del.cost > 0) {
          try {
            await recordTxn({
              debitAccount:  'logistics',
              creditAccount: 'supplier',
              creditParty:   'np:delivery',
              amount:        del.cost,
              docType:       'delivery_cost',
              orderId,
              description:   `Доставка НП за наш рахунок (ТТН ${ttn})`,
              idempotencyKey: `np-delivery:${ttn}`,
              createdBy:     'cron:sync-delivery-status',
            });
          } catch (err) {
            console.error('[sync-delivery-status] delivery expense failed:', ttn, err);
          }
        }
        // delivered ставимо ЛИШЕ коли ВСІ РН замовлення проведені — захист від
        // передчасного delivered при відгрузці кількома посилками.
        if (await allOrderSalesPosted(orderId)) trulyDelivered.push(orderId);
      }

      if (trulyDelivered.length) {
        await serviceClient
          .from('orders')
          .update({ status: 'delivered', delivered_at: new Date().toISOString() })
          .in('id', trulyDelivered);
        updated += trulyDelivered.length;
      }

      // Notify customers via Telegram
      const { data: tgOrders } = await serviceClient
        .from('orders')
        .select('order_number, telegram_chat_id')
        .in('id', trulyDelivered)
        .not('telegram_chat_id', 'is', null);

      for (const o of tgOrders ?? []) {
        if (o.telegram_chat_id) {
          notifyCustomerStatus(o.telegram_chat_id, o.order_number, 'delivered');
        }
      }
    }

    if (acceptedOrders.length) {
      await serviceClient
        .from('orders')
        .update({ carrier_accepted_at: new Date().toISOString() })
        .in('id', acceptedOrders.map(o => o.id));
      accepted += acceptedOrders.length;

      // Upgrade Rozetka's status from 61 (scheduled handover) to 3 (handed to delivery service)
      for (const o of acceptedOrders) {
        if (o.channel_code === 'rozetka' && o.rozetka_order_id) {
          setRozetkaOrderStatus(Number(o.rozetka_order_id), 3, { ttn: o.tracking_number as string }).catch(err =>
            console.error('[sync-delivery-status] rozetka status 3 push failed:', err),
          );
        }
      }
    }
  }

  // Also run abandoned cart reminders (piggybacked on this daily cron)
  try {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://fixline.com.ua';
    await fetch(`${siteUrl}/api/cron/abandoned-cart`, {
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
    });
  } catch {}

  return NextResponse.json({ updated, accepted, checked: orders.length });
}

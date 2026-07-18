import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '../../../../lib/supabase-server';
import { createClient } from '@supabase/supabase-js';
import { setRozetkaOrderStatus } from '../../../../lib/rozetka-api';

const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const DELIVERED_CODES = new Set(['9', '10', '11']);
// Code 1 is specifically and only "sender created the waybill, hasn't handed it over yet"
// (verified against a live tracking response) — any other code means NP has registered some
// movement on the parcel, i.e. it was actually accepted at the branch/pickup.
const NOT_HANDED_OVER_CODE = '1';

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user || user.app_metadata?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: orders, error } = await serviceClient
    .from('orders')
    .select('id, tracking_number, carrier_accepted_at, channel_code, rozetka_order_id')
    .eq('status', 'shipped')
    .not('tracking_number', 'is', null);

  if (error || !orders?.length) {
    return NextResponse.json({ updated: 0, checked: 0 });
  }

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

    for (const doc of (data.data ?? [])) {
      const order = chunk.find(o => o.tracking_number === doc.Number);
      if (!order) continue;
      const code = String(doc.StatusCode);

      if (doc.Status) {
        statusTextUpdates.push(
          serviceClient
            .from('orders')
            .update({ carrier_status_text: doc.Status, carrier_status_synced_at: now })
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
      await serviceClient
        .from('orders')
        .update({ status: 'delivered' })
        .in('id', deliveredIds);
      updated += deliveredIds.length;
    }

    if (acceptedOrders.length) {
      await serviceClient
        .from('orders')
        .update({ carrier_accepted_at: new Date().toISOString() })
        .in('id', acceptedOrders.map(o => o.id));
      accepted += acceptedOrders.length;

      for (const o of acceptedOrders) {
        if (o.channel_code === 'rozetka' && o.rozetka_order_id) {
          setRozetkaOrderStatus(Number(o.rozetka_order_id), 3, { ttn: o.tracking_number as string }).catch(err =>
            console.error('[sync-delivery-status] rozetka status 3 push failed:', err),
          );
        }
      }
    }
  }

  return NextResponse.json({ updated, accepted, checked: orders.length });
}

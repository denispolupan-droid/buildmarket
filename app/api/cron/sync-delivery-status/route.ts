import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { notifyCustomerStatus } from '../../../../lib/telegram';

const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// NP status codes that mean the parcel was delivered to recipient
const DELIVERED_CODES = new Set(['9', '10', '11']);

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Fetch all shipped orders with a tracking number
  const { data: orders, error } = await serviceClient
    .from('orders')
    .select('id, tracking_number')
    .eq('status', 'shipped')
    .not('tracking_number', 'is', null);

  if (error || !orders?.length) {
    return NextResponse.json({ updated: 0, checked: 0 });
  }

  // NP API allows up to 100 documents per request
  const CHUNK = 100;
  let updated = 0;

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

    for (const doc of (data.data ?? [])) {
      if (DELIVERED_CODES.has(String(doc.StatusCode))) {
        const order = chunk.find(o => o.tracking_number === doc.Number);
        if (order) deliveredIds.push(order.id);
      }
    }

    if (deliveredIds.length) {
      await serviceClient
        .from('orders')
        .update({ status: 'delivered' })
        .in('id', deliveredIds);
      updated += deliveredIds.length;

      // Notify customers via Telegram
      const { data: tgOrders } = await serviceClient
        .from('orders')
        .select('order_number, telegram_chat_id')
        .in('id', deliveredIds)
        .not('telegram_chat_id', 'is', null);

      for (const o of tgOrders ?? []) {
        if (o.telegram_chat_id) {
          notifyCustomerStatus(o.telegram_chat_id, o.order_number, 'delivered');
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

  return NextResponse.json({ updated, checked: orders.length });
}

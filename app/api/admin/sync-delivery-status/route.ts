import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '../../../../lib/supabase-server';
import { createClient } from '@supabase/supabase-js';

const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const DELIVERED_CODES = new Set(['9', '10', '11']);

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user || user.user_metadata?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: orders, error } = await serviceClient
    .from('orders')
    .select('id, tracking_number')
    .eq('status', 'shipped')
    .not('tracking_number', 'is', null);

  if (error || !orders?.length) {
    return NextResponse.json({ updated: 0, checked: 0 });
  }

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
    }
  }

  return NextResponse.json({ updated, checked: orders.length });
}

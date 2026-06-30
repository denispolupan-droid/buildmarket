import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '../../../../../../lib/supabase-server';
import { createServiceClient } from '../../../../../../lib/supabase';
import { setPromTTN } from '../../../../../../lib/prom-api';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = await createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || user.user_metadata?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    const db = createServiceClient();

    const { data: order, error } = await db
      .from('orders')
      .select('id, prom_order_id, tracking_number, delivery_type, channel_code')
      .eq('id', id)
      .single();

    if (error || !order) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    if (order.channel_code !== 'prom') {
      return NextResponse.json({ error: 'Не Prom-замовлення' }, { status: 400 });
    }

    const promOrderId = order.prom_order_id as number | null;
    if (!promOrderId) {
      return NextResponse.json({ error: 'prom_order_id відсутній' }, { status: 400 });
    }

    const ttn = order.tracking_number as string | null;
    if (!ttn) {
      return NextResponse.json({ error: 'ТТН не вказана' }, { status: 400 });
    }

    const deliveryType = (order.delivery_type as string | null) ?? 'nova_poshta';
    await setPromTTN(promOrderId, ttn, deliveryType);

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[push-prom-ttn]', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '../../../../../../lib/supabase-server';
import { createServiceClient } from '../../../../../../lib/supabase';
import { setRozetkaOrderStatus } from '../../../../../../lib/rozetka-api';

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
      .select('id, rozetka_order_id, tracking_number, channel_code')
      .eq('id', id)
      .single();

    if (error || !order) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    if (order.channel_code !== 'rozetka') {
      return NextResponse.json({ error: 'Не Rozetka-замовлення' }, { status: 400 });
    }

    const rozetkaOrderId = order.rozetka_order_id as number | null;
    if (!rozetkaOrderId) {
      return NextResponse.json({ error: 'rozetka_order_id відсутній' }, { status: 400 });
    }

    const ttn = order.tracking_number as string | null;
    if (!ttn) {
      return NextResponse.json({ error: 'ТТН не вказана' }, { status: 400 });
    }

    // status 3 = Передано до служби доставки (see lib/rozetka-api.ts STATUS_MAP)
    await setRozetkaOrderStatus(rozetkaOrderId, 3, { ttn });

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[push-rozetka-ttn]', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

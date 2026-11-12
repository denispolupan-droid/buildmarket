import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '../../../../../../lib/auth-guard';
import { createServiceClient } from '../../../../../../lib/supabase-service';
import { ensureEpicentrTTN, getEpicentrOrder, advanceEpicentrOrder, epicentrRank } from '../../../../../../lib/epicentr-api';
import { withApi } from '../../../../../../lib/api-handler';

// Ручний пуш ТТН в Епіцентр (кнопка в журналі, дзеркало push-prom-ttn). Якщо у
// нас замовлення вже відвантажене — доводимо до «Відправлено» покроково.
async function _POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff('admin', 'manager');
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;
    const db = createServiceClient();
    const { data: order, error } = await db
      .from('orders')
      .select('id, epicentr_order_id, tracking_number, channel_code, status')
      .eq('id', id)
      .single();
    if (error || !order) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (order.channel_code !== 'epicentr') return NextResponse.json({ error: 'Не замовлення Епіцентру' }, { status: 400 });
    if (!order.epicentr_order_id) return NextResponse.json({ error: 'epicentr_order_id відсутній' }, { status: 400 });
    const ttn = order.tracking_number as string | null;
    if (!ttn) return NextResponse.json({ error: 'ТТН не вказана' }, { status: 400 });

    const epiId = String(order.epicentr_order_id);
    // Відвантажене — покроково до «Відправлено» (через «Підтверджено», ТТН усередині);
    // інакше чи вже відправлене — лише номер
    const live = await getEpicentrOrder(epiId);
    if (['shipped', 'delivered'].includes(String(order.status)) && live && epicentrRank(live.statusCode) >= 0 && epicentrRank(live.statusCode) < epicentrRank('sent')) {
      await advanceEpicentrOrder(epiId, 'sent', { ttn, live });
    } else {
      await ensureEpicentrTTN(epiId, ttn, live);
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[push-epicentr-ttn]', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const POST = withApi('admin/orders/[id]/push-epicentr-ttn', _POST);

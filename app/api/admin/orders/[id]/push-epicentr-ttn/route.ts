import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '../../../../../../lib/auth-guard';
import { createServiceClient } from '../../../../../../lib/supabase';
import { setEpicentrTTN, setEpicentrOrderStatus } from '../../../../../../lib/epicentr-api';

// Ручний пуш ТТН в Епіцентр (кнопка в журналі, дзеркало push-prom-ttn). Після
// ТТН одразу переводимо у «Відправлено», якщо у нас замовлення вже відвантажене.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
    await setEpicentrTTN(epiId, ttn);
    if (['shipped', 'delivered'].includes(String(order.status))) {
      try { await setEpicentrOrderStatus(epiId, 'sent'); } catch (err) {
        // Статус міг уже бути «sent»/далі — ТТН передано, це головне
        console.warn('[push-epicentr-ttn] sent status skipped:', err instanceof Error ? err.message : err);
      }
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[push-epicentr-ttn]', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

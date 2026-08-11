import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '../../../../../../lib/supabase-server';
import { createServiceClient } from '../../../../../../lib/supabase';
import { RZ_DELIVERY_TYPE } from '../../../../../../lib/rz-delivery';
import { rzReturnTrack } from '../../../../../../lib/rz-delivery-api';

/**
 * Повернення відправлення «ROZETKA Доставки» (заборона видачі).
 *
 * Потрібне, коли замовлення скасували вже після передачі перевізникові: сама по
 * собі посилка лежатиме в точці до кінця терміну зберігання, а далі зберігання
 * стає платним — рівно та сама пастка, що й із забутими поверненнями НП.
 *
 * Статус замовлення тут НЕ чіпаємо: рух назад веде крон доставки за статусами
 * (фаза 'returning'), і дублювати його рішення руками — вірний шлях до
 * розбіжності між тим, що в базі, і тим, що з посилкою насправді.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const { reason } = await req.json().catch(() => ({})) as { reason?: string };
  const text = (reason ?? '').trim();
  if (!text) return NextResponse.json({ error: 'Вкажіть причину повернення' }, { status: 400 });

  const db = createServiceClient();
  const { data: order } = await db
    .from('orders')
    .select('id, order_number, tracking_number, delivery_type')
    .eq('id', id)
    .single();

  if (!order) return NextResponse.json({ error: 'Замовлення не знайдено' }, { status: 404 });
  if (order.delivery_type !== RZ_DELIVERY_TYPE) {
    return NextResponse.json({ error: 'Це не «ROZETKA Доставка»' }, { status: 400 });
  }
  if (!order.tracking_number) return NextResponse.json({ error: 'У замовлення немає ЕН' }, { status: 400 });

  try {
    await rzReturnTrack(order.tracking_number as string, text.slice(0, 200));
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[rz-return]', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

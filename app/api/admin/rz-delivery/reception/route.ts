import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '../../../../../lib/supabase-server';
import { createServiceClient } from '../../../../../lib/supabase';
import { RZ_DELIVERY_TYPE } from '../../../../../lib/rz-delivery';
import { getRzSender, rzAddToReception, rzReceptionsToday, rzReceptionPrint } from '../../../../../lib/rz-delivery-api';

/**
 * Реєстр ЕН «ROZETKA Доставки» — пачка накладних, яку віддають на точці одним
 * документом.
 *
 * POST — додати замовлення (за id) у сьогоднішній реєстр, створивши його за
 * потреби. Номери накладних беремо З БАЗИ по id замовлення, а не з тіла запиту:
 * інакше в чужий реєстр можна було б підсунути будь-який номер.
 *
 * GET  — сьогоднішні реєстри; `?print=<id>` — друкована форма.
 */

async function requireAdmin() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.app_metadata?.role === 'admin' ? user : null;
}

export async function GET(req: NextRequest) {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const printId = req.nextUrl.searchParams.get('print');
  try {
    if (printId) {
      const id = Number(printId);
      if (!Number.isFinite(id)) return NextResponse.json({ error: 'Невірний номер реєстру' }, { status: 400 });
      return NextResponse.json(await rzReceptionPrint(id));
    }
    return NextResponse.json({ receptions: await rzReceptionsToday() });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[rz reception]', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { orderIds } = await req.json().catch(() => ({})) as { orderIds?: string[] };
  if (!Array.isArray(orderIds) || !orderIds.length) {
    return NextResponse.json({ error: 'Не вибрано замовлень' }, { status: 400 });
  }

  const db = createServiceClient();
  const { data: orders } = await db
    .from('orders')
    .select('id, order_number, tracking_number, delivery_type')
    .in('id', orderIds);

  const tracks = (orders ?? [])
    .filter(o => o.delivery_type === RZ_DELIVERY_TYPE && o.tracking_number)
    .map(o => o.tracking_number as string);

  if (!tracks.length) {
    return NextResponse.json({ error: 'Серед вибраних немає замовлень з ЕН ROZETKA' }, { status: 400 });
  }

  try {
    const sender = await getRzSender();
    const res = await rzAddToReception([...new Set(tracks)], sender?.department);
    return NextResponse.json({
      ok: true,
      receptionId: res.reception_id,
      created: res.created,
      added: tracks.length - (res.rejected_tracks?.length ?? 0),
      rejected: res.rejected_tracks ?? [],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[rz reception add]', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '../../../../../../lib/supabase-server';
import { createServiceClient } from '../../../../../../lib/supabase';
import { syncDraftShipmentTracking } from '../../../../../../lib/accounting/completion';
import { ourStatusToRozetkaStatus, setRozetkaOrderStatusChained } from '../../../../../../lib/rozetka-api';
import { ROZETKA_DELIVERY_TYPE } from '../../../../../../lib/rozetka-delivery';
import { setPromTTN } from '../../../../../../lib/prom-api';

/**
 * Заміна ТТН у вже відвантаженому замовленні.
 *
 * Живий випадок: постачальник не передав посилку, накладну видалили в кабінеті
 * НП і виписали нову. Просте «перезаписати номер» тут не годиться — разом із
 * номером треба скинути все, що описувало СТАРУ посилку, інакше нова успадкує
 * чужий стан: «Видалено» в статусі перевізника, дату приймання, дату відправки
 * (за нею рахується попередження «висить N днів»). І номер має доїхати до
 * маркетплейсу: покупець бачить ТТН у своєму кабінеті, а не в нашому.
 *
 * Облік не чіпаємо навмисно: за Варіантом 3 продаж проводиться при доставці, а
 * замовлення лишається відвантаженим. Єдине, що треба, — переписати номер у
 * непроведеній РН, інакше документ посилатиметься на неіснуючу накладну.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({})) as { ttn?: unknown };
  const ttn = typeof body.ttn === 'string' ? body.ttn.trim() : '';
  if (!ttn) return NextResponse.json({ error: 'Не вказано новий номер' }, { status: 400 });

  const db = createServiceClient();
  const { data: order, error } = await db
    .from('orders')
    .select('id, order_number, status, tracking_number, channel_code, delivery_type, rozetka_order_id, prom_order_id, rozetka_data, status_history')
    .eq('id', id)
    .single();
  if (error || !order) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const oldTtn = order.tracking_number as string | null;
  if (oldTtn === ttn) return NextResponse.json({ error: 'Це той самий номер' }, { status: 400 });

  const now = new Date().toISOString();
  const history = Array.isArray(order.status_history) ? order.status_history : [];

  const update: Record<string, unknown> = {
    tracking_number: ttn,
    // Усе, що стосувалося старої посилки. tracking_ref — це Ref документа в НП;
    // лишити його означає дати кнопці «видалити ТТН» стерти чужу накладну.
    tracking_ref: null,
    carrier_status_text: null,
    carrier_status_synced_at: null,
    carrier_accepted_at: null,
    status_history: [...history, { status: 'ttn_replaced', at: now, by: user.email ?? 'admin' }],
  };
  // Дата відправки — від нової накладної: стара посилка не поїхала, і рахувати
  // «висить N днів» від її дати означало б лякати себе неіснуючим простроченням.
  if (order.status === 'shipped') update.shipped_at = now;

  const { error: upErr } = await db.from('orders').update(update).eq('id', id);
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  await syncDraftShipmentTracking(id, ttn);

  // Пуш у маркетплейс — не критичний для збереження: якщо кабінет недоступний,
  // номер уже правильний у нас, а пуш можна повторити кнопкою.
  const pushErrors: string[] = [];
  if (order.channel_code === 'rozetka' && order.rozetka_order_id && order.delivery_type !== ROZETKA_DELIVERY_TYPE) {
    try {
      const rozStatus = ourStatusToRozetkaStatus('shipped');
      if (rozStatus) {
        const cabinet = (order.rozetka_data ?? {}) as Record<string, unknown>;
        await setRozetkaOrderStatusChained(order.rozetka_order_id as number, rozStatus, {
          ttn,
          currentStatus: typeof cabinet.status === 'number' ? cabinet.status : null,
        });
      }
    } catch (e) {
      pushErrors.push(`Rozetka: ${(e as Error).message}`);
    }
  }
  if (order.channel_code === 'prom' && order.prom_order_id) {
    try {
      await setPromTTN(order.prom_order_id as number, ttn);
    } catch (e) {
      pushErrors.push(`Prom: ${(e as Error).message}`);
    }
  }

  return NextResponse.json({
    ok: true,
    oldTtn,
    ttn,
    pushed: pushErrors.length === 0,
    pushErrors,
  });
}

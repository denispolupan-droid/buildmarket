import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '../../../../../../lib/supabase-service';
import { syncDraftShipmentTracking } from '../../../../../../lib/accounting/completion';
import { ROZETKA_DELIVERY_TYPE } from '../../../../../../lib/rozetka-delivery';
import { applyOrderPatch } from '../../../../../../lib/orders/status';
import { ttnReplacedEvents, orderSnapshot } from '../../../../../../lib/outbox/enqueue';
import { requireStaff } from '../../../../../../lib/auth-guard';
import { withApi } from '../../../../../../lib/api-handler';

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
async function _POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;
  const { user } = auth;

  const { id } = await params;
  const body = await req.json().catch(() => ({})) as { ttn?: unknown };
  const ttn = typeof body.ttn === 'string' ? body.ttn.trim() : '';
  if (!ttn) return NextResponse.json({ error: 'Не вказано новий номер' }, { status: 400 });

  const db = createServiceClient();
  const { data: order, error } = await db
    .from('orders')
    .select('id, order_number, status, tracking_number, channel_code, delivery_type, rozetka_order_id, prom_order_id, epicentr_order_id, rozetka_data, status_history')
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

  // Номер у маркетплейс — подією outbox у тій самій транзакції, що й запис номера
  // (фаза 2): обробник mp.push_ttn бере живий статус Rozetka і пушить з forceTtn —
  // при незмінному статусі PUT інакше номер не оновлює. Доставляє крон за ≤1 хв,
  // з повторами; слід — у картці («Доставка подій»). Накладну «Rozetka Доставки»
  // веде сам кабінет, туди не пушимо.
  const events = ttnReplacedEvents(id, orderSnapshot(order as Record<string, unknown>), ttn)
    .filter(e => !((e.payload as { channel?: string }).channel === 'rozetka' && order.delivery_type === ROZETKA_DELIVERY_TYPE));
  try {
    await applyOrderPatch(db, id, update, events);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }

  await syncDraftShipmentTracking(id, ttn);

  return NextResponse.json({
    ok: true,
    oldTtn,
    ttn,
    queued: events.length,
  });
}

export const POST = withApi('admin/orders/[id]/replace-ttn', _POST);

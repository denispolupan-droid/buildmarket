import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '../../../../../../lib/supabase-server';
import { createServiceClient } from '../../../../../../lib/supabase';
import { createRozetkaDeliveryTtn, getRozetkaSender, getRozetkaSenderOptions, saveRozetkaSender, type RozetkaSender } from '../../../../../../lib/rozetka-delivery-ttn';
import { ROZETKA_DELIVERY_TYPE } from '../../../../../../lib/rozetka-delivery';
import { syncDraftShipmentTracking } from '../../../../../../lib/accounting/completion';

/**
 * Створення накладної для доставки в точку видачі Rozetka.
 *
 * Це НЕ Нова Пошта: номер має вигляд «RMP-…», і виписує його сама Rozetka
 * своїм API (розділ Octopus). Посилку з ТТН Нової Пошти точка видачі не прийме,
 * тому роут навмисно відмовляє всім іншим типам доставки.
 */
/** Хто буде відправником + з яких відділень можна відправити — ДО створення
 *  накладної. options — різні відділення з останніх накладних кабінету. */
export async function GET() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const [sender, options] = await Promise.all([
    getRozetkaSender(),
    getRozetkaSenderOptions().catch(() => [] as RozetkaSender[]),
  ]);
  // Поточний відправник міг бути з налаштування і не потрапити в історію
  if (sender && !options.some(o => o.department === sender.department)) options.unshift(sender);
  return NextResponse.json({ sender, options });
}

/** Обрати відділення відправника: зберігається і діє для всіх наступних накладних. */
export async function PUT(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const body = await req.json().catch(() => ({})) as { sender?: RozetkaSender };
  const s = body.sender;
  if (!s?.department || !s?.city || !s?.name) {
    return NextResponse.json({ error: 'Неповні дані відправника' }, { status: 400 });
  }
  await saveRozetkaSender({
    type: s.type ?? 'natural',
    name: s.name,
    city: s.city,
    address: s.address ?? '',
    department: s.department,
    department_type: s.department_type,
    phones: Array.isArray(s.phones) ? s.phones : [],
  });
  return NextResponse.json({ ok: true });
}

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
  const body = await req.json().catch(() => ({})) as {
    weight?: number; length?: number; width?: number; height?: number;
    places?: number; description?: string;
  };

  const weight = Number(body.weight);
  const length = Number(body.length);
  const width  = Number(body.width);
  const height = Number(body.height);
  if (![weight, length, width, height].every(n => Number.isFinite(n) && n > 0)) {
    return NextResponse.json({ error: 'Вкажіть вагу і всі три габарити' }, { status: 400 });
  }

  const db = createServiceClient();
  const { data: order, error } = await db
    .from('orders')
    .select('id, order_number, delivery_type, tracking_number, rozetka_order_id, total_price, payment_type, payment_confirmed, items')
    .eq('id', id)
    .single();

  if (error || !order) return NextResponse.json({ error: 'Замовлення не знайдено' }, { status: 404 });
  if (order.delivery_type !== ROZETKA_DELIVERY_TYPE) {
    return NextResponse.json({ error: 'Це не доставка в точку видачі Rozetka' }, { status: 400 });
  }
  if (!order.rozetka_order_id) {
    return NextResponse.json({ error: 'У замовлення немає rozetka_order_id' }, { status: 400 });
  }
  if (order.tracking_number) {
    return NextResponse.json({ error: `ТТН уже створена: ${order.tracking_number}` }, { status: 409 });
  }

  const sender = await getRozetkaSender();
  if (!sender) {
    return NextResponse.json({
      error: 'Не знайдено відправника. Створіть одну накладну в кабінеті Rozetka — далі братимемо дані звідти.',
    }, { status: 422 });
  }

  // Накладений платіж: Rozetka має стягнути з отримувача суму замовлення й
  // повернути її нам. Для передоплачених — has_paid=true і нуль до стягнення.
  const isCod = order.payment_type === 'cod' && !order.payment_confirmed;
  const items = (order.items ?? []) as { name?: string }[];
  const description = items.map(i => i.name).filter(Boolean).join(', ');

  try {
    const ttn = await createRozetkaDeliveryTtn({
      orderId:     Number(order.rozetka_order_id),
      sender,
      params:      { weight, length, width, height },
      places:      Number(body.places) > 0 ? Number(body.places) : 1,
      description: body.description ?? description,
      hasPaid:     !isCod,
      codAmount:   Number(order.total_price) || 0,
    });

    if (ttn.ttn) {
      await db.from('orders').update({ tracking_number: ttn.ttn }).eq('id', order.id);
      // Той самий номер — на непроведені РН, інакше синк доставки їх не знайде
      await syncDraftShipmentTracking(order.id, ttn.ttn);
    }
    return NextResponse.json({ ok: true, ttn: ttn.ttn, delivery_price: ttn.delivery_price });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[rozetka-delivery-ttn]', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

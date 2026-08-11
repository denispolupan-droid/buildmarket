import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '../../../../../../lib/supabase-server';
import { createServiceClient } from '../../../../../../lib/supabase';
import { syncDraftShipmentTracking } from '../../../../../../lib/accounting/completion';
import { RZ_DELIVERY_TYPE, RZ_TRACK_TYPE_DEPT, rzPhone, rzSplitName } from '../../../../../../lib/rz-delivery';
import { getRzSender, getRzBox, rzCreateTrack, rzLabel, rzDeleteTrack, RzError } from '../../../../../../lib/rz-delivery-api';

/**
 * Експрес-накладна «ROZETKA Доставки» для замовлення сайту.
 *
 * Не плутати з сусіднім rozetka-delivery-ttn: там маркетплейсні замовлення й
 * Seller API, тут — наш власний договір партнера. Номери, баланс і облік різні,
 * тому обидва роути навмисно відмовляють чужому delivery_type.
 *
 * Гроші: доставку платить отримувач (delivery_payer='receiver'), а `cost` — це
 * сума післяплати до стягнення. Для передоплаченого замовлення вона нуль, інакше
 * Rozetka візьме з покупця гроші вдруге.
 */

async function requireAdmin() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.app_metadata?.role === 'admin' ? user : null;
}

/**
 * Без параметрів — дані для модалки (відправник + коробка за замовчуванням).
 * З `?label=1` — PDF-етикетка вже створеної накладної, base64.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  if (req.nextUrl.searchParams.get('label')) {
    const { id } = await params;
    const { data: order } = await createServiceClient()
      .from('orders').select('tracking_number, delivery_type').eq('id', id).single();
    if (!order?.tracking_number || order.delivery_type !== RZ_DELIVERY_TYPE) {
      return NextResponse.json({ error: 'Немає накладної ROZETKA' }, { status: 400 });
    }
    try {
      return NextResponse.json({ label: await rzLabel([order.tracking_number as string]) });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[rz-ttn label]', err);
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  const [sender, box] = await Promise.all([getRzSender(), getRzBox()]);
  return NextResponse.json({
    sender: sender ? {
      point:    sender.department_label ?? '',
      city:     sender.city_name ?? '',
      limitKg:  sender.weight_limit_kg ?? null,
    } : null,
    box,
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  const body = await req.json().catch(() => ({})) as {
    weight?: number; length?: number; width?: number; height?: number;
    places?: number; description?: string;
  };

  const box = await getRzBox();
  const weight = Number(body.weight);
  const length = Number(body.length ?? box.length);
  const width  = Number(body.width  ?? box.width);
  const height = Number(body.height ?? box.height);
  if (![weight, length, width, height].every(n => Number.isFinite(n) && n > 0)) {
    return NextResponse.json({ error: 'Вкажіть вагу і всі три габарити' }, { status: 400 });
  }

  const db = createServiceClient();
  const { data: order, error } = await db
    .from('orders')
    // Один рядок навмисно: supabase-js виводить типи колонок із ЛІТЕРАЛУ select,
    // і склеєний з шматків рядок перетворює order на GenericStringError.
    .select('id, order_number, delivery_type, tracking_number, contact, phone, delivery_city_ref, delivery_warehouse_ref, delivery_address, total_price, payment_type, payment_confirmed, items')
    .eq('id', id)
    .single();

  if (error || !order) return NextResponse.json({ error: 'Замовлення не знайдено' }, { status: 404 });
  if (order.delivery_type !== RZ_DELIVERY_TYPE) {
    return NextResponse.json({ error: 'Це не «ROZETKA Доставка»' }, { status: 400 });
  }
  if (order.tracking_number) {
    return NextResponse.json({ error: `Накладна вже створена: ${order.tracking_number}` }, { status: 409 });
  }
  if (!order.delivery_city_ref || !order.delivery_warehouse_ref) {
    return NextResponse.json({ error: 'У замовленні немає точки видачі ROZETKA' }, { status: 400 });
  }

  const sender = await getRzSender();
  if (!sender) {
    return NextResponse.json({
      error: 'Не налаштовано відправника: Налаштування → ROZETKA Доставка',
    }, { status: 422 });
  }
  if (sender.weight_limit_kg != null && weight > sender.weight_limit_kg) {
    return NextResponse.json({
      error: `Точка здачі «${sender.department_label ?? ''}» приймає до ${sender.weight_limit_kg} кг, а посилка ${weight} кг`,
    }, { status: 400 });
  }

  const phone = rzPhone(order.phone as string | null);
  if (!phone) return NextResponse.json({ error: `Некоректний телефон отримувача: ${order.phone}` }, { status: 400 });
  const name = rzSplitName(order.contact as string | null);
  if (!name.first_name || !name.last_name) {
    return NextResponse.json({ error: 'У замовленні немає ПІБ отримувача' }, { status: 400 });
  }

  // Оголошена вартість строго > 0 — вимога API. Беремо суму замовлення з БД,
  // а не з тіла запиту: це гроші, і клієнтським цифрам тут не місце.
  const total = Number(order.total_price) || 0;
  if (total <= 0) return NextResponse.json({ error: 'Нульова сума замовлення' }, { status: 400 });

  const isCod = order.payment_type === 'cod' && !order.payment_confirmed;
  const items = (order.items ?? []) as { name?: string }[];
  const description = (body.description ?? items.map(i => i.name).filter(Boolean).join(', ')).slice(0, 100);

  try {
    const track = await rzCreateTrack({
      visible_id:     String(order.order_number),
      description,
      type:           RZ_TRACK_TYPE_DEPT,
      places:         Number(body.places) > 0 ? Number(body.places) : 1,
      delivery_payer: 'receiver',
      cost:           isCod ? total : 0,
      insurance_cost: total,
      params:         { weight, length, width, height },
      sender: {
        city:        sender.city,
        department:  sender.department,
        first_name:  sender.first_name,
        last_name:   sender.last_name,
        ...(sender.middle_name ? { middle_name: sender.middle_name } : {}),
        ...(sender.name ? { name: sender.name } : {}),
        phone:       sender.phone,
      },
      recipient: {
        city:        order.delivery_city_ref as string,
        department:  order.delivery_warehouse_ref as string,
        first_name:  name.first_name,
        last_name:   name.last_name,
        ...(name.middle_name ? { middle_name: name.middle_name } : {}),
        phone,
      },
    });

    await db.from('orders').update({
      tracking_number:   track.track_id,
      rz_delivery_cost:  track.shipping_cost ?? null,
      rz_payment_fee:    track.payment_fee ?? null,
      rz_delivery_payer: 'receiver',
    }).eq('id', order.id);
    // Той самий номер — на непроведені РН, інакше синк доставки їх не знайде
    await syncDraftShipmentTracking(order.id, track.track_id);

    return NextResponse.json({
      ok: true,
      ttn:           track.track_id,
      shippingCost:  track.shipping_cost ?? null,
      paymentFee:    track.payment_fee ?? null,
      deliveryDate:  track.delivery_date ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[rz-ttn]', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Видалення помилково створеної накладної.
 *
 * Свідомо жорсткіше за НП-аналог, який чистить номер у базі в будь-якому разі.
 * Тут інша ціна помилки: коли Rozetka відмовила у видаленні, накладна в кабінеті
 * ЖИВА, і якби ми все одно затерли номер, посилка поїхала б без жодного зв'язку
 * із замовленням — ані трекінгу, ані проведення продажу. Тому номер прибираємо
 * лише тоді, коли накладної в Rozetka справді більше немає.
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  const db = createServiceClient();
  const { data: order } = await db
    .from('orders')
    .select('id, tracking_number, delivery_type, carrier_accepted_at')
    .eq('id', id)
    .single();

  if (!order) return NextResponse.json({ error: 'Замовлення не знайдено' }, { status: 404 });
  if (order.delivery_type !== RZ_DELIVERY_TYPE) {
    return NextResponse.json({ error: 'Це не «ROZETKA Доставка»' }, { status: 400 });
  }
  if (!order.tracking_number) return NextResponse.json({ error: 'Немає накладної для видалення' }, { status: 400 });
  if (order.carrier_accepted_at) {
    return NextResponse.json({
      error: 'Перевізник уже прийняв відправлення — накладну не видалити. Оформлюйте повернення.',
    }, { status: 409 });
  }

  try {
    await rzDeleteTrack([order.tracking_number as string]);
  } catch (err) {
    // 404 — накладну вже видалили руками в кабінеті; для нас це той самий результат
    if (!(err instanceof RzError) || err.status !== 404) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[rz-ttn delete]', err);
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  await db.from('orders').update({
    tracking_number: null, rz_delivery_cost: null, rz_payment_fee: null, rz_delivery_payer: null,
  }).eq('id', id);
  // І з непроведених РН: інакше чернетка лишиться з номером неіснуючої накладної,
  // а крон доставки шукатиме посилку, якої вже немає.
  await syncDraftShipmentTracking(id, null);

  return NextResponse.json({ ok: true });
}

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '../../../../../../lib/supabase-server';
import { createServiceClient } from '../../../../../../lib/supabase';
import { createRozetkaDeliveryTtn, getRozetkaSender, getRozetkaSenderOptions, getRozetkaDeliveryTtnPdf, getRzSettingsSender, saveRozetkaSender, ROZETKA_SENDER_KEY, type RozetkaSender } from '../../../../../../lib/rozetka-delivery-ttn';
import { ROZETKA_DELIVERY_TYPE } from '../../../../../../lib/rozetka-delivery';
import { syncDraftShipmentTracking } from '../../../../../../lib/accounting/completion';
import { ourStatusToRozetkaStatus, setRozetkaOrderStatusChained } from '../../../../../../lib/rozetka-api';
import { mergedDescription } from '../../../../../../lib/orders/merge-ttn';

/**
 * Створення накладної для доставки в точку видачі Rozetka.
 *
 * Це НЕ Нова Пошта: номер має вигляд «RMP-…», і виписує його сама Rozetka
 * своїм API (розділ Octopus). Посилку з ТТН Нової Пошти точка видачі не прийме,
 * тому роут навмисно відмовляє всім іншим типам доставки.
 */
/** Хто буде відправником + з яких відділень можна відправити — ДО створення
 *  накладної (options — різні відділення з останніх накладних кабінету).
 *  ?label=1 — PDF етикетки вже створеної накладної (base64). */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (new URL(req.url).searchParams.get('label')) {
    const { id } = await params;
    const db = createServiceClient();
    const { data: order } = await db
      .from('orders')
      .select('tracking_number, delivery_type')
      .eq('id', id)
      .maybeSingle();
    if (!order?.tracking_number) return NextResponse.json({ error: 'У замовлення немає ТТН' }, { status: 400 });
    if (order.delivery_type !== ROZETKA_DELIVERY_TYPE) {
      return NextResponse.json({ error: 'Це не доставка в точку видачі Rozetka' }, { status: 400 });
    }
    try {
      const label = await getRozetkaDeliveryTtnPdf([order.tracking_number]);
      return NextResponse.json({ label });
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
    }
  }

  const [sender, options, settings] = await Promise.all([
    getRozetkaSender(),
    getRozetkaSenderOptions().catch(() => [] as RozetkaSender[]),
    getRzSettingsSender().catch(() => null),
  ]);
  // Поточний відправник міг бути з налаштування і не потрапити в історію
  if (sender && !options.some(o => o.department === sender.department)) options.unshift(sender);
  return NextResponse.json({ sender, options, settingsDepartment: settings?.department ?? null });
}

/** Обрати відділення відправника для МП-накладних. Вибір точки, що збігається з
 *  Налаштуваннями → «ROZETKA Доставка», знімає перевизначення — далі відправник
 *  «слідує» за налаштуваннями; інша точка зберігається як явний override. */
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

  const settings = await getRzSettingsSender().catch(() => null);
  if (settings?.department && settings.department === s.department) {
    const db = createServiceClient();
    await db.from('app_settings').delete().eq('key', ROZETKA_SENDER_KEY);
    return NextResponse.json({ ok: true, mode: 'settings' });
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
  return NextResponse.json({ ok: true, mode: 'override' });
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
    /** Об'єднана посилка: усі замовлення, що їдуть цією накладною (включно з id) */
    mergedIds?: string[];
  };

  const weight = Number(body.weight);
  const length = Number(body.length);
  const width  = Number(body.width);
  const height = Number(body.height);
  if (![weight, length, width, height].every(n => Number.isFinite(n) && n > 0)) {
    return NextResponse.json({ error: 'Вкажіть вагу і всі три габарити' }, { status: 400 });
  }

  // Об'єднана посилка. Seller API створює накладну з ОДНОГО замовлення Rozetka
  // (order_id), тож виписуємо її з основного, а решті прописуємо той самий номер
  // і доносимо його в кабінет. Сума післяплати — по всіх неоплачених разом:
  // покупець платить на точці один раз за всю коробку.
  const ids = [...new Set([id, ...(Array.isArray(body.mergedIds) ? body.mergedIds.map(String) : [])])];

  const db = createServiceClient();
  const { data: orders, error } = await db
    .from('orders')
    .select('id, order_number, delivery_type, tracking_number, rozetka_order_id, rozetka_data, total_price, payment_type, payment_confirmed, items, phone, delivery_address')
    .in('id', ids)
    .limit(ids.length);

  const order = orders?.find(o => o.id === id);
  if (error || !order) return NextResponse.json({ error: 'Замовлення не знайдено' }, { status: 404 });
  if (orders!.length !== ids.length) return NextResponse.json({ error: 'Частину замовлень не знайдено' }, { status: 404 });

  for (const o of orders!) {
    const tag = ids.length > 1 ? `№${o.order_number}: ` : '';
    if (o.delivery_type !== ROZETKA_DELIVERY_TYPE) {
      return NextResponse.json({ error: `${tag}Це не доставка в точку видачі Rozetka` }, { status: 400 });
    }
    if (!o.rozetka_order_id) {
      return NextResponse.json({ error: `${tag}У замовлення немає rozetka_order_id` }, { status: 400 });
    }
    if (o.tracking_number) {
      return NextResponse.json({ error: `${tag}ТТН уже створена: ${o.tracking_number}` }, { status: 409 });
    }
  }
  if (ids.length > 1) {
    // Одна коробка — один покупець на одній точці. Адресу Rozetka бере з
    // основного замовлення, тож розбіжність означала б чужу посилку не туди.
    const norm = (s: unknown) => String(s ?? '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
    if (new Set(orders!.map(o => norm(o.phone).replace(/^38/, ''))).size > 1) {
      return NextResponse.json({ error: 'Різні покупці — одна посилка неможлива' }, { status: 400 });
    }
    if (new Set(orders!.map(o => norm(o.delivery_address))).size > 1) {
      return NextResponse.json({ error: 'Різні точки видачі — одна посилка неможлива' }, { status: 400 });
    }
  }

  const sender = await getRozetkaSender();
  if (!sender) {
    return NextResponse.json({
      error: 'Не знайдено відправника. Створіть одну накладну в кабінеті Rozetka — далі братимемо дані звідти.',
    }, { status: 422 });
  }

  // Накладений платіж: Rozetka має стягнути з отримувача суму замовлення й
  // повернути її нам. Для передоплачених — has_paid=true і нуль до стягнення.
  // В об'єднаній посилці — сума неоплачених замовлень; оплачено повністю лише
  // тоді, коли стягувати нічого.
  const codAmount = orders!
    .filter(o => o.payment_type === 'cod' && !o.payment_confirmed)
    .reduce((s, o) => s + (Number(o.total_price) || 0), 0);
  const description = ids.length > 1
    ? mergedDescription(orders!.map(o => ({ order_number: o.order_number, items: (o.items ?? []) as { name?: string }[] })))
    : ((order.items ?? []) as { name?: string }[]).map(i => i.name).filter(Boolean).join(', ');

  try {
    const ttn = await createRozetkaDeliveryTtn({
      orderId:     Number(order.rozetka_order_id),
      sender,
      params:      { weight, length, width, height },
      places:      Number(body.places) > 0 ? Number(body.places) : 1,
      description: body.description ?? description,
      hasPaid:     codAmount <= 0,
      codAmount,
    });

    const warnings: string[] = [];
    if (ttn.ttn) {
      await db.from('orders').update({ tracking_number: ttn.ttn }).in('id', ids);
      // Той самий номер — на непроведені РН, інакше синк доставки їх не знайде
      for (const oid of ids) await syncDraftShipmentTracking(oid, ttn.ttn);

      // Решті замовлень Rozetka номер не знає — накладна виписана з основного.
      // Доносимо його статусом «заплановано передачу» з ТТН, як для НП-накладних.
      // Відмова кабінету — попередження менеджеру, а не збій усієї операції:
      // накладна вже існує, і посилка поїде.
      const rozStatus = ourStatusToRozetkaStatus('shipped');
      for (const o of orders!.filter(o => o.id !== id)) {
        if (!rozStatus) break;
        try {
          const cabinet = (o.rozetka_data ?? {}) as Record<string, unknown>;
          await setRozetkaOrderStatusChained(Number(o.rozetka_order_id), rozStatus, {
            ttn: ttn.ttn,
            currentStatus: typeof cabinet.status === 'number' ? cabinet.status : null,
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.warn('[rozetka-delivery-ttn] merged TTN push failed:', o.order_number, msg);
          warnings.push(`№${o.order_number}: кабінет Rozetka не прийняв ТТН (${msg.slice(0, 120)})`);
        }
      }
    }
    return NextResponse.json({ ok: true, ttn: ttn.ttn, delivery_price: ttn.delivery_price, warnings });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[rozetka-delivery-ttn]', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

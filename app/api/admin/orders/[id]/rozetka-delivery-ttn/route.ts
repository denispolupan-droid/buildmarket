import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '../../../../../../lib/auth-guard';
import { createServiceClient } from '../../../../../../lib/supabase';
import { createRozetkaDeliveryTtn, getRozetkaSender, getRozetkaSenderOptions, getRozetkaDeliveryTtnPdf, getRzSettingsSender, getRzSettingsContact, saveRozetkaSender, ROZETKA_SENDER_KEY, type RozetkaSender } from '../../../../../../lib/rozetka-delivery-ttn';
import { ROZETKA_DELIVERY_TYPE, aggregateRozetkaSeats, type RozetkaSeat } from '../../../../../../lib/rozetka-delivery';
import { syncDraftShipmentTracking } from '../../../../../../lib/accounting/completion';
import { ourStatusToRozetkaStatus, setRozetkaOrderStatusChained } from '../../../../../../lib/rozetka-api';
import { mergedDescription } from '../../../../../../lib/orders/merge-ttn';
import { numOrNull, type TtnSnapshot } from '../../../../../../lib/ttn-snapshot';
import type { RozetkaOrder } from '../../../../../../lib/rozetka-api';

/**
 * Створення накладної для доставки в точку видачі Rozetka.
 *
 * Це НЕ Нова Пошта: номер має вигляд «RMP-…», і виписує його сама Rozetka
 * своїм API (розділ Octopus). Посилку з ТТН Нової Пошти точка видачі не прийме,
 * тому роут навмисно відмовляє всім іншим типам доставки.
 */
/** Хто буде відправником — ДО створення накладної. contact — ПІБ/телефон з
 *  Налаштувань, щоб обрати відділення можна було і без жодної накладної в історії.
 *  ?label=1 — PDF етикетки вже створеної накладної (base64). */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;

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

  // Післяплата за замовчуванням — для поля у вікні; `?merged=id1,id2` — об'єднана посилка
  const { id } = await params;
  const merged = (new URL(req.url).searchParams.get('merged') ?? '').split(',').map(s => s.trim()).filter(Boolean);
  const ids = [...new Set([id, ...merged])];
  const [sender, settings, contact, { data: orders }] = await Promise.all([
    getRozetkaSender(),
    getRzSettingsSender().catch(() => null),
    getRzSettingsContact().catch(() => null),
    createServiceClient().from('orders').select('id, payment_type, payment_confirmed, total_price').in('id', ids).limit(ids.length),
  ]);
  return NextResponse.json({ sender, contact, settingsDepartment: settings?.department ?? null, cod: defaultCod(orders ?? []) });
}

/** Післяплата за замовчуванням: лише неоплачені замовлення з оплатою при отриманні.
 *  total_price — уже без 49 ₴ доставки покупця (їх Rozetka бере собі). */
function defaultCod(orders: { payment_type: unknown; payment_confirmed: unknown; total_price: unknown }[]): number {
  const sum = orders
    .filter(o => o.payment_type === 'cod' && !o.payment_confirmed)
    .reduce((s, o) => s + (Number(o.total_price) || 0), 0);
  return Math.round(sum * 100) / 100;
}

/** Обрати відділення відправника для МП-накладних. Вибір точки, що збігається з
 *  Налаштуваннями → «ROZETKA Доставка», знімає перевизначення — далі відправник
 *  «слідує» за налаштуваннями; інша точка зберігається як явний override.
 *
 *  Якщо з цього відділення вже відправляли, city/address беремо з тієї накладної:
 *  кабінет пише в sender.city uuid з іншого довідника, ніж find-pickup-cities
 *  (d12cbd6b… проти e1d394d7… для Харкова), і перевірений варіант надійніший. */
export async function PUT(req: NextRequest) {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;
  const body = await req.json().catch(() => ({})) as { sender?: RozetkaSender };
  const s = body.sender;
  if (!s?.department || !s?.city || !s?.name) {
    return NextResponse.json({ error: 'Неповні дані відправника' }, { status: 400 });
  }

  const [settings, history] = await Promise.all([
    getRzSettingsSender().catch(() => null),
    getRozetkaSenderOptions().catch(() => [] as RozetkaSender[]),
  ]);
  if (settings?.department && settings.department === s.department) {
    const db = createServiceClient();
    await db.from('app_settings').delete().eq('key', ROZETKA_SENDER_KEY);
    const sender = await getRozetkaSender();
    return NextResponse.json({ ok: true, mode: 'settings', sender });
  }

  const known = history.find(o => o.department === s.department);
  const sender: RozetkaSender = {
    type: s.type ?? 'natural',
    name: s.name,
    city: known?.city ?? s.city,
    address: known?.address ?? s.address ?? '',
    department: s.department,
    department_type: known?.department_type ?? s.department_type,
    phones: Array.isArray(s.phones) ? s.phones : [],
    ...(s.city_name ? { city_name: s.city_name } : {}),
    weight_limit_kg: typeof s.weight_limit_kg === 'number' ? s.weight_limit_kg : null,
  };
  await saveRozetkaSender(sender);
  return NextResponse.json({ ok: true, mode: 'override', sender });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;
  const user = auth.user;

  const { id } = await params;
  const body = await req.json().catch(() => ({})) as {
    weight?: number; length?: number; width?: number; height?: number;
    places?: number; description?: string;
    /** Кілька місць зі своїми вагою й габаритами; тоді weight/габарити/places з них */
    seats?: Partial<RozetkaSeat>[];
    /** Об'єднана посилка: усі замовлення, що їдуть цією накладною (включно з id) */
    mergedIds?: string[];
    /** Післяплата, виправлена менеджером у вікні; без поля — рахуємо з БД */
    codAmount?: number;
  };
  if (body.codAmount != null) {
    const c = Number(body.codAmount);
    if (!Number.isFinite(c) || c < 0) {
      return NextResponse.json({ error: 'Некоректна сума післяплати' }, { status: 400 });
    }
  }

  const seats: RozetkaSeat[] = Array.isArray(body.seats) && body.seats.length > 0
    ? body.seats.map(s => ({ weight: Number(s?.weight), length: Number(s?.length), width: Number(s?.width), height: Number(s?.height) }))
    : [{ weight: Number(body.weight), length: Number(body.length), width: Number(body.width), height: Number(body.height) }];
  if (seats.length > 50) return NextResponse.json({ error: 'Забагато місць' }, { status: 400 });
  for (const [i, s] of seats.entries()) {
    if (![s.weight, s.length, s.width, s.height].every(n => Number.isFinite(n) && n > 0)) {
      const tag = seats.length > 1 ? `Місце ${i + 1}: в` : 'В';
      return NextResponse.json({ error: `${tag}кажіть вагу і всі три габарити` }, { status: 400 });
    }
  }
  const { weight, length, width, height, volume } = aggregateRozetkaSeats(seats);
  const places = seats.length > 1 ? seats.length : (Number(body.places) > 0 ? Number(body.places) : 1);

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
    // На нове (непідтверджене) замовлення Rozetka накладну не виписує, а помилка
    // в неї оманлива: «замовлення не існує або вже прив'язана ТТН» (#26091223, 24.09).
    const cabinetStatus = ((o.rozetka_data ?? {}) as { status?: unknown }).status;
    if (cabinetStatus === 1) {
      return NextResponse.json({
        error: `${tag}Замовлення ще не підтверджене в Rozetka — спочатку натисніть «Підтвердити», потім створюйте накладну`,
      }, { status: 409 });
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
  // тоді, коли стягувати нічого. Менеджер може виправити суму у вікні (як у
  // накладній НП); 0 — накладна без післяплати.
  const codAmount = body.codAmount != null
    ? Math.round(Number(body.codAmount) * 100) / 100
    : defaultCod(orders!);
  const description = ids.length > 1
    ? mergedDescription(orders!.map(o => ({ order_number: o.order_number, items: (o.items ?? []) as { name?: string }[] })))
    : ((order.items ?? []) as { name?: string }[]).map(i => i.name).filter(Boolean).join(', ');

  try {
    const ttn = await createRozetkaDeliveryTtn({
      orderId:     Number(order.rozetka_order_id),
      sender,
      params:      { weight, length, width, height, volume },
      places,
      description: body.description ?? description,
      hasPaid:     codAmount <= 0,
      codAmount,
    });

    const warnings: string[] = [];
    if (ttn.ttn) {
      // Що вписали в накладну — Seller API за номером вагу й габарити не віддає (lib/ttn-snapshot.ts)
      const dlv = ((order.rozetka_data ?? {}) as { delivery?: RozetkaOrder['delivery'] }).delivery ?? null;
      const snapshot: TtnSnapshot = {
        carrier: 'rozetka_delivery', ttn: ttn.ttn, created_at: new Date().toISOString(), created_by: user.email ?? null,
        cod: codAmount, cod_manual: body.codAmount != null,
        declared: numOrNull(ttn.declared_price),
        weight, dims: { length, width, height },
        places, seats: seats.length > 1 ? seats : null,
        payer: 'sender', description: body.description ?? description,
        sender: { name: sender.name, phone: sender.phones?.[0] ?? null, point: sender.address ?? null },
        recipient: {
          name: dlv?.recipient_title ?? null, phone: dlv?.recipient_phone ?? null,
          city: dlv?.city?.title ?? dlv?.city?.city_name ?? null,
          point: (order.delivery_address as string | null) ?? null,
        },
        orders: ids.length > 1 ? orders!.map(o => o.order_number as number) : null,
        result: { delivery_cost: numOrNull(ttn.delivery_price) },
      };
      await db.from('orders').update({ tracking_number: ttn.ttn, ttn_snapshot: snapshot }).in('id', ids);
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

import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '../../../../../../lib/auth-guard';
import { createServiceClient } from '../../../../../../lib/supabase';
import { syncDraftShipmentTracking } from '../../../../../../lib/accounting/completion';
import { RZ_DELIVERY_TYPE, RZ_TRACK_TYPE_DEPT, rzPhone, rzSplitName } from '../../../../../../lib/rz-delivery';
import { getRzSender, getRzBox, rzCreateTrack, rzLabel, rzDeleteTrack, rzSearchCities, rzDepartments, RzError } from '../../../../../../lib/rz-delivery-api';
import { mergedDescription } from '../../../../../../lib/orders/merge-ttn';
import type { TtnSnapshot } from '../../../../../../lib/ttn-snapshot';

/**
 * Знайти city_ref за назвою міста і UUID точки видачі. Потрібно для замовлень
 * Prom «Магазини Rozetka»: Prom шле warehouse_id з довідника ROZETKA Доставки,
 * а city_id — ні. Назви від Prom мають вигляд «м. Миколаїв (Миколаївська обл.)» —
 * дужки прибираємо, кандидатів перебираємо до першого, де точка справді є.
 */
async function resolveCityByWarehouse(cityName: string | null, warehouseId: string): Promise<string | null> {
  const query = (cityName ?? '').replace(/\(.*?\)/g, '').replace(/^(м|с|смт|с-ще)\.?\s*/i, '').trim();
  if (!query) return null;
  const cities = await rzSearchCities(query).catch(() => []);
  for (const c of cities.slice(0, 5)) {
    const deps = await rzDepartments((c as { id: string }).id).catch(() => []);
    if (deps.some(d => String((d as { id: string }).id) === warehouseId)) return (c as { id: string }).id;
  }
  return null;
}

/**
 * Експрес-накладна «ROZETKA Доставки» для замовлення сайту.
 *
 * Не плутати з сусіднім rozetka-delivery-ttn: там маркетплейсні замовлення й
 * Seller API, тут — наш власний договір партнера. Номери, баланс і облік різні,
 * тому обидва роути навмисно відмовляють чужому delivery_type.
 *
 * Гроші. `cost` — сума післяплати до стягнення; для передоплаченого замовлення
 * вона нуль, інакше Rozetka візьме з покупця гроші вдруге. Платника доставки
 * обирає менеджер у вікні створення (за замовчуванням отримувач) — від цього
 * залежить не лише каса на точці, а й проводки: варіант «платить продавець»
 * веде shipping_cost у витрати при доставці (lib/delivery-sync.ts).
 */

async function requireAdmin() {
  const auth = await requireStaff('admin');
  return auth.ok ? auth.user : null;
}

/** Післяплата за замовчуванням: лише неоплачені замовлення з оплатою при отриманні. */
function defaultCod(orders: { payment_type: unknown; payment_confirmed: unknown; total_price: unknown }[]): number {
  const sum = orders
    .filter(o => o.payment_type === 'cod' && !o.payment_confirmed)
    .reduce((s, o) => s + (Number(o.total_price) || 0), 0);
  return Math.round(sum * 100) / 100;
}

/**
 * Без параметрів — дані для модалки (відправник + коробка за замовчуванням +
 * післяплата з БД; `?merged=id1,id2` — для об'єднаної посилки).
 * З `?label=1` — PDF-етикетка вже створеної накладної, base64.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await requireAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  if (req.nextUrl.searchParams.get('label')) {
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

  const merged = (req.nextUrl.searchParams.get('merged') ?? '').split(',').map(s => s.trim()).filter(Boolean);
  const ids = [...new Set([id, ...merged])];
  const [sender, box, { data: orders }] = await Promise.all([
    getRzSender(),
    getRzBox(),
    createServiceClient().from('orders').select('id, payment_type, payment_confirmed, total_price').in('id', ids).limit(ids.length),
  ]);
  return NextResponse.json({
    sender: sender ? {
      point:    sender.department_label ?? '',
      city:     sender.city_name ?? '',
      limitKg:  sender.weight_limit_kg ?? null,
    } : null,
    box,
    cod: defaultCod(orders ?? []),
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  const body = await req.json().catch(() => ({})) as {
    weight?: number; length?: number; width?: number; height?: number;
    places?: number; description?: string; deliveryPayer?: string;
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

  // Платник доставки. Значення звіряємо зі списком, а не передаємо як є:
  // API приймає рівно 'sender' | 'receiver', а будь-яке інше слово тут — це
  // мовчазна відмова Rozetka вже на створенні накладної. За замовчуванням
  // отримувач: так працювало до появи вибору, і мовчки перекласти доставку
  // на себе через порожнє поле не можна — це гроші.
  const deliveryPayer: 'sender' | 'receiver' = body.deliveryPayer === 'sender' ? 'sender' : 'receiver';

  const box = await getRzBox();
  const weight = Number(body.weight);
  const length = Number(body.length ?? box.length);
  const width  = Number(body.width  ?? box.width);
  const height = Number(body.height ?? box.height);
  if (![weight, length, width, height].every(n => Number.isFinite(n) && n > 0)) {
    return NextResponse.json({ error: 'Вкажіть вагу і всі три габарити' }, { status: 400 });
  }

  // Об'єднана посилка: одна накладна на кілька замовлень одного покупця на одну
  // точку. Отримувач і точка — з основного замовлення; післяплата й оголошена
  // вартість — сумою по всіх.
  const ids = [...new Set([id, ...(Array.isArray(body.mergedIds) ? body.mergedIds.map(String) : [])])];

  const db = createServiceClient();
  const { data: orders, error } = await db
    .from('orders')
    // Один рядок навмисно: supabase-js виводить типи колонок із ЛІТЕРАЛУ select,
    // і склеєний з шматків рядок перетворює order на GenericStringError.
    .select('id, order_number, delivery_type, tracking_number, contact, phone, delivery_city_ref, delivery_city_name, delivery_warehouse_ref, delivery_address, total_price, payment_type, payment_confirmed, items')
    .in('id', ids)
    .limit(ids.length);

  const order = orders?.find(o => o.id === id);
  if (error || !order) return NextResponse.json({ error: 'Замовлення не знайдено' }, { status: 404 });
  if (orders!.length !== ids.length) return NextResponse.json({ error: 'Частину замовлень не знайдено' }, { status: 404 });
  for (const o of orders!) {
    const tag = ids.length > 1 ? `№${o.order_number}: ` : '';
    if (o.delivery_type !== RZ_DELIVERY_TYPE) {
      return NextResponse.json({ error: `${tag}Це не «ROZETKA Доставка»` }, { status: 400 });
    }
    if (o.tracking_number) {
      return NextResponse.json({ error: `${tag}Накладна вже створена: ${o.tracking_number}` }, { status: 409 });
    }
    if (!o.delivery_warehouse_ref) {
      return NextResponse.json({ error: `${tag}У замовленні немає точки видачі ROZETKA` }, { status: 400 });
    }
  }
  if (ids.length > 1) {
    if (new Set(orders!.map(o => o.delivery_warehouse_ref)).size > 1) {
      return NextResponse.json({ error: 'Різні точки видачі — одна посилка неможлива' }, { status: 400 });
    }
    const normPhone = (s: unknown) => String(s ?? '').replace(/\D/g, '').replace(/^38/, '');
    if (new Set(orders!.map(o => normPhone(o.phone))).size > 1) {
      return NextResponse.json({ error: 'Різні покупці — одна посилка неможлива' }, { status: 400 });
    }
  }
  // Пром-замовлення в «Магазини Rozetka» приходять із warehouse_id того ж
  // довідника, але БЕЗ city_id — знаходимо місто перебором кандидатів за назвою
  // і закріплюємо в замовленні, щоб наступного разу не шукати.
  let cityRef = order.delivery_city_ref as string | null;
  if (!cityRef) {
    cityRef = await resolveCityByWarehouse(order.delivery_city_name as string | null, order.delivery_warehouse_ref as string);
    if (!cityRef) {
      return NextResponse.json({ error: `Точку видачі ${order.delivery_warehouse_ref} не знайдено в довіднику ROZETKA Доставки (місто «${order.delivery_city_name ?? '—'}»)` }, { status: 400 });
    }
    await db.from('orders').update({ delivery_city_ref: cityRef }).eq('id', id);
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
  // Об'єднана посилка: оголошена вартість — усе, що в коробці; післяплата —
  // лише неоплачені замовлення (покупець платить на точці один раз за все).
  const total = orders!.reduce((s, o) => s + (Number(o.total_price) || 0), 0);
  if (total <= 0) return NextResponse.json({ error: 'Нульова сума замовлення' }, { status: 400 });

  // Післяплату менеджер може виправити у вікні (як у накладній НП) — домовленість
  // з покупцем, яка не варта правки замовлення. Без поля — сума з БД. Оголошена
  // вартість не може бути меншою за післяплату, тож піднімаємо її до неї.
  const codTotal = body.codAmount != null
    ? Math.round(Number(body.codAmount) * 100) / 100
    : defaultCod(orders!);
  const insurance = Math.max(total, codTotal);
  const items = (order.items ?? []) as { name?: string }[];
  const description = (body.description ?? (ids.length > 1
    ? mergedDescription(orders!.map(o => ({ order_number: o.order_number, items: (o.items ?? []) as { name?: string }[] })))
    : items.map(i => i.name).filter(Boolean).join(', '))).slice(0, 100);

  try {
    const track = await rzCreateTrack({
      visible_id:     orders!.map(o => o.order_number).join('+'),
      description,
      type:           RZ_TRACK_TYPE_DEPT,
      places:         Number(body.places) > 0 ? Number(body.places) : 1,
      delivery_payer: deliveryPayer,
      cost:           codTotal,
      insurance_cost: insurance,
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
        city:        cityRef,
        department:  order.delivery_warehouse_ref as string,
        first_name:  name.first_name,
        last_name:   name.last_name,
        ...(name.middle_name ? { middle_name: name.middle_name } : {}),
        phone,
      },
    });

    // Вартість доставки і комісія — на ОСНОВНОМУ замовленні: проводки по ЕН
    // ідемпотентні за номером (rz-payment-fee:<ЕН>), тож дублювати їх на решту
    // не можна — витрата подвоїлась би.
    // Що вписали в накладну — перевізник за номером цього не віддає (lib/ttn-snapshot.ts)
    const snapshot: TtnSnapshot = {
      carrier: 'rz_delivery', ttn: track.track_id, created_at: new Date().toISOString(), created_by: user.email ?? null,
      cod: codTotal, cod_manual: body.codAmount != null, declared: insurance,
      weight, dims: { length, width, height },
      places: Number(body.places) > 0 ? Number(body.places) : 1,
      payer: deliveryPayer, description,
      sender: {
        name: [sender.last_name, sender.first_name, sender.middle_name].filter(Boolean).join(' '),
        phone: sender.phone, city: sender.city_name ?? null, point: sender.department_label ?? null,
      },
      recipient: {
        name: [name.last_name, name.first_name, name.middle_name].filter(Boolean).join(' '),
        phone, city: (order.delivery_city_name as string | null) ?? null, point: (order.delivery_address as string | null) ?? null,
      },
      orders: ids.length > 1 ? orders!.map(o => o.order_number as number) : null,
      result: { delivery_cost: track.shipping_cost ?? null, payment_fee: track.payment_fee ?? null, delivery_date: track.delivery_date ?? null },
    };
    await db.from('orders').update({
      tracking_number:   track.track_id,
      rz_delivery_cost:  track.shipping_cost ?? null,
      rz_payment_fee:    track.payment_fee ?? null,
      rz_delivery_payer: deliveryPayer,
      ttn_snapshot:      snapshot,
    }).eq('id', order.id);
    if (ids.length > 1) {
      await db.from('orders').update({ tracking_number: track.track_id, rz_delivery_payer: deliveryPayer, ttn_snapshot: snapshot })
        .in('id', ids.filter(x => x !== order.id));
    }
    // Той самий номер — на непроведені РН, інакше синк доставки їх не знайде
    for (const oid of ids) await syncDraftShipmentTracking(oid, track.track_id);

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

import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '../../../../../../lib/auth-guard';
import { createServiceClient } from '../../../../../../lib/supabase';
import { npCall, getNpApiKey, npError, sanitizeNpNote } from '../../../../../../lib/np-api';

// Заявка на повернення в Новій Пошті прямо з журналу замовлень: клієнт не забрав
// посилку — повертаємо її на наше відділення, не чекаючи, поки НП поверне сама
// (за зберігання капає плата з першого ж дня після безкоштовного строку).
//
// НП-модель: AdditionalService, OrderType = 'orderCargoReturn'.
//   GET    — що можна зробити з цією ТТН: адреса повернення, причини, вартість зберігання
//   POST   — створити заявку
//   DELETE — скасувати заявку (доки НП її не обробила)

type ReturnAddress = {
  Ref: string; Type: string; NonCash: boolean;
  City: string; Address: string; Counterparty: string; ContactPerson: string; Phone: string;
};
type RefDescription = { Ref: string; Description: string };
type SavedReturn = { Ref: string; Number: string };
type TrackingDoc = {
  Status: string; StatusCode: string;
  PossibilityCreateReturn: boolean;
  StorageAmount: number; StoragePrice: number; DateFirstDayStorage: string;
  WarehouseRecipient: string;
};

// Причина «Відмова від доставки» — єдина, яку НП віддає для повернень; підтип за
// замовчуванням для «клієнт не забирає» обираємо за описом, а не за захардкодженим
// Ref: довідник НП може перевидати Ref, і тоді заявка мовчки падала б.
const DEFAULT_SUBTYPE_MATCH = 'Одержувач відмовився';

async function loadOrder(id: string) {
  const db = createServiceClient();
  const { data } = await db
    .from('orders')
    .select('id, order_number, tracking_number, np_return_ref, np_return_number, np_return_ttn, np_return_created_at')
    .eq('id', id)
    .single();
  return { db, order: data };
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff('admin', 'manager');
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const { order } = await loadOrder(id);
  if (!order) return NextResponse.json({ error: 'Замовлення не знайдено' }, { status: 404 });
  if (!order.tracking_number) return NextResponse.json({ error: 'У замовлення немає ТТН' }, { status: 400 });

  const apiKey = await getNpApiKey();
  if (!apiKey) return NextResponse.json({ error: 'API ключ НП не налаштовано' }, { status: 400 });

  const [check, reasons, tracking] = await Promise.all([
    npCall<ReturnAddress>(apiKey, 'AdditionalService', 'CheckPossibilityCreateReturn', { Number: order.tracking_number }),
    npCall<RefDescription>(apiKey, 'AdditionalService', 'getReturnReasons'),
    npCall<TrackingDoc>(apiKey, 'TrackingDocument', 'getStatusDocuments', {
      Documents: [{ DocumentNumber: order.tracking_number }],
    }),
  ]);

  const reason = reasons.data?.[0] ?? null;
  const subtypes = reason
    ? (await npCall<RefDescription>(apiKey, 'AdditionalService', 'getReturnReasonsSubtypes', { ReasonRef: reason.Ref })).data ?? []
    : [];

  const doc = tracking.data?.[0];

  return NextResponse.json({
    ttn: order.tracking_number,
    possible: check.success && !!check.data?.length,
    error: check.success ? null : npError(check, 'НП не дозволяє створити повернення по цій ТТН'),
    address: check.data?.[0] ?? null,
    reason,
    subtypes,
    defaultSubtypeRef: subtypes.find(s => s.Description.startsWith(DEFAULT_SUBTYPE_MATCH))?.Ref ?? subtypes[0]?.Ref ?? null,
    carrier: doc ? {
      status: doc.Status,
      statusCode: doc.StatusCode,
      warehouse: doc.WarehouseRecipient,
      storageDays: doc.StorageAmount,
      storagePrice: doc.StoragePrice,
      firstStorageDay: doc.DateFirstDayStorage,
    } : null,
    existing: order.np_return_ref ? {
      ref: order.np_return_ref,
      number: order.np_return_number,
      ttn: order.np_return_ttn,
      createdAt: order.np_return_created_at,
    } : null,
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const body = await req.json().catch(() => ({})) as {
    subtypeReasonRef?: string;
    reasonRef?: string;
    returnAddressRef?: string;
    note?: string;
  };

  const { db, order } = await loadOrder(id);
  if (!order) return NextResponse.json({ error: 'Замовлення не знайдено' }, { status: 404 });
  if (!order.tracking_number) return NextResponse.json({ error: 'У замовлення немає ТТН' }, { status: 400 });
  if (order.np_return_ref) {
    return NextResponse.json({ error: `Заявка на повернення вже створена (${order.np_return_number ?? order.np_return_ref})` }, { status: 409 });
  }

  const apiKey = await getNpApiKey();
  if (!apiKey) return NextResponse.json({ error: 'API ключ НП не налаштовано' }, { status: 400 });

  // Адресу повернення й спосіб оплати завжди беремо з живої відповіді НП, навіть
  // якщо клієнт щось передав: тільки CheckPossibility знає, чи повернення взагалі
  // можливе зараз (посилку могли видати або вже відправити назад автоматично).
  const check = await npCall<ReturnAddress>(apiKey, 'AdditionalService', 'CheckPossibilityCreateReturn', {
    Number: order.tracking_number,
  });
  const addr = check.data?.[0];
  if (!check.success || !addr) {
    return NextResponse.json({ error: npError(check, 'НП не дозволяє створити повернення по цій ТТН') }, { status: 400 });
  }

  let reasonRef = body.reasonRef;
  if (!reasonRef) {
    const reasons = await npCall<RefDescription>(apiKey, 'AdditionalService', 'getReturnReasons');
    reasonRef = reasons.data?.[0]?.Ref;
  }
  if (!reasonRef) return NextResponse.json({ error: 'Не вдалося отримати причини повернення від НП' }, { status: 502 });

  let subtypeRef = body.subtypeReasonRef;
  if (!subtypeRef) {
    const subtypes = await npCall<RefDescription>(apiKey, 'AdditionalService', 'getReturnReasonsSubtypes', { ReasonRef: reasonRef });
    subtypeRef = subtypes.data?.find(s => s.Description.startsWith(DEFAULT_SUBTYPE_MATCH))?.Ref ?? subtypes.data?.[0]?.Ref;
  }
  if (!subtypeRef) return NextResponse.json({ error: 'Не вдалося отримати підтип причини повернення від НП' }, { status: 502 });

  const note = sanitizeNpNote(body.note?.trim() || `Повернення по замовленню ${order.order_number}`);

  const saved = await npCall<SavedReturn>(apiKey, 'AdditionalService', 'save', {
    OrderType:        'orderCargoReturn',
    IntDocNumber:     order.tracking_number,
    PaymentMethod:    addr.NonCash ? 'NonCash' : 'Cash',
    Reason:           reasonRef,
    SubtypeReason:    subtypeRef,
    // Порожній Note НП приймає — краще без коментаря, ніж падіння на валідації
    ...(note ? { Note: note } : {}),
    ReturnAddressRef: body.returnAddressRef || addr.Ref,
  });

  if (!saved.success || !saved.data?.[0]?.Ref) {
    return NextResponse.json({ error: npError(saved, 'НП не створила заявку на повернення') }, { status: 400 });
  }

  const { Ref, Number: number } = saved.data[0];
  await db.from('orders').update({
    np_return_ref:        Ref,
    np_return_number:     number ?? null,
    np_return_created_at: new Date().toISOString(),
  }).eq('id', id);

  return NextResponse.json({
    ok: true,
    ref: Ref,
    number,
    returnTo: `${addr.City}, ${addr.Address}`,
    paymentMethod: addr.NonCash ? 'NonCash' : 'Cash',
  });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff('admin');
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const { db, order } = await loadOrder(id);
  if (!order) return NextResponse.json({ error: 'Замовлення не знайдено' }, { status: 404 });
  if (!order.np_return_ref) return NextResponse.json({ error: 'Заявки на повернення немає' }, { status: 400 });

  const apiKey = await getNpApiKey();
  if (!apiKey) return NextResponse.json({ error: 'API ключ НП не налаштовано' }, { status: 400 });

  const res = await npCall(apiKey, 'AdditionalService', 'delete', {
    Ref:       order.np_return_ref,
    OrderType: 'orderCargoReturn',
  });

  // Чистимо поля лише якщо НП справді скасувала заявку — інакше в базі зникне
  // Ref, за яким її ще можна скасувати вручну в кабінеті.
  if (!res.success) {
    return NextResponse.json({ error: npError(res, 'НП не скасувала заявку') }, { status: 400 });
  }

  await db.from('orders').update({
    np_return_ref: null, np_return_number: null, np_return_ttn: null, np_return_created_at: null,
  }).eq('id', id);

  return NextResponse.json({ ok: true });
}

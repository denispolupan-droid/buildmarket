import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '../../../../../../lib/supabase-server';
import { createServiceClient } from '../../../../../../lib/supabase-service';
import { requireStaff } from '../../../../../../lib/auth-guard';
import { npMarkingPdf, getNpApiKey } from '../../../../../../lib/np-api';
import { syncDraftShipmentTracking } from '../../../../../../lib/accounting/completion';
import { isManualPostalCarrier } from '../../../../../../lib/carriers';
import { withApi } from '../../../../../../lib/api-handler';

const NP_URL = 'https://api.novaposhta.ua/v2.0/json/';

async function npCall(apiKey: string, modelName: string, calledMethod: string, methodProperties: object) {
  const res = await fetch(NP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey, modelName, calledMethod, methodProperties }),
  });
  return res.json();
}

async function resolveRef(apiKey: string, ttnNumber: string): Promise<string | null> {
  // Try TrackingDocument first (fastest)
  const track = await npCall(apiKey, 'TrackingDocument', 'getStatusDocuments', {
    Documents: [{ DocumentNumber: ttnNumber }],
  });
  if (track.data?.[0]?.Ref) return track.data[0].Ref;

  // Fallback: scan last 7 days of InternetDocuments
  const today = new Date();
  const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
  const fmt = (d: Date) => `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`;

  const docs = await npCall(apiKey, 'InternetDocument', 'getDocumentList', {
    DateTimeFrom: fmt(weekAgo), DateTimeTo: fmt(today), GetFullList: '1', Page: '1',
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const found = (docs.data ?? []).find((d: any) => d.IntDocNumber === ttnNumber);
  return found?.Ref ?? null;
}

/**
 * ?label=1 — PDF маркування 100×100 для ТТН НП (base64), як у Rozetka-роутів.
 * Друкована форма живе не в api.novaposhta.ua, а на my.novaposhta.ua, і ключ
 * передається прямо в URL — тому тільки через цей проксі, щоб ключ не світився
 * в браузері. На чужу/неіснуючу ТТН НП віддає HTML-сторінку, а не PDF — ловимо
 * по магічних байтах.
 */
async function _GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireStaff();
  if (!auth.ok) return auth.response;
  if (!new URL(req.url).searchParams.get('label')) {
    return NextResponse.json({ error: 'Підтримується лише ?label=1' }, { status: 400 });
  }

  const { id } = await params;
  const db = createServiceClient();
  const { data: order } = await db
    .from('orders')
    .select('tracking_number, delivery_type')
    .eq('id', id)
    .maybeSingle();
  if (!order?.tracking_number) return NextResponse.json({ error: 'У замовлення немає ТТН' }, { status: 400 });
  if (!['nova', 'nova_poshta'].includes(order.delivery_type ?? '')) {
    return NextResponse.json({ error: 'Це не доставка Новою Поштою' }, { status: 400 });
  }

  const apiKey = await getNpApiKey();

  try {
    const buf = await npMarkingPdf(apiKey, [order.tracking_number]);
    return NextResponse.json({ label: buf.toString('base64') });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}

export const GET = withApi('admin/orders/[id]/ttn', _GET);

async function _DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const db = createServiceClient();

  const apiKey = await getNpApiKey();

  const { data: order, error: orderErr } = await db
    .from('orders')
    .select('tracking_number, tracking_ref, delivery_type')
    .eq('id', id)
    .single();

  if (orderErr || !order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  if (!order.tracking_number) return NextResponse.json({ error: 'Немає ТТН для видалення' }, { status: 400 });

  // Укрпошта / Meest: накладну оформлювали в кабінеті перевізника чи площадки,
  // НП про неї не знає. Раніше кошик усе одно йшов у НП (resolveRef + delete) —
  // тепер лише відв'язуємо номер, а саму накладну видаляють там, де створили.
  if (isManualPostalCarrier(order.delivery_type)) {
    await db.from('orders').update({ tracking_number: null, tracking_ref: null }).eq('id', id);
    await syncDraftShipmentTracking(id, null);
    return NextResponse.json({ ok: true, np_deleted: false, np_error: null });
  }

  // Get Ref — from DB or resolve via NP API
  const ref = order.tracking_ref ?? (apiKey ? await resolveRef(apiKey, order.tracking_number) : null);

  let npError: string | null = null;
  if (!apiKey) {
    npError = 'API ключ НП не налаштовано';
  } else if (ref) {
    const data = await npCall(apiKey, 'InternetDocument', 'delete', { DocumentRefs: [ref] });
    if (!data.success) npError = data.errors?.join('; ') ?? 'Помилка видалення в НП';
  } else {
    npError = 'Не вдалося знайти ТТН в кабінеті НП';
  }

  // Clear from DB regardless
  await db.from('orders').update({ tracking_number: null, tracking_ref: null }).eq('id', id);
  // І з непроведених РН: інакше чернетка лишиться з номером видаленої накладної,
  // і крон доставки шукатиме посилку, якої вже не існує.
  await syncDraftShipmentTracking(id, null);

  return NextResponse.json({ ok: true, np_deleted: !npError, np_error: npError });
}

export const DELETE = withApi('admin/orders/[id]/ttn', _DELETE);

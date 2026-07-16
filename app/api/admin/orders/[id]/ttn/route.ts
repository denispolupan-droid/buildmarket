import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '../../../../../../lib/supabase-server';
import { createServiceClient } from '../../../../../../lib/supabase';

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

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.user_metadata?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const db = createServiceClient();

  const { data: keyRow } = await db.from('app_settings').select('value').eq('key', 'np_api_key').maybeSingle();
  const apiKey = keyRow?.value || process.env.NOVA_POSHTA_API_KEY || '';

  const { data: order, error: orderErr } = await db
    .from('orders')
    .select('tracking_number, tracking_ref')
    .eq('id', id)
    .single();

  if (orderErr || !order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });
  if (!order.tracking_number) return NextResponse.json({ error: 'Немає ТТН для видалення' }, { status: 400 });

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

  return NextResponse.json({ ok: true, np_deleted: !npError, np_error: npError });
}

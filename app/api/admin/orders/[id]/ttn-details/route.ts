import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '../../../../../../lib/auth-guard';
import { createServiceClient } from '../../../../../../lib/supabase';
import { npCall, getNpApiKey } from '../../../../../../lib/np-api';
import { rzTrackStatuses } from '../../../../../../lib/rz-delivery-api';
import { RZ_DELIVERY_TYPE } from '../../../../../../lib/rz-delivery';
import { ROZETKA_DELIVERY_TYPE } from '../../../../../../lib/rozetka-delivery';
import { getRozetkaDeliveryTtns } from '../../../../../../lib/rozetka-delivery-ttn';
import { snapshotFor, type TtnCarrier, type TtnSnapshot } from '../../../../../../lib/ttn-snapshot';
import { buildTtnDetails, type NpLiveDoc, type RozetkaLiveTtn, type RzLiveStatus } from '../../../../../../lib/ttn-details';

/**
 * «Деталі ЕН»: що вписано в накладну замовлення — знімок при створенні
 * (orders.ttn_snapshot) плюс живі дані перевізника. Лише читання.
 *
 * Збій перевізника не валить відповідь: показуємо знімок і пишемо, чого не
 * вдалося отримати.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const db = createServiceClient();
  const { data: order } = await db
    .from('orders')
    .select('id, tracking_number, delivery_type, ttn_snapshot, rozetka_data, contact, phone, delivery_city_name, delivery_address, carrier_status_text, carrier_accepted_at, carrier_delivered_at, np_delivery_cost, np_delivery_payer, rz_delivery_cost, rz_payment_fee, rz_delivery_payer')
    .eq('id', id)
    .maybeSingle();
  if (!order) return NextResponse.json({ error: 'Замовлення не знайдено' }, { status: 404 });
  const ttn = String(order.tracking_number ?? '').trim();
  if (!ttn) return NextResponse.json({ error: 'У замовлення немає накладної' }, { status: 400 });

  const carrier: TtnCarrier = order.delivery_type === RZ_DELIVERY_TYPE ? 'rz_delivery'
    : order.delivery_type === ROZETKA_DELIVERY_TYPE ? 'rozetka_delivery'
    : 'np';

  // Об'єднана посилка: знімок міг записатись лише на основне замовлення
  let snapshot: TtnSnapshot | null = snapshotFor(order.ttn_snapshot, ttn);
  if (!snapshot) {
    const { data: siblings } = await db
      .from('orders').select('ttn_snapshot').eq('tracking_number', ttn).not('ttn_snapshot', 'is', null).limit(5);
    snapshot = (siblings ?? []).map(r => snapshotFor(r.ttn_snapshot, ttn)).find(Boolean) ?? null;
  }

  const liveErrors: string[] = [];
  let np: NpLiveDoc | null = null;
  let rozetka: RozetkaLiveTtn | null = null;
  let rzHistory: RzLiveStatus[] | null = null;

  try {
    if (carrier === 'np') {
      const apiKey = await getNpApiKey();
      if (!apiKey) throw new Error('API ключ НП не налаштовано');
      // Телефон отримувача (або відправника) — інакше НП ховає ПІБ і телефони
      const phone = String(order.phone ?? snapshot?.recipient?.phone ?? '').replace(/\D/g, '');
      const res = await npCall<NpLiveDoc>(apiKey, 'TrackingDocument', 'getStatusDocuments', {
        Documents: [{ DocumentNumber: ttn, ...(phone ? { Phone: phone } : {}) }],
      });
      np = res.data?.[0] ?? null;
      if (!res.success && !np) throw new Error(res.errors?.join('; ') || 'НП не відповіла');
      // StatusCode 3 — «номер не знайдено»: інших полів тоді немає
      if (np?.StatusCode === '3') { liveErrors.push('Нова Пошта не знайшла цей номер'); np = null; }
    } else if (carrier === 'rz_delivery') {
      const st = await rzTrackStatuses([ttn]);
      const row = st.find(x => x.track_id === ttn) ?? st[0];
      if (row) {
        rzHistory = (row.statuses?.length ? row.statuses : [row.last_status])
          .map(x => ({ status_name: x.status_name, date: x.date }));
      } else liveErrors.push('ROZETKA Доставка не знайшла цей номер');
    } else {
      // Seller API шукати за номером не вміє — беремо зі свіжого списку накладних
      const list = await getRozetkaDeliveryTtns(100);
      rozetka = list.find(t => t.ttn === ttn) ?? null;
      if (!rozetka) liveErrors.push('Накладної немає серед останніх 100 у кабінеті Rozetka — показуємо збережене');
    }
  } catch (err) {
    liveErrors.push(`Не вдалося отримати дані перевізника: ${err instanceof Error ? err.message : String(err)}`.slice(0, 300));
  }

  const details = buildTtnDetails({
    carrier, ttn, snapshot, np, rozetka, rzHistory,
    order: {
      contact: order.contact as string | null, phone: order.phone as string | null,
      delivery_city_name: order.delivery_city_name as string | null, delivery_address: order.delivery_address as string | null,
      carrier_status_text: order.carrier_status_text as string | null,
      carrier_accepted_at: order.carrier_accepted_at as string | null, carrier_delivered_at: order.carrier_delivered_at as string | null,
      np_delivery_cost: order.np_delivery_cost as number | null, np_delivery_payer: order.np_delivery_payer as string | null,
      rz_delivery_cost: order.rz_delivery_cost as number | null, rz_payment_fee: order.rz_payment_fee as number | null,
      rz_delivery_payer: order.rz_delivery_payer as string | null,
      rozetka_delivery: ((order.rozetka_data ?? {}) as { delivery?: TtnDetailsDelivery }).delivery ?? null,
    },
  });

  return NextResponse.json({ ...details, notes: [...liveErrors, ...details.notes] });
}

type TtnDetailsDelivery = { recipient_title?: string | null; recipient_phone?: string | null; city?: { title?: string; city_name?: string } | null };

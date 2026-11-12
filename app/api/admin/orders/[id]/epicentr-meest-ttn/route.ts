import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '../../../../../../lib/auth-guard';
import { createServiceClient } from '../../../../../../lib/supabase-service';
import { readSetting, writeSetting } from '../../../../../../lib/secrets';
import {
  getEpicentrOrder, advanceEpicentrOrder, epicentrRank, epicentrOrderPaid, createEpicentrShipment,
  getEpicentrShipmentFile, findEpicentrMeestSenderSettlements, getEpicentrMeestSenderOffices, type EpicentrOrder,
} from '../../../../../../lib/epicentr-api';
import {
  EPICENTR_MEEST_SENDER_KEY, buildEpicentrShipmentBody, epicentrMeestProvider, epicentrPhone, matchMeestOffice,
  meestSeatProblem, splitSenderName, type EpicentrMeestProvider, type ParcelBoxCell,
} from '../../../../../../lib/epicentr-meest';
import { getRozetkaSender, getRzSettingsContact } from '../../../../../../lib/rozetka-delivery-ttn';
import { getRzBox } from '../../../../../../lib/rz-delivery-api';
import { syncDraftShipmentTracking } from '../../../../../../lib/accounting/completion';
import type { TtnSnapshot } from '../../../../../../lib/ttn-snapshot';
import { withApi } from '../../../../../../lib/api-handler';
import { log } from '../../../../../../lib/log';

/**
 * Накладна Meest для доставки в поштомат чи пункт видачі Епіцентру (12.11.2026).
 *
 * Виписує її Епіцентр за нашим договором Meest — так само, як кнопка в кабінеті
 * (POST /v3/oms/orders/{id}/shipping/{provider}). Номер Епіцентр знає сам, тож у
 * кабінет його не пушимо; далі звичайний хвіст — відправка в нас, і outbox доводить
 * статус Епіцентру до «Відправлено» (ensureEpicentrTTN не перезаписує той самий номер).
 *
 * Здаємо посилки у відділення Meest, яке стоїть за точкою відправки Rozetka
 * (власник, 12.11: «з відділення, з якого відправляємо Rozetka»). Відділення
 * зберігається в app_settings.epicentr_meest_sender після першого підбору.
 */

type SavedSender = { settlementId: string; officeId: string; officeTitle: string; cityTitle: string };
type Sender = SavedSender & { name: string; phone: string };

async function resolveSender(): Promise<{ sender: Sender | null; problem?: string }> {
  const db = createServiceClient();
  const rz = await getRozetkaSender().catch(() => null);
  const contact = rz?.name ? { name: rz.name, phone: rz.phones?.[0] ?? '' } : await getRzSettingsContact().catch(() => null)
    .then(c => c ? { name: c.name, phone: c.phones[0] ?? '' } : null);
  if (!contact?.name) return { sender: null, problem: 'Немає ПІБ відправника — Налаштування → ROZETKA Доставка' };
  const phone = epicentrPhone(contact.phone);
  if (!phone) return { sender: null, problem: 'Немає телефону відправника — Налаштування → ROZETKA Доставка' };

  const raw = await readSetting(db, EPICENTR_MEEST_SENDER_KEY);
  if (raw) {
    try {
      const s = JSON.parse(raw) as SavedSender;
      if (s.settlementId && s.officeId) return { sender: { ...s, name: contact.name, phone } };
    } catch { /* підберемо заново */ }
  }

  // Перший раз — відділення Meest за адресою точки відправки Rozetka
  const city = (rz?.city_name ?? rz?.address?.split(',')[0] ?? '').replace(/^м\.\s*/i, '').trim();
  if (!city || !rz?.address) return { sender: null, problem: 'Не знайдено точку відправки Rozetka, від якої підібрати відділення Meest' };
  const settlements = await findEpicentrMeestSenderSettlements(city);
  const st = settlements.find(s => s.title.toLowerCase() === city.toLowerCase()) ?? settlements[0];
  if (!st) return { sender: null, problem: `Meest не знає місто «${city}»` };
  const office = matchMeestOffice(await getEpicentrMeestSenderOffices(st.id), rz.address);
  if (!office) return { sender: null, problem: `Не знайшли відділення Meest за адресою «${rz.address}»` };
  const saved: SavedSender = { settlementId: st.id, officeId: office.id, officeTitle: office.title, cityTitle: st.title };
  await writeSetting(db, EPICENTR_MEEST_SENDER_KEY, JSON.stringify(saved));
  log.info('epicentr.meest_sender_resolved', { city: st.title, office: office.title });
  return { sender: { ...saved, name: contact.name, phone } };
}

type OrderRow = {
  id: string; order_number: number; channel_code: string | null; epicentr_order_id: string | null;
  epicentr_data: unknown; tracking_number: string | null; total_price: number | null; status: string;
  items: { name?: string }[] | null; contact: string | null; phone: string | null;
  delivery_city_name: string | null; delivery_address: string | null;
};

async function loadOrder(id: string): Promise<{ order?: OrderRow; provider?: EpicentrMeestProvider; error?: string; status?: number }> {
  const { data } = await createServiceClient().from('orders')
    .select('id, order_number, channel_code, epicentr_order_id, epicentr_data, tracking_number, total_price, status, items, contact, phone, delivery_city_name, delivery_address')
    .eq('id', id).maybeSingle();
  const order = data as OrderRow | null;
  if (!order) return { error: 'Замовлення не знайдено', status: 404 };
  if (order.channel_code !== 'epicentr' || !order.epicentr_order_id) return { error: 'Це не замовлення Епіцентру', status: 400 };
  const provider = epicentrMeestProvider(order.epicentr_data);
  if (!provider) return { error: 'Доставка не в поштомат чи пункт видачі Епіцентру', status: 400 };
  return { order, provider };
}

const cellOf = (live: EpicentrOrder | null): ParcelBoxCell =>
  ((live?.office as { dimensions?: ParcelBoxCell } | undefined)?.dimensions) ?? null;

async function _GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff('admin', 'manager');
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const r = await loadOrder(id);
  if (!r.order) return NextResponse.json({ error: r.error }, { status: r.status });

  // ?label=1 — файл накладної для друку
  if (new URL(req.url).searchParams.get('label')) {
    if (!r.order.tracking_number) return NextResponse.json({ error: 'У замовлення немає накладної' }, { status: 400 });
    try {
      const file = await getEpicentrShipmentFile(r.provider!, r.order.tracking_number);
      if (!file) return NextResponse.json({ error: 'Епіцентр не віддав файл накладної' }, { status: 502 });
      return NextResponse.json({ label: file });
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
    }
  }

  const [{ sender, problem }, box, live] = await Promise.all([
    resolveSender().catch(err => ({ sender: null, problem: err instanceof Error ? err.message : String(err) })),
    getRzBox(),
    getEpicentrOrder(r.order.epicentr_order_id!).catch(() => null),
  ]);
  return NextResponse.json({
    provider: r.provider,
    sender: sender ? { name: sender.name, phone: sender.phone, office: sender.officeTitle, city: sender.cityTitle } : null,
    senderProblem: problem ?? null,
    box,
    declared: Number(r.order.total_price) || 0,
    cell: cellOf(live),
    point: [live?.settlement?.title, live?.office?.title].filter(Boolean).join(', ') || r.order.delivery_address,
    epicentrStatus: live?.statusCode ?? null,
  });
}

export const GET = withApi('admin/orders/[id]/epicentr-meest-ttn', _GET);

async function _POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff('admin', 'manager');
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const body = await req.json().catch(() => ({})) as { weight?: number; length?: number; width?: number; height?: number; declared?: number };

  const r = await loadOrder(id);
  if (!r.order) return NextResponse.json({ error: r.error }, { status: r.status });
  const order = r.order, provider = r.provider!;
  if (order.tracking_number) return NextResponse.json({ error: `Накладна вже є: ${order.tracking_number}` }, { status: 409 });
  if (!['confirmed', 'picking', 'awaiting_stock'].includes(order.status)) {
    return NextResponse.json({ error: 'Спершу підтвердіть замовлення' }, { status: 409 });
  }

  const epiId = order.epicentr_order_id!;
  const live = await getEpicentrOrder(epiId);
  if (!live) return NextResponse.json({ error: 'Епіцентр не знає цього замовлення' }, { status: 404 });
  if (live.address?.shipment?.number) {
    return NextResponse.json({ error: `В Епіцентрі вже є накладна ${live.address.shipment.number} — вставте її номер у замовлення` }, { status: 409 });
  }
  // Післяплату в ці точки ми не автоматизуємо: лише оплачені онлайн замовлення
  if (!epicentrOrderPaid(live)) {
    return NextResponse.json({ error: 'Замовлення не оплачене онлайн — накладну з післяплатою створіть у кабінеті Епіцентру' }, { status: 409 });
  }

  const seat = { weightKg: Number(body.weight), lengthCm: Number(body.length), widthCm: Number(body.width), heightCm: Number(body.height) };
  const problem = meestSeatProblem(seat, provider, cellOf(live));
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  const declared = body.declared != null && Number.isFinite(Number(body.declared)) && Number(body.declared) >= 0
    ? Number(body.declared) : Number(order.total_price) || 0;

  const { sender, problem: senderProblem } = await resolveSender();
  if (!sender) return NextResponse.json({ error: senderProblem ?? 'Не налаштовано відправника' }, { status: 422 });

  try {
    // Накладну Епіцентр приймає в статусі «Підтверджено» — доводимо покроково
    if (epicentrRank(live.statusCode) < epicentrRank('confirmed')) await advanceEpicentrOrder(epiId, 'confirmed', { live });

    const description = (order.items ?? []).map(i => i.name).filter(Boolean).join(', ');
    const payload = buildEpicentrShipmentBody({
      sender: { ...splitSenderName(sender.name), phone: sender.phone, settlementId: sender.settlementId, officeId: sender.officeId },
      seat, declared, description,
    });
    await createEpicentrShipment(epiId, provider, payload);

    // 201 без тіла — номер дочитуємо з картки
    let ttn: string | null = null;
    for (let i = 0; i < 4 && !ttn; i++) {
      if (i) await new Promise(res => setTimeout(res, 1500));
      ttn = (await getEpicentrOrder(epiId))?.address?.shipment?.number ?? null;
    }
    log.info('epicentr.meest_ttn_created', { order: order.order_number, epi: live.number, provider, ttn, seat, declared });
    if (!ttn) {
      return NextResponse.json({
        ok: true, ttn: null,
        warning: 'Епіцентр прийняв накладну, але номер ще не з\'явився — оновіть сторінку за хвилину (обмін підтягне його сам)',
      });
    }

    const snapshot: TtnSnapshot = {
      carrier: 'epicentr_meest', ttn, created_at: new Date().toISOString(), created_by: auth.user.email ?? null,
      cod: 0, declared, weight: seat.weightKg, dims: { length: seat.lengthCm, width: seat.widthCm, height: seat.heightCm },
      places: 1, payer: 'sender', description,
      sender: { name: sender.name, phone: sender.phone, city: sender.cityTitle, point: sender.officeTitle },
      recipient: { name: order.contact, phone: order.phone, city: order.delivery_city_name, point: order.delivery_address },
    };
    const db = createServiceClient();
    await db.from('orders').update({ tracking_number: ttn, ttn_snapshot: snapshot }).eq('id', id);
    await syncDraftShipmentTracking(id, ttn);
    return NextResponse.json({ ok: true, ttn });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error('epicentr.meest_ttn_failed', { order: order.order_number, provider, err: message });
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export const POST = withApi('admin/orders/[id]/epicentr-meest-ttn', _POST);

import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '../../../../../../lib/auth-guard';
import { createServiceClient } from '../../../../../../lib/supabase-service';
import {
  meestSearchCities, meestBranches, meestCalculate, meestCreateParcel, meestStickerPdf, meestSenderBranch,
  parseMeestPoint, meestFindPoint, type MeestPlace,
} from '../../../../../../lib/meest-ship';
import { epicentrPhone } from '../../../../../../lib/epicentr-meest';
import { getRozetkaSender, getRzSettingsContact } from '../../../../../../lib/rozetka-delivery-ttn';
import { getRzBox } from '../../../../../../lib/rz-delivery-api';
import { syncDraftShipmentTracking } from '../../../../../../lib/accounting/completion';
import type { TtnSnapshot } from '../../../../../../lib/ttn-snapshot';
import { withApi } from '../../../../../../lib/api-handler';
import { log } from '../../../../../../lib/log';

/**
 * Накладна Meest власним договором 10031120 (13.11.2026) — для замовлень сайту,
 * Rozetka й Prom з доставкою Meest. (Поштомати/ЦВЗ Епіцентру — окремий роут
 * epicentr-meest-ttn: там накладну виписує Епіцентр і доставку платить він.)
 *
 * GET            — дані для вікна: відправник, пункт одержувача (автопідбір за
 *                  адресою замовлення), коробка, оголошена, післяплата
 * GET ?cities=q  — пошук міста; ?branches=cityID — відділення й поштомати міста
 * GET ?label=1   — стікер 100×100 (PDF base64)
 * POST {calc:1}  — лише розрахунок вартості; POST — створити посилку
 */

type OrderRow = {
  id: string; order_number: number; channel_code: string | null; delivery_type: string | null; status: string;
  tracking_number: string | null; total_price: number | null; amount_paid: number | null; payment_type: string | null;
  payment_method_code: string | null; items: { name?: string }[] | null; contact: string | null; phone: string | null;
  delivery_city_name: string | null; delivery_address: string | null;
  delivery_city_ref: string | null; delivery_warehouse_ref: string | null;
};

async function loadOrder(id: string): Promise<{ order?: OrderRow; error?: string; status?: number }> {
  const { data } = await createServiceClient().from('orders')
    .select('id, order_number, channel_code, delivery_type, status, tracking_number, total_price, amount_paid, payment_type, payment_method_code, items, contact, phone, delivery_city_name, delivery_address, delivery_city_ref, delivery_warehouse_ref')
    .eq('id', id).maybeSingle();
  const order = data as OrderRow | null;
  if (!order) return { error: 'Замовлення не знайдено', status: 404 };
  if (order.channel_code === 'epicentr') return { error: 'Для Епіцентру накладну виписує Епіцентр — кнопка «Створити накладну Meest» Епіцентру', status: 400 };
  return { order };
}

async function senderContact(): Promise<{ name: string; phone: string } | null> {
  const rz = await getRozetkaSender().catch(() => null);
  const c = rz?.name ? { name: rz.name, phone: rz.phones?.[0] ?? '' } : await getRzSettingsContact().catch(() => null)
    .then(x => x ? { name: x.name, phone: x.phones[0] ?? '' } : null);
  const phone = epicentrPhone(c?.phone ?? '');
  return c?.name && phone ? { name: c.name, phone: `+${phone}` } : null;
}

/** Післяплата за замовчуванням: накладений платіж — залишок до сплати. */
function defaultCod(o: OrderRow): number {
  const isCod = o.payment_method_code === 'cod' || o.payment_type === 'cod';
  // Дропшип: amount_paid — закупка, яку партнер сплатив з балансу; наложка — уся сума клієнта
  if (isCod && o.channel_code === 'dropship') return Number(o.total_price) || 0;
  return isCod ? Math.max(0, Math.round(((Number(o.total_price) || 0) - (Number(o.amount_paid) || 0)) * 100) / 100) : 0;
}

async function _GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff('admin', 'manager');
  if (!auth.ok) return auth.response;
  const sp = new URL(req.url).searchParams;
  try {
    if (sp.get('cities') != null) return NextResponse.json({ cities: await meestSearchCities(sp.get('cities') ?? '') });
    if (sp.get('branches')) return NextResponse.json({ branches: await meestBranches(sp.get('branches')!) });

    const { id } = await params;
    const r = await loadOrder(id);
    if (!r.order) return NextResponse.json({ error: r.error }, { status: r.status });
    const order = r.order;

    if (sp.get('label')) {
      if (!order.tracking_number) return NextResponse.json({ error: 'У замовлення немає накладної' }, { status: 400 });
      return NextResponse.json({ label: (await meestStickerPdf([order.tracking_number])).toString('base64') });
    }

    const parsed = parseMeestPoint(order.delivery_address, order.delivery_city_name);
    // Замовлення сайту несе точний пункт (branchID/cityID з чекауту); маркетплейси — лише адресу
    const exact = async () => {
      if (!order.delivery_warehouse_ref || !order.delivery_city_ref) return null;
      const br = (await meestBranches(order.delivery_city_ref)).find(b => b.branchID === order.delivery_warehouse_ref);
      return br ? { city: { cityID: order.delivery_city_ref, name: order.delivery_city_name ?? '', region: '', district: '', hasBranches: true }, branch: br } : null;
    };
    const [sender, senderBranch, box, point] = await Promise.all([
      senderContact(), meestSenderBranch(), getRzBox(),
      exact().catch(() => null).then(e => e ?? (parsed ? meestFindPoint(parsed.city, parsed.number).catch(() => null) : null)),
    ]);
    return NextResponse.json({
      sender, senderBranch: senderBranch.title,
      box, declared: Number(order.total_price) || 0, cod: defaultCod(order),
      address: order.delivery_address, recipient: { name: order.contact, phone: order.phone },
      point: point ? { city: point.city, branch: point.branch } : null,
      cityHint: parsed?.city ?? order.delivery_city_name ?? null,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}

export const GET = withApi('admin/orders/[id]/meest-ttn', _GET);

type Body = {
  calc?: boolean; branchID?: string; cityID?: string; cityName?: string; branchTitle?: string;
  weight?: number; length?: number; width?: number; height?: number; declared?: number; cod?: number; receiverPays?: boolean;
};

async function _POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff('admin', 'manager');
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const b = await req.json().catch(() => ({})) as Body;
  const r = await loadOrder(id);
  if (!r.order) return NextResponse.json({ error: r.error }, { status: r.status });
  const order = r.order;

  if (!b.branchID || !b.cityID) return NextResponse.json({ error: 'Оберіть відділення або поштомат Meest' }, { status: 400 });
  const place: MeestPlace = {
    weight: Number(b.weight), length: Math.round(Number(b.length)), width: Math.round(Number(b.width)), height: Math.round(Number(b.height)),
    insurance: Math.max(0, Number(b.declared ?? order.total_price) || 0),
  };
  if (!(place.weight > 0) || !(place.length > 0) || !(place.width > 0) || !(place.height > 0)) {
    return NextResponse.json({ error: 'Вкажіть вагу й габарити місця' }, { status: 400 });
  }
  const cod = Math.max(0, Number(b.cod) || 0);

  try {
    if (b.calc) {
      return NextResponse.json(await meestCalculate({ receiverBranchID: b.branchID, receiverCityID: b.cityID, cod, places: [place] }));
    }
    if (order.tracking_number) return NextResponse.json({ error: `Накладна вже є: ${order.tracking_number}` }, { status: 409 });
    if (order.status === 'new' || order.status === 'cancelled') return NextResponse.json({ error: 'Спершу підтвердіть замовлення' }, { status: 409 });
    const sender = await senderContact();
    if (!sender) return NextResponse.json({ error: 'Немає ПІБ/телефону відправника — Налаштування → ROZETKA Доставка' }, { status: 422 });
    const phone = epicentrPhone(order.phone ?? '');
    if (!order.contact || !phone) return NextResponse.json({ error: 'У замовленні немає ПІБ чи телефону одержувача' }, { status: 400 });

    const description = (order.items ?? []).map(i => i.name).filter(Boolean).join(', ') || `Замовлення #${order.order_number}`;
    const parcel = await meestCreateParcel({
      orderNumber: order.order_number, sender,
      receiver: { name: order.contact, phone: `+${phone}`, branchID: b.branchID },
      places: [place], cod, receiverPays: b.receiverPays !== false, description,
    });
    const senderBranch = await meestSenderBranch();
    const snapshot: TtnSnapshot = {
      carrier: 'meest', ttn: parcel.barCode, created_at: new Date().toISOString(), created_by: auth.user.email ?? null,
      cod, declared: place.insurance, weight: place.weight, dims: { length: place.length, width: place.width, height: place.height },
      places: 1, payer: b.receiverPays !== false ? 'receiver' : 'sender', description,
      sender: { name: sender.name, phone: sender.phone, city: 'Харків', point: senderBranch.title },
      recipient: { name: order.contact, phone: order.phone, city: b.cityName ?? order.delivery_city_name, point: b.branchTitle ?? order.delivery_address },
      result: { delivery_cost: parcel.cost },
    };
    const db = createServiceClient();
    // parcelID — для видалення/редагування посилки до здачі
    await db.from('orders').update({ tracking_number: parcel.barCode, ttn_snapshot: { ...snapshot, meest_parcel_id: parcel.parcelID } as unknown as TtnSnapshot }).eq('id', id);
    await syncDraftShipmentTracking(id, parcel.barCode);
    log.info('meest.ttn_created', { order: order.order_number, ttn: parcel.barCode, cost: parcel.cost, cod, receiverPays: b.receiverPays !== false });
    return NextResponse.json({ ok: true, ttn: parcel.barCode, cost: parcel.cost });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error('meest.ttn_failed', { order: order.order_number, err: message });
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export const POST = withApi('admin/orders/[id]/meest-ttn', _POST);

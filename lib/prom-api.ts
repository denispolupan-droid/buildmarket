import { createClient } from '@supabase/supabase-js';

const PROM_BASE = 'https://my.prom.ua/api/v1';

async function getToken(): Promise<string> {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const { data } = await db.from('app_settings').select('value').eq('key', 'prom_api_token').maybeSingle();
  if (data?.value) return data.value as string;
  const token = process.env.PROM_API_TOKEN;
  if (!token) throw new Error('Токен Prom не налаштований. Встановіть його на сторінці /admin/prom');
  return token;
}

async function headers() {
  const token = await getToken();
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

async function promFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${PROM_BASE}${path}`, {
    ...init,
    headers: { ...(await headers()), ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Prom API ${path}: ${res.status} — ${text.slice(0, 300)}`);
  }
  return res.json() as Promise<T>;
}

/* ── Types (Prom.ua API shapes) ─────────────────────────────────────────── */

export interface PromProduct {
  id: number;
  external_id: string | null;
  name: string;
  sku: string | null;
  quantity: number;
  price: string;
  total_price: string;
  measure_unit: string;
  image?: string;
}

export interface PromOrder {
  id: number;
  date_created: string;
  client_first_name: string;
  client_last_name: string;
  client_second_name: string | null;
  client_phone: string | null;
  phone: string | null;          // фактичний телефон замовлення (client_phone часто null)
  client_email: string | null;
  email: string | null;
  status: string;
  status_name: string;
  full_price: string;
  price_delivery: string | null;
  comment: string | null;
  number: string | null;
  ttn: string | null;
  products: PromProduct[];
  delivery_address: string | null;        // готовий людський рядок адреси доставки
  delivery_option: {
    name: string;
    delivery_type: string;
    city: string | null;
    receive_type: string | null;
    warehouse: string | null;
    address: string | null;
  } | null;
  // Саме тут лежать Ref-и Нової Пошти, потрібні для ТТН (delivery_option їх НЕ має)
  delivery_provider_data: {
    provider: string | null;              // 'nova_poshta' | 'ukrposhta' | ...
    type: string | null;                  // 'W2W' (склад-склад) | 'W2D' (адресна) | ...
    recipient_address: {
      city_id: string | null;
      city_name: string | null;
      warehouse_id: string | null;
      recipient_warehouse_id: string | null;
      building_number: string | null;
      apartment_number: string | null;
    } | null;
  } | null;
  delivery_recipient: {
    phone: string | null;
    first_name: string | null;
    last_name: string | null;
    second_name: string | null;
  } | null;
  payment_option: {
    name: string;
    payment_type?: string;                // Prom часто НЕ віддає це поле (лише id+name)
  } | null;
  payment_data: {
    type: string | null;                  // 'evopay' (Пром-оплата) тощо
    status: string | null;                // 'paid' → передплата вже надійшла на Prom
  } | null;
}

interface OrdersListResponse {
  orders: PromOrder[];
}

/* ── Order queries ──────────────────────────────────────────────────────── */

// Prom API /orders/list мовчки повертає ПОРОЖНІЙ список, якщо date_from заданий
// у форматі з мілісекундами та Z (напр. "2026-07-20T18:10:44.174Z", саме такий
// дає Date.toISOString()). Приймається лише ISO без мілісекунд/зони. Через це
// синк роками тягнув 0 замовлень. Нормалізуємо будь-яку дату тут, на межі API.
export function promDateParam(s: string): string {
  return s.replace(/\.\d+/, '').replace(/Z$/, '');
}

export async function getPromOrders(opts: {
  dateFrom?: string;
  dateTo?: string;
  status?: string;
  limit?: number;
  lastId?: number;
}): Promise<PromOrder[]> {
  const params = new URLSearchParams();
  if (opts.dateFrom) params.set('date_from', promDateParam(opts.dateFrom));
  if (opts.dateTo)   params.set('date_to', promDateParam(opts.dateTo));
  if (opts.status)   params.set('status', opts.status);
  if (opts.limit)    params.set('limit', String(opts.limit));
  if (opts.lastId)   params.set('last_id', String(opts.lastId));

  const data = await promFetch<OrdersListResponse>(`/orders/list?${params.toString()}`);
  return data.orders ?? [];
}

/* ── Status push ────────────────────────────────────────────────────────── */

export type PromStatus = 'accepted' | 'declined' | 'delivered' | 'cancelled';

// Maps our internal statuses to Prom statuses
const STATUS_MAP: Record<string, PromStatus | null> = {
  confirmed: 'accepted',
  cancelled: 'declined',
  delivered: 'delivered',
  // 'shipped' has no direct Prom equivalent — we skip it
  shipped:   null,
  new:       null,
};

export function ourStatusToPromStatus(ourStatus: string): PromStatus | null {
  return STATUS_MAP[ourStatus] ?? null;
}

export async function setPromOrderStatus(promOrderId: number, status: PromStatus): Promise<void> {
  await promFetch('/orders/set_status', {
    method: 'POST',
    body: JSON.stringify({ ids: [promOrderId], status }),
  });
}

export async function setPromTTN(promOrderId: number, ttn: string, deliveryType = 'nova_poshta'): Promise<void> {
  await promFetch('/delivery/save_declaration_id', {
    method: 'POST',
    body: JSON.stringify({
      order_id:       promOrderId,
      declaration_id: ttn,
      delivery_type:  deliveryType,
    }),
  });
}

/* ── Product list ───────────────────────────────────────────────────────── */

export async function getPromProducts(opts: { limit?: number; lastId?: number } = {}): Promise<PromProduct[]> {
  const params = new URLSearchParams();
  params.set('limit', String(opts.limit ?? 100));
  if (opts.lastId) params.set('last_id', String(opts.lastId));
  const data = await promFetch<{ products: PromProduct[] }>(`/products/list?${params.toString()}`);
  return data.products ?? [];
}

/* ── Product stock/price update ─────────────────────────────────────────── */

export async function updatePromProducts(products: {
  id: number;
  price?: number;
  presence?: 'available' | 'not_available' | 'order';
  quantity?: number;
}[]): Promise<void> {
  await promFetch('/products/edit', {
    method: 'POST',
    body: JSON.stringify({ products }),
  });
}

/* ── Mapping helpers ────────────────────────────────────────────────────── */

// Prom віддає грошові поля рядком у людському форматі: "1 713 грн" (пробіл або
// nbsp як розділювач тисяч, кома як десятковий, суфікс валюти). parseFloat на
// такому дає 1 замість 1713 — тому чистимо все, крім цифр/десяткового знака.
export function parsePromNumber(s: string | null | undefined): number {
  if (s == null) return 0;
  const cleaned = String(s).replace(/[^\d,.-]/g, '').replace(',', '.');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

export function promOrderToOurFormat(order: PromOrder) {
  // Отримувач: delivery_recipient точніший за client_* (той може бути порожній)
  const rcp        = order.delivery_recipient;
  const firstName  = rcp?.first_name ?? order.client_first_name ?? '';
  const lastName   = rcp?.last_name  ?? order.client_last_name  ?? '';
  const contact    = [firstName, lastName].filter(Boolean).join(' ').trim() || 'Клієнт Prom';

  // Реквізити доставки для ТТН лежать у delivery_provider_data (Ref-и НП),
  // а delivery_option містить лише назву служби. Людський рядок адреси —
  // у top-level delivery_address.
  const prov = order.delivery_provider_data;
  const ra   = prov?.recipient_address;

  let deliveryType         = 'nova_poshta';
  if (prov?.provider === 'ukrposhta')    deliveryType = 'ukrposhta';
  else if (prov?.provider === 'nova_poshta') deliveryType = 'nova_poshta';
  else if (order.delivery_option?.delivery_type) deliveryType = order.delivery_option.delivery_type;

  let deliveryCityRef: string | null      = null;
  let deliveryWarehouseRef: string | null = null;
  let deliveryCityName: string | null     = null;
  let deliverySubtype: string | null      = null;
  if (prov?.provider === 'nova_poshta' && ra) {
    deliveryCityRef      = ra.city_id ?? null;
    deliveryWarehouseRef = ra.recipient_warehouse_id ?? ra.warehouse_id ?? null;
    deliveryCityName     = ra.city_name ?? null;
    // building_number заповнений тільки для адресної доставки (двері), інакше склад
    deliverySubtype      = ra.building_number ? 'address' : 'warehouse';
  }

  const del = order.delivery_option;
  const deliveryAddress =
    order.delivery_address ||
    (del ? [del.city, del.warehouse ?? del.address].filter(Boolean).join(', ') : '') ||
    '';

  // Спосіб оплати. Prom часто НЕ віддає payment_option.payment_type — лише name,
  // тому класифікуємо по name + payment_data. «Пром-оплата» (evopay, status=paid)
  // — це передоплата, яка ВЖЕ надійшла на Prom (не безнал-рахунок до сплати).
  const payName    = (order.payment_option?.name ?? '').toLowerCase();
  const payType    = order.payment_option?.payment_type ?? '';
  const isPrepaid  = order.payment_data?.status === 'paid';   // гроші вже на Prom
  let paymentType: string;
  if (payType === 'cash_on_delivery' || /наклад/.test(payName)) paymentType = 'cod';
  else if (isPrepaid)                                            paymentType = 'prepaid';
  else if (payType === 'cash' || /готів/.test(payName))         paymentType = 'cash';
  else                                                          paymentType = 'invoice';
  // Передоплата на Prom = замовлення вже оплачене з боку покупця (Prom розрахується
  // з нами при виплаті). Позначаємо оплаченим, щоб адмінка не вимагала оплату.
  const paid = isPrepaid;

  const items = order.products.map(p => ({
    sku:   p.external_id ?? p.sku ?? '',
    name:  p.name,
    brand: '',
    qty:   p.quantity,
    price: parsePromNumber(p.price),
  }));

  const totalPrice = parsePromNumber(order.full_price) || items.reduce((s, i) => s + i.qty * i.price, 0);

  return {
    contact,
    phone:            rcp?.phone ?? order.phone ?? order.client_phone ?? '',
    email:            order.email ?? order.client_email ?? '',
    delivery_type:    deliveryType,
    delivery_subtype: deliverySubtype,
    delivery_address: deliveryAddress,
    delivery_city_ref:      deliveryCityRef,
    delivery_city_name:     deliveryCityName,
    delivery_warehouse_ref: deliveryWarehouseRef,
    payment_type:     paymentType,
    paid,
    comment:          order.comment ?? null,
    items,
    total_price:      totalPrice,
    status:           'new' as const,
    channel_code:     'prom' as const,
    prom_order_id:    order.id,
    prom_data:        order,
  };
}

const PROM_BASE = 'https://my.prom.ua/api/v1';

function headers() {
  const token = process.env.PROM_API_TOKEN;
  if (!token) throw new Error('PROM_API_TOKEN is not set');
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

async function promFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${PROM_BASE}${path}`, {
    ...init,
    headers: { ...headers(), ...(init?.headers ?? {}) },
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
  client_phone: string;
  client_email: string | null;
  status: string;
  status_name: string;
  full_price: string;
  price_delivery: string | null;
  comment: string | null;
  number: string | null;
  ttn: string | null;
  products: PromProduct[];
  delivery_option: {
    name: string;
    delivery_type: string;
    city: string | null;
    receive_type: string | null;
    warehouse: string | null;
    address: string | null;
  } | null;
  payment_option: {
    name: string;
    payment_type: string;
  } | null;
}

interface OrdersListResponse {
  orders: PromOrder[];
}

/* ── Order queries ──────────────────────────────────────────────────────── */

export async function getPromOrders(opts: {
  dateFrom?: string;
  dateTo?: string;
  status?: string;
  limit?: number;
  lastId?: number;
}): Promise<PromOrder[]> {
  const params = new URLSearchParams();
  if (opts.dateFrom) params.set('date_from', opts.dateFrom);
  if (opts.dateTo)   params.set('date_to', opts.dateTo);
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

export function promOrderToOurFormat(order: PromOrder) {
  const firstName  = order.client_first_name ?? '';
  const lastName   = order.client_last_name  ?? '';
  const contact    = [firstName, lastName].filter(Boolean).join(' ').trim() || 'Клієнт Prom';

  const del = order.delivery_option;
  let deliveryType    = 'nova_poshta';
  let deliveryAddress = '';

  if (del) {
    if (del.delivery_type === 'nova_poshta')    deliveryType = 'nova_poshta';
    else if (del.delivery_type === 'ukrposhta') deliveryType = 'ukrposhta';
    else if (del.delivery_type === 'courier')   deliveryType = 'courier';
    else if (del.delivery_type === 'pickup')    deliveryType = 'pickup';
    else                                         deliveryType = 'nova_poshta';

    const parts = [del.city, del.warehouse ?? del.address].filter(Boolean);
    deliveryAddress = parts.join(', ');
  }

  const pay = order.payment_option;
  let paymentType = 'cod';
  if (pay) {
    if (pay.payment_type === 'cash_on_delivery') paymentType = 'cod';
    else if (pay.payment_type === 'cash')         paymentType = 'cash';
    else                                           paymentType = 'invoice';
  }

  const items = order.products.map(p => ({
    sku:   p.external_id ?? p.sku ?? '',
    name:  p.name,
    brand: '',
    qty:   p.quantity,
    price: parseFloat(p.price) || 0,
  }));

  const totalPrice = parseFloat(order.full_price) || items.reduce((s, i) => s + i.qty * i.price, 0);

  return {
    contact,
    phone:            order.client_phone  ?? '',
    email:            order.client_email  ?? '',
    delivery_type:    deliveryType,
    delivery_address: deliveryAddress,
    payment_type:     paymentType,
    comment:          order.comment ?? null,
    items,
    total_price:      totalPrice,
    status:           'new' as const,
    channel_code:     'prom' as const,
    prom_order_id:    order.id,
    prom_data:        order,
  };
}

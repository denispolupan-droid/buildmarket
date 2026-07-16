import { createClient } from '@supabase/supabase-js';

// Base host for the Rozetka Seller API — confirmed against the official apiDoc spec at
// https://api-seller.rozetka.com.ua/apidoc/ (endpoints documented there, e.g. POST /sites,
// GET /orders/search, are relative to this same host). Verify against a real response on
// first live sync — the docs site's own base URL isn't stated explicitly anywhere.
const ROZETKA_BASE = 'https://api-seller.rozetka.com.ua';

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function getSetting(key: string): Promise<string | null> {
  const { data } = await db().from('app_settings').select('value').eq('key', key).maybeSingle();
  return (data?.value as string | undefined) ?? null;
}

async function setSetting(key: string, value: string): Promise<void> {
  await db().from('app_settings').upsert({ key, value }, { onConflict: 'key' });
}

/* ── Auth: Rozetka tokens expire after 24h (unlike Prom's static token), so we log in with the
   seller's username/password whenever the cached token is missing or close to expiring, and
   cache the fresh token + its expiry in app_settings. ── */

async function loginAndCacheToken(): Promise<string> {
  const username = await getSetting('rozetka_login');
  const password = await getSetting('rozetka_password');
  if (!username || !password) {
    throw new Error('Rozetka логін/пароль не налаштовані. Встановіть їх на сторінці /admin/rozetka');
  }

  const res = await fetch(`${ROZETKA_BASE}/sites`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: Buffer.from(password).toString('base64') }),
  });
  const json = await res.json() as { success: boolean; content?: { access_token: string }; message?: string };
  if (!res.ok || !json.success || !json.content?.access_token) {
    throw new Error(`Rozetka login failed: ${res.status} — ${json.message ?? await res.text().catch(() => '')}`);
  }

  const token = json.content.access_token;
  // Docs state tokens last 24h; cache with a safety margin so we never fire a request on an
  // about-to-expire token mid-flight.
  const expiresAt = new Date(Date.now() + 22 * 60 * 60 * 1000).toISOString();
  await setSetting('rozetka_token', token);
  await setSetting('rozetka_token_expires_at', expiresAt);
  return token;
}

async function getValidToken(): Promise<string> {
  const [token, expiresAt] = await Promise.all([
    getSetting('rozetka_token'),
    getSetting('rozetka_token_expires_at'),
  ]);
  if (token && expiresAt && new Date(expiresAt).getTime() > Date.now() + 5 * 60 * 1000) {
    return token;
  }
  return loginAndCacheToken();
}

async function rozetkaFetch<T>(path: string, init?: RequestInit, _retried = false): Promise<T> {
  const token = await getValidToken();
  const res = await fetch(`${ROZETKA_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  // Token might have been revoked/expired server-side even though our cached expiry said it
  // was still good — force one re-login and retry, same as any other transient-auth pattern.
  if (res.status === 401 && !_retried) {
    await loginAndCacheToken();
    return rozetkaFetch<T>(path, init, true);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Rozetka API ${path}: ${res.status} — ${text.slice(0, 300)}`);
  }
  const json = await res.json() as { success: boolean; content: T; message?: string };
  if (!json.success) throw new Error(`Rozetka API ${path}: ${json.message ?? 'unsuccessful response'}`);
  return json.content;
}

/* ── Types (Rozetka Seller API shapes — field names confirmed against the official apiDoc spec) ── */

export interface RozetkaPurchase {
  id: number;
  item_id: number;
  item_name: string;
  quantity: number;
  price: number;
  price_with_discount: number;
  item?: { article?: string | null };
}

export interface RozetkaOrder {
  id: number;
  created: string;
  changed: string;
  status: number;
  status_group: 1 | 2 | 3; // 1 processing, 2 success, 3 cancelled/failed
  amount: string;
  cost: string;
  cost_with_discount: string;
  comment: string | null;
  user_phone: string | null;
  user_title?: { full_name: string | null };
  ttn: string | null;
  purchases?: RozetkaPurchase[];
  delivery?: {
    delivery_service_id: number;
    delivery_service_name: string;
    recipient_title: string | null;
    recipient_phone: string | null;
    place_street: string | null;
    place_number: string | null;
    place_house: string | null;
    place_flat: string | null;
    email: string | null;
    city?: { city_name: string; title: string } | null;
  } | null;
  payment?: { payment_type: string; payment_method_name: string } | null;
}

interface OrderSearchResponse {
  orders: RozetkaOrder[];
  _meta: { totalCount: number; pageCount: number; currentPage: number; perPage: number };
}

const EXPAND = 'user,delivery,delivery_service,purchases,payment,status_data';

/* ── Order queries ──────────────────────────────────────────────────────── */

export async function getRozetkaOrders(opts: {
  createdFrom?: string; // YYYY-MM-DD
  statusGroup?: 1 | 2 | 3;
  page?: number;
}): Promise<RozetkaOrder[]> {
  const params = new URLSearchParams({ expand: EXPAND, sort: '-id' });
  if (opts.createdFrom) params.set('created_from', opts.createdFrom);
  if (opts.statusGroup) params.set('type', String(opts.statusGroup));
  if (opts.page) params.set('page', String(opts.page));

  const data = await rozetkaFetch<OrderSearchResponse>(`/orders/search?${params.toString()}`);
  return data.orders ?? [];
}

/* ── Status push ────────────────────────────────────────────────────────── */

// Status IDs confirmed live against this seller's account via GET /order-statuses/search
// (the written apiDoc spec's field names/shape were wrong — see getRozetkaOrderStatuses below).
export async function setRozetkaOrderStatus(
  orderId: number,
  status: number,
  opts?: { ttn?: string; comment?: string },
): Promise<void> {
  await rozetkaFetch(`/orders/${orderId}`, {
    method: 'PUT',
    body: JSON.stringify({ status, ttn: opts?.ttn, seller_comment: opts?.comment }),
  });
}

export interface RozetkaOrderStatus {
  id: number;
  name: string;
  name_uk: string;
  status_group: 1 | 2 | 3;
  title: string;
}

export async function getRozetkaOrderStatuses(): Promise<RozetkaOrderStatus[]> {
  // Live response shape differs from the written apiDoc: the key is `orderStatuses` (plural)
  // and the localized field is `name_uk`, not `orderStatus`/`name_ua` as documented.
  const data = await rozetkaFetch<{ orderStatuses: RozetkaOrderStatus[] }>('/order-statuses/search');
  return data.orderStatuses ?? [];
}

// Maps our internal order.status to this seller account's real Rozetka status IDs (confirmed
// live, see getRozetkaOrderStatuses). null = no push for that transition (mirrors
// lib/prom-api.ts's STATUS_MAP pattern). 'new'/'awaiting_stock'/'picking' are internal states
// with no clean Rozetka equivalent — Rozetka already has its own "new order" status when the
// order first lands, so we don't touch it until our side actually confirms/ships/etc.
const STATUS_MAP: Record<string, number | null> = {
  new:            null,
  confirmed:      2,  // Комплектується. Дані підтверджені
  awaiting_stock: null,
  picking:        null,
  shipped:        3,  // Передано до служби доставки (ttn required)
  delivered:      6,  // Замовлення виконано
  cancelled:      13, // Скасовано адміністратором
};

export function ourStatusToRozetkaStatus(ourStatus: string): number | null {
  return STATUS_MAP[ourStatus] ?? null;
}

/* ── Mapping helpers ────────────────────────────────────────────────────── */

export function rozetkaOrderToOurFormat(order: RozetkaOrder) {
  const contact = order.user_title?.full_name?.trim()
    || order.delivery?.recipient_title?.trim()
    || 'Клієнт Rozetka';

  const del = order.delivery;
  const cityName = del?.city?.city_name ?? del?.city?.title ?? '';
  const addressParts = [
    del?.place_number ? `Відділення №${del.place_number}` : null,
    del?.place_street,
    del?.place_house,
    del?.place_flat ? `кв. ${del.place_flat}` : null,
  ].filter(Boolean);
  const deliveryAddress = [cityName, ...addressParts].filter(Boolean).join(', ');

  // delivery_service_name isn't a fixed enum on Rozetka's side — normalize the common case
  // (Nova Poshta) and fall back to a generic "courier" bucket otherwise, matching the shape
  // the rest of the app (Prom sync, order form) already uses for delivery_type.
  const serviceName = (del?.delivery_service_name ?? '').toLowerCase();
  const deliveryType = serviceName.includes('нова') || serviceName.includes('пошта')
    ? 'nova_poshta'
    : 'courier';

  const paymentType = order.payment?.payment_type === 'cash' ? 'cod' : 'invoice';

  const items = (order.purchases ?? []).map(p => ({
    sku:   p.item?.article ?? '',
    name:  p.item_name,
    brand: '',
    qty:   p.quantity,
    price: Number(p.price_with_discount ?? p.price) || 0,
  }));

  const totalPrice = Number(order.cost_with_discount ?? order.cost ?? order.amount) || 0;

  return {
    contact,
    phone:            order.user_phone ?? del?.recipient_phone ?? '',
    email:            del?.email ?? '',
    delivery_type:    deliveryType,
    delivery_address: deliveryAddress,
    payment_type:     paymentType,
    comment:          order.comment,
    items,
    total_price:      totalPrice,
    status:           'new' as const,
    channel_code:     'rozetka' as const,
    rozetka_order_id: order.id,
    rozetka_data:     order,
  };
}

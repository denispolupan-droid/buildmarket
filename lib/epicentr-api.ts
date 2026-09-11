/**
 * Клієнт Merchant API маркетплейсу Епіцентр (merchant-api.epicentrm.com.ua).
 *
 * Специфікація: https://merchant-api.epicentrm.com.ua/swagger/ (yaml —
 * /swagger/swagger.yaml, укр. — /swagger/swagger.ukr.yaml). Інструкція для
 * продавця: https://supportm.epicentrk.ua/robotazapi.
 *
 * Що вміє API (перевірено 2026-09-08 живим ключем):
 *   • замовлення: список з курсорною пагінацією (/v4/oms/orders), картка
 *     (/v6/oms/orders/{id}), зміна статусу, ТТН, коментарі, деталізація комісії
 *     (/v1/billing/orders/{id}/invoice);
 *   • офери: масове оновлення ціни/наявності за SKU (/v1/offers, до 200 за раз).
 *   Каталог (картки товарів) через API НЕ заводиться — лише XML-фід у кабінеті.
 *
 * Авторизація: `Authorization: Bearer mp_…` (ключ з кабінету, без терміну дії).
 * Схема X-WSSE зі свагера для mp-ключа НЕ працює («Auth token is not provided»).
 * Ключ: app_settings.epicentr_api_token, fallback — env EPICENTR_API_TOKEN.
 *
 * Усі дати API — UTC.
 */
import { createClient } from '@supabase/supabase-js';
import { resolveDeliverySubtype } from './np-postomat';
import { fromEpicentrId, toEpicentrId } from './epicentr-availability';

export const EPICENTR_BASE = 'https://merchant-api.epicentrm.com.ua';
export const EPICENTR_TOKEN_KEY = 'epicentr_api_token';

async function getToken(): Promise<string> {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const { data } = await db.from('app_settings').select('value').eq('key', EPICENTR_TOKEN_KEY).maybeSingle();
  if (data?.value) return data.value as string;
  const token = process.env.EPICENTR_API_TOKEN;
  if (!token) throw new Error('Ключ API Епіцентру не налаштований. Вкажіть його на сторінці /admin/epicentr');
  return token;
}

/** Чи є ключ узагалі (без кидання помилки) — для кронів і дашборда. */
export async function hasEpicentrToken(): Promise<boolean> {
  try { await getToken(); return true; } catch { return false; }
}

export async function epicentrFetch<T>(path: string, init?: RequestInit, token?: string): Promise<T> {
  const res = await fetch(`${EPICENTR_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token ?? await getToken()}`,
      accept: 'application/json',
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Epicentr API ${path}: ${res.status} — ${text.slice(0, 300)}`);
  }
  // 202/204 без тіла (зміна статусу, ТТН, дані доставки)
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

/* ── Типи (форми Merchant API) ──────────────────────────────────────────── */

export type EpicentrOrderStatus =
  | 'new' | 'confirmed_by_merchant' | 'confirmed' | 'sent' | 'received' | 'delivered'
  | 'completed' | 'closed' | 'canceled' | 'returned' | 'return_requested'
  | 'canceled_by_merchant' | 'completed_merchant_rejection' | 'closed_merchant_rejection';

export type EpicentrDeliveryProvider =
  | 'nova_poshta' | 'ukrposhta' | 'pickup' | 'meest' | 'cvz_epicentr' | 'parcel_box_epicentr' | 'courier_delivery';

export type EpicentrPaymentProvider =
  | 'pay_on_pickup' | 'pay_on_delivery' | 'easypay' | 'monobank' | 'invoice' | 'prepayment' | 'credit_pravexbank'
  | (string & {});

export interface EpicentrOrderItem {
  offerId: string;
  productId: string;
  productExternalId?: string;   // наш артикул, якщо картка заведена з фіда
  sku: string;
  title: string;
  image?: string;
  url?: string;
  price: number;
  quantity: number;
  subtotal?: number;
  measure?: string | null;
  ratio?: number;
}

export interface EpicentrOrder {
  id: string;                     // UUID
  externalId?: string | null;
  number: string;                 // людський номер замовлення
  companyId: string;
  createdAt: string;
  updatedAt?: string | null;
  statusCode: EpicentrOrderStatus;
  callStatus?: 'success' | 'first_fail' | 'second_fail' | 'email_sent' | null;
  subtotal: number;
  payed: boolean;
  skipCustomerContact: boolean;
  comment: string;
  commentsCount?: number;
  items: EpicentrOrderItem[];
  address: {
    firstName: string;
    lastName: string;
    patronymic?: string;
    email: string;
    phone: string;
    isAlternateRecipient: boolean;
    recipient: { firstName: string; lastName: string; patronymic?: string; phone: string };
    payerName?: string | null;
    govNumber?: string | null;
    shipment: {
      provider: EpicentrDeliveryProvider | null;
      paymentProvider?: EpicentrPaymentProvider;
      paymentStatus?: 'none' | 'payment_waiting' | 'payment_canceled' | 'hold_set' | 'hold_unset' | 'hold_canceled';
      settlementId: string | null;
      officeId: string | null;
      number: string | null;      // ТТН
      isFree: boolean;
      deliveryPrice?: number;
      house?: string;
      apartment?: string | null;
      comment?: string | null;
    };
  };
  cancel?: {
    previousStatusCode: EpicentrOrderStatus;
    initiatorCode: string;
    reasonCode: string;
    comment: string;
    reasonTranslationKey: string;
    createdAt: string;
  } | null;
  // Лише в картці /v6: населений пункт і відділення перевізника людськими назвами
  settlement?: { id?: string; title?: string; name?: string; region?: string; area?: string } & Record<string, unknown>;
  office?: { id?: string; title?: string; name?: string; address?: string; number?: string } & Record<string, unknown>;
  hasPreOrderItems?: boolean;
}

interface CursorPage<T> { items: T[]; limit: number; current: string | null; next: string | null; prev: string | null; last: string | null }

/* ── Замовлення ─────────────────────────────────────────────────────────── */

/**
 * Список замовлень з курсорною пагінацією. Фільтри — квадратні дужки в query
 * (filter[updatedAt][from]=…, filter[statusCode][]=new).
 */
export async function getEpicentrOrders(opts: {
  updatedFrom?: string;       // ISO, UTC
  createdFrom?: string;
  statuses?: EpicentrOrderStatus[];
  limit?: number;             // за сторінку (дефолт API 25)
  maxPages?: number;
} = {}): Promise<EpicentrOrder[]> {
  const params = new URLSearchParams();
  if (opts.updatedFrom) params.set('filter[updatedAt][from]', opts.updatedFrom);
  if (opts.createdFrom) params.set('filter[createdAt][from]', opts.createdFrom);
  for (const s of opts.statuses ?? []) params.append('filter[statusCode][]', s);
  params.append('sort[]', '-createdAt');
  params.set('limit', String(opts.limit ?? 50));

  const out: EpicentrOrder[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < (opts.maxPages ?? 20); page++) {
    if (cursor) params.set('cursor', cursor); else params.delete('cursor');
    const data: CursorPage<EpicentrOrder> = await epicentrFetch(`/v4/oms/orders?${params.toString()}`);
    out.push(...(data.items ?? []));
    if (!data.next || !data.items?.length) break;
    cursor = data.next;
  }
  return out;
}

/** Картка замовлення (v6 — актуальна; v5 оголошена застарілою з 01.01.2027). */
export async function getEpicentrOrder(orderId: string): Promise<EpicentrOrder | null> {
  try {
    return await epicentrFetch<EpicentrOrder>(`/v6/oms/orders/${orderId}`);
  } catch (err) {
    if (err instanceof Error && /: 404 /.test(err.message)) return null;
    throw err;
  }
}

/** Статуси, у які замовлення можна перевести прямо зараз (Епіцентр вирішує сам). */
export async function getEpicentrAllowedStatuses(orderId: string): Promise<EpicentrOrderStatus[]> {
  const data = await epicentrFetch<{ items?: { code: EpicentrOrderStatus }[] }>(`/v2/oms/orders/${orderId}/allowed-statuses`);
  return (data?.items ?? []).map(i => i.code);
}

/** Причини скасування продавцем (translationKey для change-status → canceled_by_merchant). */
export type EpicentrCancelReason = 'product_not_available' | 'price_differs' | 'delivery_not_available' | 'order_not_actual';

const CANCEL_KEY: Record<EpicentrCancelReason, string> = {
  product_not_available:  'order.cancel_reason.product_not_available',
  price_differs:          'order.cancel_reason.price_differs',
  delivery_not_available: 'order.cancel_reason.delivery_not_available',
  order_not_actual:       'order.cancel_reason.order_not_actual',
};

/**
 * Зміна статусу. Для скасування Епіцентр вимагає причину (reason_code +
 * translationKey); для «Відправлено» — попередньо внесену ТТН.
 */
export async function setEpicentrOrderStatus(
  orderId: string,
  status: EpicentrOrderStatus,
  cancel?: { reason: EpicentrCancelReason; comment?: string },
): Promise<void> {
  const body = cancel
    ? JSON.stringify({ reason_code: cancel.reason, translationKey: CANCEL_KEY[cancel.reason], comment: cancel.comment ?? '' })
    : undefined;
  await epicentrFetch(`/v2/oms/orders/${orderId}/change-status/to/${status}`, { method: 'POST', body });
}

/** Внести номер ТТН (трекінг + автозавершення за фактом вручення). */
export async function setEpicentrTTN(orderId: string, number: string): Promise<void> {
  await epicentrFetch(`/v1/oms/orders/${orderId}/shipment-number`, {
    method: 'PATCH',
    body: JSON.stringify({ number }),
  });
}

export async function addEpicentrOrderComment(orderId: string, content: string): Promise<void> {
  await epicentrFetch(`/v2/oms/orders/${orderId}/comments`, { method: 'POST', body: JSON.stringify({ content }) });
}

/** Деталізація комісії Епіцентру по замовленню — ФАКТ, який спишуть з балансу. */
export interface EpicentrBillingInvoice {
  orderId: string;
  orderNumber: string | null;
  orderTotal: number;
  orderCommissionTotal: string;   // рядок «299.99»
  accountType: string | null;
  orderItems: {
    productId: string; title: string; price: string; quantity: string; subtotal: string;
    commissionRate: string; commissionSubtotal: string; category: string; externalId: string | null; ratio: number | null;
  }[];
}

export async function getEpicentrBillingInvoice(orderId: string): Promise<EpicentrBillingInvoice | null> {
  try {
    return await epicentrFetch<EpicentrBillingInvoice>(`/v1/billing/orders/${orderId}/invoice`);
  } catch (err) {
    if (err instanceof Error && /: 40[34] /.test(err.message)) return null;
    throw err;
  }
}

/* ── Офери: ціна/наявність за SKU ───────────────────────────────────────── */

export type EpicentrAvailability = 'in_stock' | 'under_the_order' | 'not_available';

export interface EpicentrOfferUpdate {
  sku: string;
  availability?: EpicentrAvailability;
  price?: number;        // до 2 знаків
  oldPrice?: number | null;
}

export interface EpicentrBatchResult {
  total: number;
  requestId: string;
  items: { id: number | string; idType: 'product_id' | 'sku'; status: 'skipped' | 'enqueued' | 'processed' | 'forbidden'; errors?: Record<string, string[]> }[];
}

export const EPICENTR_OFFERS_BATCH = 200;

/** Одна пачка (≤200). Ідентичні запити ідемпотентні 30 хв на боці Епіцентру. */
export async function batchUpdateEpicentrOffers(items: EpicentrOfferUpdate[]): Promise<EpicentrBatchResult> {
  if (items.length > EPICENTR_OFFERS_BATCH) throw new Error(`Не більше ${EPICENTR_OFFERS_BATCH} оферів за запит`);
  const body = {
    items: items.map(i => {
      const o: Record<string, unknown> = { sku: toEpicentrId(i.sku) };
      if (i.availability) o.availability = i.availability;
      if (i.price != null && i.price > 0) {
        const prices: Record<string, number> = { price: Math.round(i.price * 100) / 100 };
        if (i.oldPrice != null && i.oldPrice > i.price) prices.oldPrice = Math.round(i.oldPrice * 100) / 100;
        o.prices = prices;
      }
      return o;
    }),
  };
  return epicentrFetch<EpicentrBatchResult>('/v1/offers', { method: 'POST', body: JSON.stringify(body) });
}

/* ── Мапінг статусів ────────────────────────────────────────────────────── */

/**
 * Наш статус → статус Епіцентру, який маємо пушнути. null — нічого не пушимо
 * (Епіцентр сам веде received/completed за фактом вручення по ТТН).
 *   new        → нічого (щойно імпортували)
 *   confirmed/processing → confirmed_by_merchant
 *   shipped    → sent (потребує ТТН — ставимо перед статусом)
 *   cancelled  → canceled_by_merchant (з причиною)
 */
export function ourStatusToEpicentrStatus(status: string): EpicentrOrderStatus | null {
  switch (status) {
    case 'confirmed':
    case 'awaiting_stock':
    case 'picking':      return 'confirmed_by_merchant';
    case 'shipped':      return 'sent';
    case 'cancelled':    return 'canceled_by_merchant';
    // delivered: «received»/«completed» Епіцентр ставить сам за трекінгом ТТН
    default:             return null;
  }
}

/** Статуси Епіцентру, які означають «покупець/площадка скасували». */
export const EPICENTR_CANCELLED: readonly EpicentrOrderStatus[] = ['canceled', 'returned', 'return_requested'];
/** Термінальні статуси продавця — не чіпаємо. */
export const EPICENTR_TERMINAL: readonly EpicentrOrderStatus[] = [
  'completed', 'closed', 'canceled', 'returned', 'canceled_by_merchant',
  'completed_merchant_rejection', 'closed_merchant_rejection',
];

/* ── Мапінг замовлення в наш формат ─────────────────────────────────────── */

/** Тип доставки Епіцентру → наш delivery_type. */
export function epicentrDeliveryType(provider: EpicentrDeliveryProvider | null | undefined): string {
  switch (provider) {
    case 'nova_poshta':         return 'nova_poshta';
    case 'ukrposhta':           return 'ukrposhta';
    case 'meest':               return 'meest';
    // Точки видачі та поштомати Епіцентру обслуговує Meest — для нас це
    // відправка Meest на їхнє відділення/поштомат.
    case 'cvz_epicentr':
    case 'parcel_box_epicentr': return 'meest';
    case 'pickup':              return 'pickup';
    case 'courier_delivery':    return 'courier';
    default:                    return 'nova_poshta';
  }
}

/**
 * Спосіб оплати → наш payment_type.
 *   pay_on_delivery / pay_on_pickup → cod (наложка: збирає перевізник)
 *   easypay / monobank / prepayment / credit_* → prepaid, якщо payed=true
 *     (гроші вже в Епіцентра, виплатить нам), інакше invoice (чекаємо)
 *   invoice → invoice (безнал за рахунком)
 */
export function epicentrPaymentType(provider: EpicentrPaymentProvider | null | undefined, payed: boolean): { paymentType: string; paid: boolean } {
  if (provider === 'pay_on_delivery' || provider === 'pay_on_pickup') return { paymentType: 'cod', paid: false };
  if (provider === 'invoice') return { paymentType: 'invoice', paid: payed };
  if (payed) return { paymentType: 'prepaid', paid: true };
  return { paymentType: 'invoice', paid: false };
}

function humanName(o: { title?: string; name?: string } | undefined): string | null {
  return (o?.title ?? o?.name ?? '').toString().trim() || null;
}

/** Коментар до замовлення: нотатка покупця + «не передзвонювати» (як у Prom). */
export function buildEpicentrComment(order: Pick<EpicentrOrder, 'comment' | 'skipCustomerContact' | 'address'>): string | null {
  const parts = [
    order.skipCustomerContact ? 'Не передзвонювати' : null,
    (order.comment ?? '').trim() || null,
    (order.address?.shipment?.comment ?? '').trim() || null,
  ].filter(Boolean);
  return parts.length ? parts.join('. ') : null;
}

export function epicentrOrderToOurFormat(order: EpicentrOrder) {
  const a   = order.address;
  const rcp = a?.isAlternateRecipient && a.recipient ? a.recipient : null;
  const firstName = rcp?.firstName ?? a?.firstName ?? '';
  const lastName  = rcp?.lastName  ?? a?.lastName  ?? '';
  const contact   = [firstName, lastName].filter(Boolean).join(' ').trim() || 'Клієнт Епіцентр';

  const sh = a?.shipment;
  const deliveryType = epicentrDeliveryType(sh?.provider);

  // Людські назви міста/відділення є лише в картці (/v6: settlement/office);
  // у списку — тільки UUID довідника Епіцентру, які в довідник НП не резолвляться.
  // Тому Ref-и НЕ зберігаємо; місто — назвою, адреса — рядком.
  const cityName   = humanName(order.settlement);
  const officeName = humanName(order.office) ?? (order.office?.address as string | undefined) ?? null;
  const house      = sh?.house ? `буд. ${sh.house}${sh.apartment ? `, кв. ${sh.apartment}` : ''}` : null;
  const deliveryAddress = [cityName, officeName, house].filter(Boolean).join(', ');
  const rawSubtype = sh?.provider === 'courier_delivery' || house ? 'address'
    : sh?.provider === 'parcel_box_epicentr' ? 'postomat'
    : sh?.provider ? 'warehouse' : null;

  const { paymentType, paid } = epicentrPaymentType(sh?.paymentProvider, order.payed);

  const items = (order.items ?? []).map(p => ({
    // Наш артикул: externalId картки (з <offer id> фіда, без дефіса) → назад у наш формат
    sku:   fromEpicentrId(p.productExternalId || p.sku || ''),
    name:  p.title,
    brand: '',
    qty:   Number(p.quantity) || 0,
    price: Number(p.price) || 0,
  }));

  const totalPrice = Number(order.subtotal) || items.reduce((s, i) => s + i.qty * i.price, 0);

  return {
    contact,
    phone:            rcp?.phone ?? a?.phone ?? '',
    email:            a?.email ?? '',
    delivery_type:    deliveryType,
    delivery_subtype: resolveDeliverySubtype(rawSubtype, deliveryAddress),
    delivery_address: deliveryAddress,
    delivery_city_ref:      null as string | null,
    delivery_city_name:     cityName,
    delivery_warehouse_ref: null as string | null,
    payment_type:     paymentType,
    paid,
    comment:          buildEpicentrComment(order),
    items,
    total_price:      totalPrice,
    status:           'new' as const,
    channel_code:     'epicentr' as const,
    epicentr_order_id: order.id,
    epicentr_data:     order,
  };
}

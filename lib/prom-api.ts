import { createClient } from '@supabase/supabase-js';
import { resolveDeliverySubtype } from './np-postomat';

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
  quantity: number;                 // у замовленні — кількість позиції
  price: string;
  total_price: string;
  measure_unit: string;
  image?: string;
  // Поля картки товару з /products/list (у позиції замовлення відсутні)
  presence?: 'available' | 'not_available' | 'order' | 'service';
  in_stock?: boolean;               // «Готово до відправки»
  quantity_in_stock?: number;       // залишок на складі
  status?: 'on_display' | 'draft' | 'deleted' | 'not_on_display';
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
  /** Коментар ПОКУПЦЯ до замовлення — Prom кладе його сюди, а не в comment */
  client_notes?: string | null;
  /** Прапорець «не передзвонювати» з чекаута Prom */
  dont_call_customer_back?: boolean;
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

  const data = await promFetch<OrdersListResponse & { error?: string }>(`/orders/list?${params.toString()}`);
  // Prom віддає HTTP 200 з {"error": "..."} на невалідні параметри (напр., неіснуючий
  // статус) — без цієї перевірки помилка мовчки виглядала як «нуль замовлень».
  if (data.error) throw new Error(`Prom API /orders/list: ${data.error}`);
  return data.orders ?? [];
}

// Одне замовлення зі СВІЖИМ payload (cpa_commission, ps_promotion тощо) — знімок у
// orders.prom_data робиться при імпорті і застаріває: редагування замовлення міняє
// cpa_commission, а «дешева доставка» може зніматися (зміна способу оплати, порушення).
export async function getPromOrder(promOrderId: number): Promise<PromOrder | null> {
  const data = await promFetch<{ order?: PromOrder; error?: string }>(`/orders/${promOrderId}`);
  if (data.error) throw new Error(`Prom API /orders/${promOrderId}: ${data.error}`);
  return data.order ?? null;
}

/* ── Status push ────────────────────────────────────────────────────────── */

// Значення, які РЕАЛЬНО приймає POST /orders/set_status (перевірено живими запитами
// 2026-07-27): received, delivered, canceled (вимагає cancellation_reason).
// 'accepted' і 'declined' API відбиває — «This status value is not allowed», причому
// з HTTP 200, тому роками пуш підтвердження був мовчазним no-op і замовлення висіли
// в кабінеті Prom як «Нові».
export type PromStatus = 'received' | 'delivered' | 'canceled';

// Maps our internal statuses to Prom statuses
const STATUS_MAP: Record<string, PromStatus | null> = {
  confirmed: 'received',
  // Свого «відправлено» у Prom немає; якщо менеджер пропустив крок підтвердження,
  // received при відправці не дає замовленню висіти «Новим»
  shipped:   'received',
  cancelled: 'canceled',
  delivered: 'delivered',
  new:       null,
};

export function ourStatusToPromStatus(ourStatus: string): PromStatus | null {
  return STATUS_MAP[ourStatus] ?? null;
}

export async function setPromOrderStatus(
  promOrderId: number,
  status: PromStatus,
  opts?: { cancellationText?: string },
): Promise<void> {
  const body: Record<string, unknown> = { ids: [promOrderId], status };
  if (status === 'canceled') {
    body.cancellation_reason = 'another';
    body.cancellation_text   = opts?.cancellationText ?? 'Скасовано продавцем';
  }
  // Помилки set_status приходять з HTTP 200 у тілі ({"error": ...} або errors по id) —
  // без цієї перевірки невдалий пуш виглядає успішним.
  const data = await promFetch<{ processed_ids?: number[]; error?: string; errors?: Record<string, string> }>('/orders/set_status', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  const err = data.error ?? data.errors?.[String(promOrderId)];
  if (err) throw new Error(`Prom set_status ${status} #${promOrderId}: ${err}`);
  // Порожній processed_ids без помилки = замовлення вже в цьому/подальшому статусі — ок.
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

// Поля — за схемою PostProductRequestBody (public-api.docs.prom.ua): залишок
// зветься quantity_in_stock (поле quantity API мовчки ігнорує), «Готово до
// відправки» — булеве in_stock.
export async function updatePromProducts(products: {
  id: number;
  price?: number;
  presence?: 'available' | 'not_available' | 'order';
  in_stock?: boolean;
  quantity_in_stock?: number;
}[]): Promise<{ processed_ids: number[]; errors: Record<string, unknown> }> {
  // Тіло запиту — ГОЛИЙ масив товарів. На обгортку {products: [...]} Prom
  // відповідає HTTP 200 {"errors": {"error": "Ожидается список товаров"}}
  // (перевірено 2026-09-04) — саме так старий пуш роками був мовчазним no-op.
  const data = await promFetch<{ processed_ids?: number[]; errors?: Record<string, unknown>; error?: string }>('/products/edit', {
    method: 'POST',
    body: JSON.stringify(products),
  });
  // Помилка всього запиту (не по конкретному id) приходить у data.error або
  // errors.error — це збій формату, а не окремої картки: кидаємо.
  const requestError = data.error ?? (data.errors && 'error' in data.errors ? String(data.errors.error) : null);
  if (requestError) throw new Error(`Prom products/edit: ${requestError}`);
  // Помилки по окремих картках (наприклад, різновид успадковує наявність) —
  // повертаємо викликачу, він вирішує: решта пачки вже оброблена.
  return { processed_ids: data.processed_ids ?? [], errors: data.errors ?? {} };
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

/** Коментар до замовлення: нотатка покупця (client_notes) + прапорець
 *  «не передзвонювати» з чекаута. Фраза «Не передзвонювати» — саме та, за
 *  якою журнал замовлень ставить ✓ у колонці «Дзвінок». */
export function buildPromComment(order: Pick<PromOrder, 'comment' | 'client_notes' | 'dont_call_customer_back'>): string | null {
  const note = (order.client_notes ?? order.comment ?? '').trim();
  const parts = [
    order.dont_call_customer_back ? 'Не передзвонювати' : null,
    note || null,
  ].filter(Boolean);
  return parts.length ? parts.join('. ') : null;
}

export function promOrderToOurFormat(order: PromOrder) {
  // Отримувач: delivery_recipient точніший за client_* (той може бути порожній)
  const rcp        = order.delivery_recipient;
  const firstName  = rcp?.first_name ?? order.client_first_name ?? '';
  const lastName   = rcp?.last_name  ?? order.client_last_name  ?? '';
  const contact    = [firstName, lastName].filter(Boolean).join(' ').trim() || 'Клієнт Prom';

  // Реквізити доставки. ⚠ Prom кладе у delivery_provider_data.recipient_address
  // СВОЇ city_id/warehouse_id — це НЕ Ref-и Нової Пошти: getWarehouses(city_id)
  // повертає 0 (перевірено live). Тому Ref-и НЕ зберігаємо (лишаємо null) — модалка
  // ТТН по відсутньому ref іде фолбеком: шукає місто за назвою (з областю в дужках
  // однозначно матчить потрібне село) і підставляє відділення за номером «№N» з
  // адреси. Зберігаємо лише назву міста + людський рядок адреси + тип.
  const prov = order.delivery_provider_data;
  const ra   = prov?.recipient_address;

  let deliveryType         = 'nova_poshta';
  if (prov?.provider === 'ukrposhta')    deliveryType = 'ukrposhta';
  else if (prov?.provider === 'nova_poshta') deliveryType = 'nova_poshta';
  else if (order.delivery_option?.delivery_type) deliveryType = order.delivery_option.delivery_type;

  const deliveryCityRef: string | null      = null;   // навмисно null: Prom-ref не резолвиться в НП
  const deliveryWarehouseRef: string | null = null;
  let deliveryCityName: string | null       = null;
  let deliverySubtype: string | null        = null;
  if (prov?.provider === 'nova_poshta' && ra) {
    deliveryCityName = ra.city_name ?? null;
    // building_number заповнений тільки для адресної доставки (двері), інакше склад
    deliverySubtype  = ra.building_number ? 'address' : 'warehouse';
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
  // COD: укр. «накладений», рос. «наложенный», «післяплата», «оплата при отриманні/получении».
  if (payType === 'cash_on_delivery' || /(наклад|наложен|післяплат|при отрим|при получ)/.test(payName)) paymentType = 'cod';
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
    // Prom не розрізняє поштомат і відділення — обидва приїжджають як
    // «warehouse», а слово «Поштомат» лишається тільки в рядку адреси. Через це
    // накладну виписували на відділення, куди покупець не замовляв.
    delivery_subtype: resolveDeliverySubtype(deliverySubtype, deliveryAddress),
    delivery_address: deliveryAddress,
    delivery_city_ref:      deliveryCityRef,
    delivery_city_name:     deliveryCityName,
    delivery_warehouse_ref: deliveryWarehouseRef,
    payment_type:     paymentType,
    paid,
    // Коментар покупця Prom шле в client_notes (comment у payload порожній —
    // перевірено на живому замовленні 421136171); прапорець «не передзвонювати»
    // з чекаута зводимо до тієї самої фрази, за якою журнал ставить ✓ у «Дзвінок»
    comment:          buildPromComment(order),
    items,
    total_price:      totalPrice,
    status:           'new' as const,
    channel_code:     'prom' as const,
    prom_order_id:    order.id,
    prom_data:        order,
  };
}

/* ── Чат з покупцями (/chat) ─────────────────────────────────────────────────
   Новий Prom Chat API (спека public-api.docs.prom.ua, розділ Chat). Кімната =
   діалог з покупцем, ident формату {user_id}_{company_id}_buyer. Ліміт кімнат
   на сторінку — 20 (максимум API), історія — до 100 повідомлень за запит.
   Відповіді приходять як {status:'ok', data:{...}} — НЕ як в /orders. */

export interface PromChatRoom {
  id: number;
  ident: string;
  date_sent: string | null;     // дата останнього повідомлення, UTC+0
  status: 'active' | 'archived' | 'banned';
  last_message_id: number | null;
  buyer_client_id: number | null;
}

export interface PromChatMessage {
  id: number;
  room_id: string;
  room_ident: string;
  body: string | null;
  date_sent: string | null;     // UTC+0
  type: string;                 // 'message' | 'attachment' | ...
  status: string;               // 'new' | 'read' | ...
  is_sender_online?: boolean;
  context_item_id: number | string | null;
  context_item_type: string | null;   // 'order' | 'product' | null
  attachments?: unknown[];
  user_name: string | null;
  user_ident: string | null;    // id відправника; порівнюємо з user_id кімнати
  user_phone?: string | null;
}

async function promChatFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const json = await promFetch<{ status: 'ok' | 'error'; data?: T; message?: string }>(path, init);
  if (json.status !== 'ok') throw new Error(`Prom chat API ${path}: ${json.message ?? 'error'}`);
  return json.data as T;
}

export async function getPromChatRooms(opts?: { limit?: number; offset?: number; dateFrom?: string }): Promise<PromChatRoom[]> {
  const params = new URLSearchParams({ status: 'active', sort: 'desc', limit: String(opts?.limit ?? 20) });
  if (opts?.offset) params.set('offset', String(opts.offset));
  if (opts?.dateFrom) params.set('date_from', opts.dateFrom);
  const data = await promChatFetch<{ rooms: PromChatRoom[] }>(`/chat/rooms?${params.toString()}`);
  return data.rooms ?? [];
}

export async function getPromChatHistory(roomIdent: string, limit = 100): Promise<PromChatMessage[]> {
  const params = new URLSearchParams({ room_ident: roomIdent, limit: String(limit), sort: 'asc' });
  const data = await promChatFetch<{ messages: PromChatMessage[] }>(`/chat/messages_history?${params.toString()}`);
  return data.messages ?? [];
}

export async function sendPromChatMessage(roomIdent: string, body: string): Promise<void> {
  await promChatFetch('/chat/send_message', {
    method: 'POST',
    body: JSON.stringify({ room_ident: roomIdent, body }),
  });
}

export async function markPromMessageRead(messageId: number): Promise<void> {
  await promChatFetch('/chat/mark_message_read', {
    method: 'POST',
    body: JSON.stringify({ message_id: messageId }),
  });
}

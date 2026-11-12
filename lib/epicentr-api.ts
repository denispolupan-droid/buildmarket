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
import { fetchWithTimeout } from './fetch-timeout';
import { resolveDeliverySubtype, isPostomatText } from './np-postomat';
import { fromEpicentrId, toEpicentrId } from './epicentr-availability';
import { createServiceClient } from './supabase-service';
import { readSetting } from './secrets';

export const EPICENTR_BASE = 'https://merchant-api.epicentrm.com.ua';
export const EPICENTR_TOKEN_KEY = 'epicentr_api_token';

async function getToken(): Promise<string> {
  const db = createServiceClient();
  const stored = await readSetting(db, EPICENTR_TOKEN_KEY);
  if (stored) return stored;
  const token = process.env.EPICENTR_API_TOKEN;
  if (!token) throw new Error('Ключ API Епіцентру не налаштований. Вкажіть його на сторінці /admin/epicentr');
  return token;
}

/** Чи є ключ узагалі (без кидання помилки) — для кронів і дашборда. */
export async function hasEpicentrToken(): Promise<boolean> {
  try { await getToken(); return true; } catch { return false; }
}

export async function epicentrFetch<T>(path: string, init?: RequestInit, token?: string): Promise<T> {
  const res = await fetchWithTimeout(`${EPICENTR_BASE}${path}`, {
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
  office?: { id?: string; title?: string; name?: string; address?: string; number?: string; type?: number } & Record<string, unknown>;
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

/** Порядок «вперед» за процесом Епіцентру (лист менеджера 11.11.2026). */
const EPI_RANK: Partial<Record<EpicentrOrderStatus, number>> = {
  new: 0, confirmed_by_merchant: 1, confirmed: 2, sent: 3, delivered: 4, received: 4, completed: 5, closed: 6,
};
export const epicentrRank = (s: EpicentrOrderStatus | string | null | undefined): number =>
  EPI_RANK[s as EpicentrOrderStatus] ?? -1;

export type EpicentrForwardTarget = 'confirmed_by_merchant' | 'confirmed' | 'sent';

/**
 * Провести замовлення Епіцентру вперед ПОКРОКОВО, як вимагає площадка:
 *   «Нове» → «Підтверджено продавцем» (відкриваються контакти покупця)
 *          → «Підтверджено» (деталі узгоджено, готуємо відправку)
 *          → ТТН → «Відправлено» (Епіцентр зазвичай ставить сам після ТТН).
 * Стрибати з «Нове» одразу в «Підтверджено» не можна (лист менеджера 11.11),
 * тому кожен крок — лише якщо він є в allowed-statuses. Ідемпотентно: що вже
 * пройдено — пропускаємо. Повертає статус Епіцентру після дій.
 */
export async function advanceEpicentrOrder(
  orderId: string,
  target: EpicentrForwardTarget,
  opts: { ttn?: string | null; live?: EpicentrOrder | null } = {},
): Promise<EpicentrOrderStatus | null> {
  const live = opts.live ?? await getEpicentrOrder(orderId);
  if (!live) throw new Error(`Епіцентр не знає замовлення ${orderId}`);
  let cur = live.statusCode;
  if (epicentrRank(cur) < 0) return cur;            // скасоване/повернення — не чіпаємо

  const goal = epicentrRank(target);
  for (const step of ['confirmed_by_merchant', 'confirmed'] as const) {
    if (epicentrRank(step) > goal || epicentrRank(cur) >= epicentrRank(step)) continue;
    const allowed = await getEpicentrAllowedStatuses(orderId);
    if (!allowed.includes(step)) {
      throw new Error(`Епіцентр не дозволяє перехід ${cur} → ${step} (дозволено: ${allowed.join(', ') || '—'})`);
    }
    await setEpicentrOrderStatus(orderId, step);
    cur = step;
  }
  if (target !== 'sent' || epicentrRank(cur) >= epicentrRank('sent')) return cur;

  if (!opts.ttn) throw new Error('без ЕН Епіцентр «Відправлено» не приймає');
  // Накладну Meest-Епіцентр виписує сам Епіцентр — той самий номер уже в картці,
  // перезаписувати його не треба (і небезпечно: це прив'язка до відправлення Meest)
  if (live.address?.shipment?.number !== opts.ttn) await setEpicentrTTN(orderId, opts.ttn);
  // Після ТТН статус зазвичай стає «Відправлено» сам — перевіряємо, перш ніж ставити
  const after = await getEpicentrOrder(orderId);
  if (after && epicentrRank(after.statusCode) >= epicentrRank('sent')) return after.statusCode;
  const allowed = await getEpicentrAllowedStatuses(orderId);
  if (allowed.includes('sent')) { await setEpicentrOrderStatus(orderId, 'sent'); return 'sent'; }
  return after?.statusCode ?? cur;                  // ТТН внесено; статус Епіцентр змінить сам
}

/**
 * Скасування продавцем з причиною. З «Нове» Епіцентр дозволяє лише `canceled`
 * (перевірено allowed-statuses на 58851611; комісії тоді немає), після
 * підтвердження — `canceled_by_merchant`. Беремо той, що дозволено зараз.
 */
export async function cancelEpicentrOrder(
  orderId: string,
  cancel: { reason: EpicentrCancelReason; comment?: string } = { reason: 'product_not_available' },
): Promise<EpicentrOrderStatus | null> {
  const allowed = await getEpicentrAllowedStatuses(orderId);
  const code = allowed.includes('canceled_by_merchant') ? 'canceled_by_merchant'
    : allowed.includes('canceled') ? 'canceled' : null;
  if (!code) {
    const live = await getEpicentrOrder(orderId);
    if (!live || live.statusCode.startsWith('canceled') || live.statusCode.startsWith('closed')) return live?.statusCode ?? null;
    throw new Error(`Епіцентр не дозволяє скасування зі статусу ${live.statusCode} (дозволено: ${allowed.join(', ') || '—'})`);
  }
  await setEpicentrOrderStatus(orderId, code, cancel);
  return code;
}

/** Внести номер ТТН (трекінг + автозавершення за фактом вручення). */
export async function setEpicentrTTN(orderId: string, number: string): Promise<void> {
  await epicentrFetch(`/v1/oms/orders/${orderId}/shipment-number`, {
    method: 'PATCH',
    body: JSON.stringify({ number }),
  });
}

/**
 * Внести номер, лише якщо в картці Епіцентру інший. Для накладних Meest-Епіцентр
 * номер з'являється в картці сам у момент створення — повторний PATCH зайвий.
 */
export async function ensureEpicentrTTN(orderId: string, number: string, live?: EpicentrOrder | null): Promise<void> {
  const card = live ?? await getEpicentrOrder(orderId);
  if (card?.address?.shipment?.number === number) return;
  await setEpicentrTTN(orderId, number);
}

/* ── Накладні Meest через Епіцентр (поштомати й пункти видачі Епіцентру) ── */

export type EpicentrMeestOfficeRow = { id: string; settlementId: string; title: string; address?: string | null; isActive?: boolean };

/** Населені пункти довідника відправника Meest (sender) за назвою. */
export async function findEpicentrMeestSenderSettlements(title: string): Promise<{ id: string; title: string }[]> {
  const q = new URLSearchParams({ title, limit: '20' });
  const d = await epicentrFetch<{ items?: { id: string; title: string }[] }>(`/v3/deliveries/providers/meest/participants/sender/settlements?${q}`);
  return d?.items ?? [];
}

/** Відділення Meest відправника в населеному пункті (усі сторінки). */
export async function getEpicentrMeestSenderOffices(settlementId: string): Promise<EpicentrMeestOfficeRow[]> {
  const out: EpicentrMeestOfficeRow[] = [];
  for (let offset = 0; offset < 1000; offset += 100) {
    const d = await epicentrFetch<{ items?: EpicentrMeestOfficeRow[] }>(
      `/v3/deliveries/providers/meest/participants/sender/settlements/${settlementId}/offices?limit=100&offset=${offset}`);
    const items = d?.items ?? [];
    out.push(...items);
    if (items.length < 100) break;
  }
  return out;
}

/**
 * Створити накладну Meest на замовлення (Епіцентр виписує її за договором продавця).
 * Відповідь 201 без тіла — номер з'являється в картці (address.shipment.number).
 */
export async function createEpicentrShipment(orderId: string, provider: string, body: unknown): Promise<void> {
  await epicentrFetch(`/v3/oms/orders/${orderId}/shipping/${provider}`, { method: 'POST', body: JSON.stringify(body) });
}

/** Файл накладної для друку (base64; зазвичай PDF). */
export async function getEpicentrShipmentFile(provider: string, number: string): Promise<string | null> {
  const d = await epicentrFetch<{ file?: string }>(`/v3/deliveries/${provider}/invoices/${encodeURIComponent(number)}`);
  return d?.file ?? null;
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
  items: { id: number | string; idType: 'product_id' | 'sku'; status: 'skipped' | 'enqueued' | 'processed' | 'forbidden'; errors?: EpicentrItemErrors }[];
}

/**
 * Помилки елемента пакета. Свагер описує об'єкт «поле → масив рядків», а живий
 * API (11.11.2026) віддає МАСИВ таких об'єктів: [{"item":["batch_update.item.cache_noop"]}].
 * Через це «без змін» рахувалось помилкою (727 «помилок» у першому тіку крона).
 */
export type EpicentrItemErrors = Record<string, string[]> | Record<string, string[]>[];

/** Усі коди помилок елемента, незалежно від форми (об'єкт чи масив об'єктів). */
export function epicentrErrorCodes(errors: EpicentrItemErrors | null | undefined): string[] {
  if (!errors) return [];
  const objs = Array.isArray(errors) ? errors : [errors];
  return objs.flatMap(o => Object.values(o ?? {}).flat()).map(String);
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
 *   new        → нічого (щойно імпортували; спершу перевірити наявність)
 *   confirmed / awaiting_stock → confirmed_by_merchant («прийняли в роботу» — контакти)
 *   picking    → confirmed («деталі узгоджено, готуємо відправку»)
 *   shipped    → sent (через confirmed; ТТН — ставимо перед статусом)
 *   cancelled  → canceled_by_merchant (з причиною; з «Нове» — canceled, див. cancelEpicentrOrder)
 * Перехід — лише через advanceEpicentrOrder (покроково, за allowed-statuses).
 */
export function ourStatusToEpicentrStatus(status: string): EpicentrOrderStatus | null {
  switch (status) {
    case 'confirmed':
    case 'awaiting_stock': return 'confirmed_by_merchant';
    case 'picking':      return 'confirmed';
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
 *   easypay / monobank / prepayment / credit_* → prepaid, якщо payed=true або
 *     кошти заблоковані на картці покупця (paymentStatus=hold_set: Епіцентр
 *     списує холд сам і виплачує нам — перше замовлення 58851611 від 11.11
 *     прийшло monobank + hold_set + payed=false); інакше invoice (чекаємо)
 *   invoice → invoice (безнал за рахунком)
 */
export function epicentrPaymentType(
  provider: EpicentrPaymentProvider | null | undefined,
  payed: boolean,
  paymentStatus?: EpicentrOrder['address']['shipment']['paymentStatus'] | null,
): { paymentType: string; paid: boolean } {
  if (provider === 'pay_on_delivery' || provider === 'pay_on_pickup') return { paymentType: 'cod', paid: false };
  if (provider === 'invoice') return { paymentType: 'invoice', paid: payed };
  if (payed || paymentStatus === 'hold_set') return { paymentType: 'prepaid', paid: true };
  return { paymentType: 'invoice', paid: false };
}

/** Оплата замовлення за поточним payload (те саме правило, що при імпорті). */
export function epicentrOrderPaid(order: Pick<EpicentrOrder, 'payed' | 'address'>): boolean {
  const sh = order.address?.shipment;
  return epicentrPaymentType(sh?.paymentProvider, order.payed, sh?.paymentStatus).paid;
}

/** Холд на картці зняли/скасували — гроші покупця більше не заблоковані. */
export function epicentrHoldLost(order: Pick<EpicentrOrder, 'payed' | 'address'>): boolean {
  const st = order.address?.shipment?.paymentStatus;
  return !order.payed && (st === 'hold_canceled' || st === 'hold_unset' || st === 'payment_canceled');
}

/**
 * Рядок відділення з картки /v6: «Поштомат №27076: вул. Стрийська, 115д…».
 * Номер з «№» потрібен модалці ТТН (lib/np-resolve підбирає відділення за ним).
 * Поштомат НП: type 4 у довіднику Епіцентру або 5-значний номер (перевірено
 * на 58851611: №27076, type 4, «під'їзд №5»).
 */
export function epicentrOfficeLine(order: Pick<EpicentrOrder, 'office' | 'address'>): { line: string | null; postomat: boolean } {
  const o = order.office;
  const provider = order.address?.shipment?.provider;
  const title = humanName(o) ?? (o?.address as string | undefined) ?? null;
  const num = o?.number != null ? String(o.number).trim() : '';
  const postomat = provider === 'parcel_box_epicentr'
    || (provider === 'nova_poshta' && (o?.type === 4 || num.length >= 5))
    || isPostomatText(title);
  if (!num) return { line: title, postomat };
  const label = postomat ? 'Поштомат' : 'Відділення';
  // Назва вже починається з цього ж «№N» — не дублюємо. Інші «№» у назві («під'їзд №5»)
  // не рахуються: номер відділення має стояти ПЕРШИМ «№» у рядку (warehouseNumberFromAddress).
  if (title && new RegExp(`^[^№]*№\\s*${num}(?!\\d)`).test(title)) return { line: title, postomat };
  return { line: `${label} №${num}${title ? `: ${title}` : ''}`, postomat };
}

/** Чи відкрив Епіцентр контакти покупця (до підтвердження продавцем вони порожні). */
export function epicentrHasContacts(order: Pick<EpicentrOrder, 'address'>): boolean {
  const a = order.address;
  return Boolean((a?.phone ?? '').trim() || (a?.recipient?.phone ?? '').trim());
}

/**
 * Платник за рахунком (ТОВ/ФОП), якого покупець вказав при оформленні з оплатою
 * «Рахунок» (12.11.2026, №26111077 «ТОВ Єдрон»). Є лише в картці /v6 і лише після
 * підтвердження — у списку /v4 цих полів немає. ЄДРПОУ (8) або ІПН (10) цифр.
 */
export function epicentrPayer(order: Pick<EpicentrOrder, 'address'>): { name: string; govNumber: string } | null {
  const name = (order.address?.payerName ?? '').replace(/\s+/g, ' ').trim();
  const govNumber = (order.address?.govNumber ?? '').replace(/\s/g, '');
  if (!name || !/^(\d{8}|\d{10})$/.test(govNumber)) return null;
  return { name, govNumber };
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
  const office     = epicentrOfficeLine(order);
  const house      = sh?.house ? `буд. ${sh.house}${sh.apartment ? `, кв. ${sh.apartment}` : ''}` : null;
  const deliveryAddress = [cityName, office.line, house].filter(Boolean).join(', ');
  const rawSubtype = sh?.provider === 'courier_delivery' || house ? 'address'
    : office.postomat ? 'postomat'
    : sh?.provider ? 'warehouse' : null;

  const { paymentType, paid } = epicentrPaymentType(sh?.paymentProvider, order.payed, sh?.paymentStatus);

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

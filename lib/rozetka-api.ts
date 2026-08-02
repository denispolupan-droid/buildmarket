import { createClient } from '@supabase/supabase-js';

// Назви статусів кабінету й порівняння воронок винесені в чистий модуль без
// мережі й ключів: тут живе сервісний ключ Supabase, а адмінка — клієнтський
// компонент, і імпортувати цей файл у браузер не можна.
export { ROZETKA_STATUS_LABEL, rozetkaStatusLabel, isRozetkaAhead } from './rozetka-status';

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

  const res = await fetchWithRetry(`${ROZETKA_BASE}/sites`, {
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

// Rozetka's API периодично рве з'єднання («fetch failed / other side closed») — через це
// губилися fire-and-forget пуші статусів. Всі виклики йдуть через ретрай мережевих помилок;
// HTTP-відповіді (4xx/5xx) не ретраїмо тут — ними займається rozetkaFetch.
async function fetchWithRetry(url: string, init: RequestInit, tries = 3): Promise<Response> {
  let lastErr: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fetch(url, init);
    } catch (err) {
      lastErr = err;
      await new Promise(r => setTimeout(r, 500 * (i + 1)));
    }
  }
  throw lastErr;
}

async function rozetkaFetch<T>(path: string, init?: RequestInit, _retried = false): Promise<T> {
  const token = await getValidToken();
  const res = await fetchWithRetry(`${ROZETKA_BASE}${path}`, {
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
  const json = await res.json() as {
    success: boolean; content: T; message?: string;
    errors?: { message?: string; code?: number; description?: string; details?: unknown };
  };
  if (!json.success) {
    // Причина відмови лежить в errors.description/details — без неї в логах було
    // лише «unsuccessful response» і збої пушів статусів не можна було діагностувати.
    const e = json.errors;
    const detail = [
      json.message ?? e?.description ?? e?.message,
      e?.details ? JSON.stringify(e.details).slice(0, 300) : null,
    ].filter(Boolean).join(' — ');
    throw new Error(`Rozetka API ${path}: ${detail || 'unsuccessful response'}`);
  }
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
  // expand-поле: замовлення в програмі Smart (безкоштовна доставка за наш рахунок —
  // Rozetka списує компенсацію 12/18/30 грн при передачі перевізникові)
  is_smart?: boolean;
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
  payment?: {
    payment_type: string;
    payment_method_name: string;
    // Rozetka віддає окремий блок статусу оплати: name 'paid' → гроші вже надійшли
    payment_status?: { name: string; title: string; value: number } | null;
  } | null;
}

interface OrderSearchResponse {
  orders: RozetkaOrder[];
  _meta: { totalCount: number; pageCount: number; currentPage: number; perPage: number };
}

const EXPAND = 'user,delivery,delivery_service,purchases,payment,status_data,is_smart';

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

// Rozetka не дозволяє «перестрибувати» статуси: PUT 61 для замовлення в «Новому»
// відбивається 1005 «Неможливо змінити статус. З 1 на 61. Наступний статус недоступний»
// (живий кейс 2026-07-27: замовлення відправили без кроку «підтверджено», і пуш —
// разом із самолікуванням у кроні — годинами бився об цю відмову). Якщо прямий пуш
// падає саме помилкою переходу, проходимо драбину проміжних статусів (26 «Обробляється
// менеджером», далі 61 «Заплановано передачу», якщо є ТТН) і повторюємо цільовий.
function isStatusTransitionError(err: unknown): boolean {
  // Rozetka віддає ДВА різні тексти для відмови переходу: «Наступний статус
  // недоступний» і «Перехід в цей статус неможливий» (живий кейс 26071052:
  // другий текст не матчився, і драбина статусів навіть не пробувалась).
  return err instanceof Error
    && (err.message.includes('Наступний статус недоступний')
     || err.message.includes('Перехід в цей статус неможливий'));
}

export async function setRozetkaOrderStatusChained(
  orderId: number,
  status: number,
  opts?: { ttn?: string; comment?: string },
): Promise<void> {
  try {
    await setRozetkaOrderStatus(orderId, status, opts);
    return;
  } catch (err) {
    if (!isStatusTransitionError(err)) throw err;
    const ladder = [26, ...(opts?.ttn ? [61] : [])].filter(s => s !== status);
    let lastErr: unknown = err;
    for (const mid of ladder) {
      try {
        await setRozetkaOrderStatus(orderId, mid, mid === 61 ? { ttn: opts?.ttn } : undefined);
      } catch (e) {
        lastErr = e;
        continue;
      }
      try {
        await setRozetkaOrderStatus(orderId, status, opts);
        return;
      } catch (e) {
        if (!isStatusTransitionError(e)) throw e;
        lastErr = e;
      }
    }
    throw lastErr;
  }
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
  confirmed:      26, // Обробляється менеджером
  awaiting_stock: null,
  picking:        null,
  shipped:        61, // Заплановано передачу перевізникові (ttn required — id 3 "Передано до
                       // служби доставки" is the later, physical-handover status, not this one)
  delivered:      6,  // Замовлення виконано
  // cancelled: НЕ мапиться на один статус — 13 «Скасовано адміністратором»
  // продавцю через API недоступний («Перехід в цей статус неможливий» навіть
  // із 26). Скасування вимагає КОНКРЕТНОЇ причини зі списку нижче — її обирає
  // менеджер, і роут передає id явно (rozetka_cancel_reason).
  cancelled:      null,
};


/** Причини скасування (статуси групи 3), які продавець може ставити через API.
 *  13 «Скасовано адміністратором» виключено — його API продавцю не приймає. */
export const ROZETKA_CANCEL_REASONS: { id: number; label: string }[] = [
  { id: 16, label: 'Немає в наявності / брак' },
  { id: 18, label: 'Не вдалося зв\'язатися' },
  { id: 17, label: 'Не влаштовують умови оплати' },
  { id: 24, label: 'Не влаштовує доставка' },
  { id: 20, label: 'Товар не підходить за характеристиками' },
  { id: 11, label: 'Не прийшов за замовленням' },
  { id: 12, label: 'Відмова при отриманні' },
  { id: 25, label: 'Тестове замовлення' },
];

export function ourStatusToRozetkaStatus(ourStatus: string): number | null {
  return STATUS_MAP[ourStatus] ?? null;
}

/* ── Баланс кабінету (звірка фінансів) ──────────────────────────────────────
   /balances/total і /balances/search підтверджені живими запитами 2026-07-26.
   Типи операцій (/balances/types): 1 резерв, 2 комісія за продаж, 3 зняття
   резерву, 8 правка кількості, 14 повернення замовлення, 18 розподілення
   гарантійного платежу тощо. Для комісій фактична сума — поле debit (списання)
   або credit (повернення); поля приходять то числом, то строкою. */

export interface RozetkaBalanceTxn {
  id: number;
  orderId: number;
  operationType: number;
  cost: string | number;
  debit: string | number;
  credit: string | number;
  transaction_ts: string;
}

export async function getRozetkaBalanceTotal(): Promise<{ balance: number; sumInGray: number }> {
  // Саме ці два числа кабінет показує як «Баланс» і «Сіра зона» (звірено зі скріншотом
  // кабінету 2026-07-26). /balances/total НЕ підходить — він віддає лише частку торгової
  // марки без платформної складової.
  const data = await rozetkaFetch<{ balance: { balance_total: string | number; royalty_gray: string | number } }>('/balance-consolidated/balance');
  return { balance: Number(data.balance?.balance_total) || 0, sumInGray: Number(data.balance?.royalty_gray) || 0 };
}

export async function getRozetkaBalanceTxns(opts: { dateFrom: string; dateTo?: string }): Promise<RozetkaBalanceTxn[]> {
  const all: RozetkaBalanceTxn[] = [];
  // Захист від нескінченного циклу: 50 сторінок × 100 = 5000 транзакцій за період — з запасом
  for (let page = 1; page <= 50; page++) {
    const params = new URLSearchParams({ dateFrom: opts.dateFrom, pageSize: '100', page: String(page) });
    if (opts.dateTo) params.set('dateTo', opts.dateTo);
    const data = await rozetkaFetch<{
      billingLogUserBalances: RozetkaBalanceTxn[];
      _meta: { pageCount: number; currentPage: number };
    }>(`/balances/search?${params.toString()}`);
    all.push(...(data.billingLogUserBalances ?? []));
    if (!data._meta || data._meta.currentPage >= data._meta.pageCount) break;
  }
  return all;
}

/* ── Заявки на повернення (/order-refund) ───────────────────────────────────
   Модуль повернень кабінету: покупець відкриває заявку, вона проходить статуси
   (перелік — /order-refund/search-data). Поля підтверджені apiDoc; живий запит
   2026-07-26 повернув порожній список (заявок ще не було) — формат {orderRefunds,_meta}. */

export interface RozetkaRefund {
  id: string;                 // номер заявки (рядок, напр. "123ABC")
  order_id: number;
  status_code: string | number | null;
  status_title: string | null;
  reason_title: string | null;
  sub_reason_title?: string | null;
  item_name: string | null;
  item_id: number | null;
  datetime: string | null;    // дата/час заявки
  ttn: string | null;         // ТТН зворотної доставки
  read: boolean | null;
}

export async function getRozetkaRefunds(opts?: { dateFrom?: string; dateTo?: string }): Promise<RozetkaRefund[]> {
  const all: RozetkaRefund[] = [];
  for (let page = 1; page <= 20; page++) {
    const params = new URLSearchParams({ pageSize: '100', page: String(page) });
    if (opts?.dateFrom) params.set('date_from', opts.dateFrom);
    if (opts?.dateTo) params.set('date_to', opts.dateTo);
    const data = await rozetkaFetch<{
      orderRefunds: RozetkaRefund[];
      _meta: { pageCount: number; currentPage: number };
    }>(`/order-refund/search?${params.toString()}`);
    all.push(...(data.orderRefunds ?? []));
    if (!data._meta || data._meta.currentPage >= data._meta.pageCount) break;
  }
  return all;
}

/* ── Чати з покупцями (/messages) ───────────────────────────────────────────
   Живі запити 2026-07-26: msgType приймає 'orders' (чати по замовленнях) та
   'items' (питання про товар); без msgType — лише items. Відповідь
   {chats, _meta}. Тред: GET /messages/{id}?expand=messages. Відповідь
   покупцю: POST /messages/create. Прочитано: PUT /messages/{id} {read_market}. */

export interface RozetkaChatMessage {
  chat_id: number;
  body: string;
  created: string;
  receiver_id: number;
  sender: number;              // 0 — система; є seller_id → повідомлення продавця
  seller_id: number | null;
  files?: Array<{ id: number; name: string; typeName: string }>;
}

export interface RozetkaChat {
  id: number;
  created: string;
  updated: string;
  subject: string | null;
  user: { id: number; contact_fio: string | null } | null;
  user_id: number;
  read_market: string | null;
  order_id: number | null;
  item_id: number | null;
  type: number;
  unread_messages_count?: number;
  messages?: RozetkaChatMessage[];
}

export async function getRozetkaChats(msgType: 'orders' | 'items', page = 1): Promise<{ chats: RozetkaChat[]; pageCount: number }> {
  const params = new URLSearchParams({
    msgType, page: String(page), sort: '-updated',
    expand: 'unread_messages_count',
  });
  const data = await rozetkaFetch<{ chats: RozetkaChat[]; _meta: { pageCount: number } }>(`/messages/search?${params.toString()}`);
  return { chats: data.chats ?? [], pageCount: data._meta?.pageCount ?? 1 };
}

export async function getRozetkaChatThread(chatId: number): Promise<RozetkaChat> {
  return rozetkaFetch<RozetkaChat>(`/messages/${chatId}?expand=messages,unread_messages_count`);
}

export async function replyRozetkaChat(params: { chatId: number; receiverId: number; body: string }): Promise<void> {
  await rozetkaFetch('/messages/create', {
    method: 'POST',
    body: JSON.stringify({
      chat_id:       params.chatId,
      receiver_id:   params.receiverId,
      body:          params.body,
      sendEmailUser: 1,
    }),
  });
}

export async function markRozetkaChatRead(chatId: number): Promise<void> {
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
  await rozetkaFetch(`/messages/${chatId}`, {
    method: 'PUT',
    body: JSON.stringify({ read_market: now }),
  });
}

export async function getRozetkaChatCounts(): Promise<{ totalUnread: number }> {
  const data = await rozetkaFetch<{ totalUnread?: number }>('/messages/counts');
  return { totalUnread: Number(data.totalUnread) || 0 };
}

/* ── Відгуки (/market-reviews — про магазин, /item-comments — про товари) ────
   Живі запити 2026-07-26: обидва search працюють ({marketReviews|itemComments,
   _meta}), counts віддають {all, unread}. Відповідь на відгук про магазин —
   POST /market-review-replies/reply; на коментар/питання про товар —
   POST /item-comments/create-comment (parent_id = id материнського відгуку). */

export interface RozetkaMarketReview {
  id: number;
  order_id: number | null;
  user: string | null;
  comment: string | null;
  created_at: string | null;
  vote?: string | null;                    // like / dislike
  vote_convenience?: string | null;
  vote_manager?: string | null;
  vote_delivery?: string | null;
  vote_payment?: string | null;
  read?: boolean | number | null;
  order?: {
    current_seller_comment?: string | null;
    seller_comment?: unknown[];
    ttn?: string | null;
  } | null;
}

export interface RozetkaItemComment {
  id: number;
  parent_id: number | null;
  seller_id: number | null;
  name: string | null;
  text: string | null;
  mark: number | null;                     // оцінка 1–5 (0 — без оцінки)
  dignity: string | null;                  // переваги
  shortcomings: string | null;             // недоліки
  created: string | null;
  is_reade: boolean | null;
  from_buyer: number | null;
  has_children: boolean | null;
  children?: RozetkaItemComment[];
  record?: { id: string | number; title: string } | null;   // товар
  item?: { id: number; name?: string } | null;
}

export async function getRozetkaMarketReviews(page = 1): Promise<{ reviews: RozetkaMarketReview[]; pageCount: number }> {
  const data = await rozetkaFetch<{ marketReviews: RozetkaMarketReview[]; _meta: { pageCount: number } }>(
    `/market-reviews/search?page=${page}&pageSize=50`,
  );
  return { reviews: data.marketReviews ?? [], pageCount: data._meta?.pageCount ?? 1 };
}

export async function getRozetkaItemComments(page = 1): Promise<{ comments: RozetkaItemComment[]; pageCount: number }> {
  const data = await rozetkaFetch<{ itemComments: RozetkaItemComment[]; _meta: { pageCount: number } }>(
    `/item-comments/search?page=${page}`,
  );
  return { comments: data.itemComments ?? [], pageCount: data._meta?.pageCount ?? 1 };
}

export async function getRozetkaReviewCounts(): Promise<{ marketUnread: number; itemsUnread: number }> {
  const [market, items] = await Promise.all([
    rozetkaFetch<{ unread?: number }>('/market-reviews/counts').catch(() => ({ unread: 0 })),
    rozetkaFetch<{ unread?: number }>('/item-comments/counts').catch(() => ({ unread: 0 })),
  ]);
  return { marketUnread: Number(market.unread) || 0, itemsUnread: Number(items.unread) || 0 };
}

export async function replyRozetkaMarketReview(params: { marketReviewId: number; orderId: number; comment: string }): Promise<void> {
  await rozetkaFetch('/market-review-replies/reply', {
    method: 'POST',
    body: JSON.stringify({
      market_review_id: params.marketReviewId,
      order_id:         params.orderId,
      comment:          params.comment,
    }),
  });
}

export async function replyRozetkaItemComment(params: { parentId: number; itemId?: number; text: string }): Promise<void> {
  await rozetkaFetch('/item-comments/create-comment', {
    method: 'POST',
    body: JSON.stringify({
      parent_id: params.parentId,
      item_id:   params.itemId,
      text:      params.text,
      is_reade:  1,
    }),
  });
}

export async function markRozetkaMarketReviewRead(id: number): Promise<void> {
  await rozetkaFetch(`/market-reviews/${id}/mark-as-read`, { method: 'POST' });
}

export async function markRozetkaItemCommentRead(id: number): Promise<void> {
  await rozetkaFetch(`/item-comments/mark-as-read/${id}`, { method: 'PUT' });
}

/* ── Рейтинг продавця (/markets/seller-rating) ──────────────────────────────
   Живий запит 2026-07-26: зірки, розподіл оцінок, середні по категоріях за
   30/180 днів/весь час, середній час до дзвінка (хв) і до відправки (хв). */

export interface RozetkaSellerRating {
  stars: number;
  mark_all_cnt: number;
  mark_excellent_cnt: number;
  mark_good_cnt: number;
  mark_middle_cnt: number;
  mark_bad_cnt: number;
  mark_worst_cnt: number;
  manager_avg_stars: { '30_days': number; '180_days': number; all: number };
  convenience_avg_stars: { '30_days': number; '180_days': number; all: number };
  delivery_avg_stars: { '30_days': number; '180_days': number; all: number };
  user_feedback_perc: number;
  avg_diff_order_call: number;      // хвилини до першого дзвінка по замовленню
  avg_diff_delivery_time: number;   // хвилини до відправки
}

export async function getRozetkaSellerRating(): Promise<RozetkaSellerRating> {
  return rozetkaFetch<RozetkaSellerRating>('/markets/seller-rating');
}

/* ── Mapping helpers ────────────────────────────────────────────────────── */

export function rozetkaOrderToOurFormat(order: RozetkaOrder) {
  const contact = order.user_title?.full_name?.trim()
    || order.delivery?.recipient_title?.trim()
    || 'Клієнт Rozetka';

  const del = order.delivery;
  const cityName = del?.city?.city_name ?? del?.city?.title ?? '';

  // delivery_service_name isn't a fixed enum on Rozetka's side — normalize the common case
  // (Nova Poshta) and fall back to a generic "courier" bucket otherwise, matching the shape
  // the rest of the app (Prom sync, order form) already uses for delivery_type.
  const serviceName = (del?.delivery_service_name ?? '').toLowerCase();
  const deliveryType = serviceName.includes('нова') || serviceName.includes('пошта')
    ? 'nova_poshta'
    : 'courier';
  const isPostomat = serviceName.includes('поштомат');

  const addressParts = [
    del?.place_number ? `${isPostomat ? 'Поштомат' : 'Відділення'} №${del.place_number}` : null,
    del?.place_street,
    del?.place_house,
    del?.place_flat ? `кв. ${del.place_flat}` : null,
  ].filter(Boolean);
  const deliveryAddress = [cityName, ...addressParts].filter(Boolean).join(', ');

  // Спосіб оплати. Rozetka: payment_type 'cash' — накладений платіж (сплата при
  // отриманні), інше (card тощо) — передоплата, ЯКЩО payment_status.name='paid'
  // (гроші вже надійшли, Rozetka розрахується з нами при виплаті). Без ознаки
  // оплати картковий заказ лишається invoice/до сплати.
  const isPaid = order.payment?.payment_status?.name === 'paid';
  let paymentType: string;
  if (order.payment?.payment_type === 'cash') paymentType = 'cod';
  else if (isPaid)                            paymentType = 'prepaid';
  else                                        paymentType = 'invoice';
  const paid = isPaid;

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
    // No real Nova Poshta refs available from Rozetka's own delivery payload (city.ref_id is a
    // Rozetka-internal id, not an NP SettlementRef — verified live, getWarehouses against it
    // returns zero results) — only the human-readable city name and postomat/warehouse hint,
    // which the TTN-creation modal resolves via a live NP search instead.
    delivery_city_name: cityName || null,
    // НП: поштомат / адресна (кур'єр — є вулиця+будинок, немає номера відділення) / відділення
    delivery_subtype:   deliveryType === 'nova_poshta'
      ? (isPostomat ? 'postomat' as const : (!del?.place_number && del?.place_house ? 'address' as const : 'warehouse' as const))
      : null,
    payment_type:     paymentType,
    paid,
    comment:          order.comment,
    items,
    total_price:      totalPrice,
    status:           'new' as const,
    channel_code:     'rozetka' as const,
    rozetka_order_id: order.id,
    rozetka_data:     order,
  };
}

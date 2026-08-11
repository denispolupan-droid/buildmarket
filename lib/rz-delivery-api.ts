/**
 * Мережевий шар «ROZETKA Доставки» (rz-delivery.rozetka.ua). Чисті хелпери —
 * в lib/rz-delivery.ts, тут усе, що ходить у мережу і читає ключі.
 *
 * Токен — статичний, з кабінету партнера (Налаштування → Ідентифікатори API,
 * картка «Rozetka Delivery»). Живе в app_settings.rz_delivery_token, env — лише
 * фолбек: ключ міняють у кабінеті, і бігати за деплоєм заради нього не треба.
 * Той самий precedence, що в np-api.getNpApiKey().
 *
 * Довідники (міста/відділення) свідомо ходять БЕЗ токена: upstream віддає їх
 * анонімно, а значить публічний проксі чекауту не має жодного шансу спалити
 * ключ, навіть якщо в ньому колись знайдеться дірка.
 */
import { createServiceClient } from './supabase';
import {
  RZ_API_URL, RZ_CARRIER_ROZETKA,
  type RzCity, type RzDepartment,
} from './rz-delivery';

export const RZ_TOKEN_KEY   = 'rz_delivery_token';
export const RZ_SENDER_KEY  = 'rz_delivery_sender';
export const RZ_BOX_KEY     = 'rz_delivery_box';
export const RZ_ENABLED_KEY = 'rz_delivery_enabled';

/** Відправник: точка здачі + контакт. Заповнюється в Налаштування → ROZETKA Доставка. */
export type RzSender = {
  city: string;          // uuid населеного пункту
  department: string;    // uuid точки здачі
  first_name: string;
  last_name: string;
  middle_name?: string;
  phone: string;         // 380XXXXXXXXX
  name?: string;         // назва організації, якщо потрібна
  /** Довідково для UI, у запит не йде. */
  department_label?: string;
  city_name?: string;
  weight_limit_kg?: number | null;
};

/** Габарити «коробки за замовчуванням», см. API вимагає їх обов'язково, а в
 *  каталозі габаритів немає — тому одна коробка на всіх, з правкою руками. */
export type RzBox = { length: number; width: number; height: number };

export const RZ_BOX_FALLBACK: RzBox = { length: 40, width: 30, height: 30 };

async function readSetting(key: string): Promise<string | null> {
  const { data } = await createServiceClient()
    .from('app_settings').select('value').eq('key', key).maybeSingle();
  return (data?.value as string | undefined) ?? null;
}

export async function getRzToken(): Promise<string> {
  return (await readSetting(RZ_TOKEN_KEY)) || process.env.RZ_DELIVERY_TOKEN || '';
}

/**
 * Рубильник способу доставки для покупця. За замовчуванням ВИМКНЕНО: код може
 * поїхати в прод раніше, ніж ми переконаємось на живій посилці, що накладна
 * створюється і сума післяплати збігається. Відсутній ключ = вимкнено, тож
 * забути й випадково відкрити доставку покупцям неможливо.
 *
 * Пізніше це ще й аварійний вимикач: якщо в Rozetka щось ляже, доставку треба
 * гасити галочкою в налаштуваннях, а не деплоєм.
 *
 * Не впливає на адмінку: створити накладну по вже оформленому замовленню можна
 * і при вимкненому способі — інакше після вимкнення «зависли» б замовлення,
 * які покупці встигли зробити.
 */
export async function isRzDeliveryEnabled(): Promise<boolean> {
  return (await readSetting(RZ_ENABLED_KEY)) === 'true';
}

export async function getRzSender(): Promise<RzSender | null> {
  const raw = await readSetting(RZ_SENDER_KEY);
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as RzSender;
    return s.city && s.department ? s : null;
  } catch { return null; }
}

export async function getRzBox(): Promise<RzBox> {
  const raw = await readSetting(RZ_BOX_KEY);
  if (!raw) return RZ_BOX_FALLBACK;
  try {
    const b = JSON.parse(raw) as Partial<RzBox>;
    const ok = (n: unknown): n is number => typeof n === 'number' && n > 0;
    return ok(b.length) && ok(b.width) && ok(b.height)
      ? { length: b.length, width: b.width, height: b.height }
      : RZ_BOX_FALLBACK;
  } catch { return RZ_BOX_FALLBACK; }
}

type RzValidationDetail = { property?: string; constraints?: Record<string, string> };
type RzEnvelope<T> = {
  statusCode?: number; data?: T;
  message?: string | string[] | Record<string, unknown>;
  error?: string;
  details?: RzValidationDetail[];
};

export class RzError extends Error {
  constructor(message: string, readonly status: number) { super(message); this.name = 'RzError'; }
}

/**
 * Текст помилки з відповіді. Валідаційні причини лежать окремо, в details, і без
 * них повідомлення «Помилка валідації даних» не каже нічого — а саме воно й
 * приходить при кривому телефоні чи нульовій оголошеній вартості.
 */
function rzErrorText(body: RzEnvelope<unknown> | null, httpStatus: number): string {
  const m = body?.message;
  const head = Array.isArray(m) ? m.filter(Boolean).join('; ')
    : typeof m === 'string' ? m
    : (body?.error ?? '');
  const details = (body?.details ?? [])
    .map(d => `${d.property ?? ''}: ${Object.values(d.constraints ?? {}).join(', ')}`.trim())
    .filter(s => s.length > 2);
  const text = [head, ...details].filter(Boolean).join(' — ');
  return text || `ROZETKA Доставка: HTTP ${httpStatus}`;
}

/** Виклик із токеном — для «своїх» операцій (накладні, баланс, етикетки). */
export async function rzFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getRzToken();
  if (!token) throw new RzError('Токен ROZETKA Доставки не налаштовано (Налаштування → ROZETKA Доставка)', 400);
  return rzRequest<T>(path, init, token);
}

/** Виклик без токена — довідники. */
export async function rzPublicFetch<T>(path: string): Promise<T> {
  return rzRequest<T>(path, {}, null);
}

async function rzRequest<T>(path: string, init: RequestInit, token: string | null): Promise<T> {
  const res = await fetch(`${RZ_API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
    cache: 'no-store',
  });

  let body: RzEnvelope<T> | null = null;
  try { body = await res.json() as RzEnvelope<T>; } catch { /* нижче впаде на HTTP-статусі */ }

  if (!res.ok) throw new RzError(rzErrorText(body, res.status), res.status);
  // statusCode 0 — «успіх» у їхній нотації; будь-що інше при HTTP 200 теж помилка
  if (body?.statusCode != null && body.statusCode !== 0) {
    throw new RzError(rzErrorText(body, res.status), res.status);
  }
  return (body?.data ?? body) as T;
}

// ── Довідники ─────────────────────────────────────────────────────────────

type Paginated<T> = { data?: T[]; pagination?: { page_count?: number } };

/** Міста за фрагментом назви. Порожній запит — не ходимо взагалі. */
export async function rzSearchCities(query: string, limit = 12): Promise<RzCity[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const url = `/api/city?name=${encodeURIComponent(q)}&can_give_out_tracks=true&sort_by_population=desc&limit=${limit}`;
  const res = await rzPublicFetch<RzCity[] | Paginated<RzCity>>(url);
  return Array.isArray(res) ? res : (res.data ?? []);
}

/**
 * Точки видачі міста. Без параметра carrier API віддає ТІЛЬКИ магазини Розетки —
 * саме те, що нам зараз треба, але покладатися на замовчування не варто: коли
 * ввімкнемо Meest, різниця з'явиться мовчки. Тому перевізник завжди явний.
 */
export async function rzDepartments(cityId: string, carrier = RZ_CARRIER_ROZETKA): Promise<RzDepartment[]> {
  if (!cityId) return [];
  const out: RzDepartment[] = [];
  // Пагінація: у великих містах точок більше, ніж дефолтна сторінка, а обрізаний
  // список — це «моєї точки немає» для покупця.
  for (let page = 1; page <= 10; page++) {
    const url = `/api/department?city_id=${encodeURIComponent(cityId)}&carrier=${encodeURIComponent(carrier)}`
      + `&can_give_out_tracks=true&limit=100&page=${page}`;
    const res = await rzPublicFetch<RzDepartment[] | Paginated<RzDepartment>>(url);
    const rows = Array.isArray(res) ? res : (res.data ?? []);
    out.push(...rows);
    const pageCount = Array.isArray(res) ? 1 : (res.pagination?.page_count ?? 1);
    if (page >= pageCount || rows.length === 0) break;
  }
  return out;
}

/** Точки, куди МИ можемо здавати відправлення (екран налаштувань). */
export async function rzSenderDepartments(cityId: string): Promise<RzDepartment[]> {
  const all = await rzDepartments(cityId);
  return all.filter(d => d.can_receive_tracks);
}

// ── Накладні ──────────────────────────────────────────────────────────────

export type RzCounterparty = {
  city: string;
  department: string;
  first_name: string;
  last_name: string;
  middle_name?: string;
  name?: string;
  /**
   * РЯДОК «380XXXXXXXXX», а НЕ масив — попри `type: array` в їхньому ж
   * OpenAPI. Перевірено пробним запитом: з масивом валідатор відповідає
   * «phone must be a string», і накладна не створюється. Док тут бреше, і
   * помітити це можна було б тільки в момент першої реальної відправки.
   */
  phone: string;
};

export type RzCreateTrackInput = {
  visible_id?: string;
  description?: string;
  type: string;
  places: number;
  delivery_payer: 'sender' | 'receiver';
  /** Сума післяплати до стягнення з отримувача. Передоплачене замовлення — 0. */
  cost: number;
  /** Оголошена вартість, строго > 0. */
  insurance_cost: number;
  params: { weight: number; length: number; width: number; height: number; volume?: number };
  carrier?: string;
  sender: RzCounterparty;
  recipient: RzCounterparty;
};

export type RzCreateTrackResult = {
  track_id: string;
  shipping_cost: number;
  delivery_date?: string;
  payment_fee?: number;
  payment_fee_details?: { percentage: number; additional: number; payment_fee_limit: number };
  carrier_track_num?: string;
};

export async function rzCreateTrack(data: RzCreateTrackInput): Promise<RzCreateTrackResult> {
  const volume = Number(((data.params.length * data.params.width * data.params.height) / 1_000_000).toFixed(6));
  return rzFetch<RzCreateTrackResult>('/api/track', {
    method: 'POST',
    body: JSON.stringify({ data: { ...data, params: { ...data.params, volume } } }),
  });
}

export type RzTrackStatus = {
  track_id: string;
  last_status: { status: string; status_name: string; date: string };
  statuses?: { status: string; status_name: string; date: string }[];
};

const idQuery = (ids: string[]) => ids.map(id => `id=${encodeURIComponent(id)}`).join('&');

/** Ліміт API на один запит статусів/етикеток. */
const RZ_ID_BATCH = 100;

/**
 * Статуси пачкою. Дві незручності, які тут і закриваються:
 *  — більше 100 номерів за раз API не приймає (arrayMaxSize);
 *  — якщо ХОЧА Б ОДИН номер невідомий, весь запит падає 404. Живий сценарій:
 *    накладну видалили в кабінеті, а замовлення з нею лишилось — і тоді без
 *    фолбеку по одному крон переставав бачити рух усіх інших посилок.
 */
export async function rzTrackStatuses(ids: string[]): Promise<RzTrackStatus[]> {
  const unique = [...new Set(ids.filter(Boolean))];
  const out: RzTrackStatus[] = [];
  for (let i = 0; i < unique.length; i += RZ_ID_BATCH) {
    const chunk = unique.slice(i, i + RZ_ID_BATCH);
    try {
      out.push(...await rzFetch<RzTrackStatus[]>(`/api/track/status?${idQuery(chunk)}`));
      continue;
    } catch (err) {
      const notFound = err instanceof RzError && err.status === 404;
      // 404 на пачці не каже, ЯКИЙ номер зайвий — тому перепитуємо поштучно.
      // Будь-яка інша помилка (токен, 5xx) стосується всіх — піднімаємо вище.
      if (!notFound) throw err;
      if (chunk.length === 1) continue;
    }
    for (const id of chunk) {
      try { out.push(...await rzFetch<RzTrackStatus[]>(`/api/track/status?${idQuery([id])}`)); }
      catch (err) { if (!(err instanceof RzError) || err.status !== 404) throw err; }
    }
  }
  return out;
}

/** PDF-етикетки пачкою, base64. */
export async function rzLabel(ids: string[]): Promise<string> {
  const res = await rzFetch<{ label: string }>(`/api/track/label?${idQuery(ids)}`);
  return res.label;
}

/**
 * Заборона видачі / повернення відправником (група статусів 700).
 * Потрібна, коли замовлення скасували вже після передачі перевізникові: без
 * цього посилка так і лежатиме в точці до кінця терміну зберігання, а зберігання
 * після нього починає коштувати грошей.
 */
export async function rzReturnTrack(trackId: string, reason: string): Promise<{ track_id?: string } | null> {
  return rzFetch<{ track_id?: string }>('/api/track/return', {
    method: 'POST',
    body: JSON.stringify({ data: { track_id: trackId, reason } }),
  });
}

export async function rzDeleteTrack(ids: string[]): Promise<void> {
  await rzFetch('/api/track', { method: 'DELETE', body: JSON.stringify({ data: ids }) });
}

export type RzPartner = {
  id: number; name: string; status: string; phone: string; email: string;
  contact_person?: string; is_legal?: boolean;
  autoblock_date?: string | null; autoblock_days?: number | null;
};

/**
 * Хто ми для Rozetka. /api/auth/verify — єдиний спосіб перевірити токен, не
 * створивши нічого: він же показує статус партнера (не 'active' — накладні не
 * оформлюються) і дату автоблокування при боргу.
 *
 * Відповідь плоска, без обгортки data — тому дістаємо її окремо від rzFetch.
 */
export async function rzVerify(): Promise<RzPartner> {
  return rzFetch<RzPartner>('/api/auth/verify');
}

/** Логістичний баланс. Від'ємний — Rozetka блокує створення накладних. */
export async function rzBalance(): Promise<{ amount: number; closed: boolean } | null> {
  try {
    const b = await rzFetch<{ amount: number; closed: boolean }>('/api/billing/balance');
    return b ?? null;
  } catch { return null; }
}

// ── Реєстри ЕН ────────────────────────────────────────────────────────────
//
// Реєстр — це пачка накладних, яку віддають на точці одним документом. Логіка
// «додати в реєстр» свідомо повторює звичку менеджера з Нової Пошти: він тисне
// кнопку на замовленні й не думає, який реєстр зараз відкритий. Тому спершу
// пробуємо дописати в найсвіжіший СЬОГОДНІШНІЙ реєстр, і лише якщо не вийшло
// (його вже здали, а статуси реєстрів у доці не описані) — заводимо новий.

export type RzReception = { id: number; created_at: string; tracks_amount: number; status?: { id: string; name: string } };

export async function rzReceptionsToday(): Promise<RzReception[]> {
  const today = new Date().toISOString().slice(0, 10);
  const res = await rzFetch<RzReception[]>(`/api/reception/list?limit=20&created_date_start=${today}`);
  return Array.isArray(res) ? res : [];
}

export type RzReceptionResult = { reception_id: number; rejected_tracks?: string[]; created: boolean };

export async function rzAddToReception(trackIds: string[], department?: string): Promise<RzReceptionResult> {
  const open = (await rzReceptionsToday().catch(() => []))
    .sort((a, b) => b.id - a.id)[0];

  if (open) {
    try {
      const res = await rzFetch<{ reception_id: number; rejected_tracks?: string[] }>(
        `/api/reception/add-tracks/${open.id}`,
        { method: 'PATCH', body: JSON.stringify({ data: { track_nums: trackIds } }) },
      );
      return { ...res, reception_id: res.reception_id ?? open.id, created: false };
    } catch {
      // Реєстр уже здано або закрито — нижче заведемо новий
    }
  }

  const res = await rzFetch<{ reception_id: number; rejected_tracks?: string[] }>(
    '/api/reception/create',
    { method: 'POST', body: JSON.stringify({ data: { track_nums: trackIds, ...(department ? { department } : {}) } }) },
  );
  return { ...res, created: true };
}

/** Друкована форма реєстру: base64 або посилання — що віддасть API. */
export async function rzReceptionPrint(id: number): Promise<{ base64?: string; url?: string }> {
  return rzFetch<{ base64?: string; url?: string }>(`/api/reception/print/${id}`);
}

export const RZ_MIN_BALANCE_KEY = 'rz_delivery_min_balance';
/**
 * За замовчуванням лаємось лише на ВІД'ЄМНИЙ баланс. У партнера з постоплатою
 * (has_prepayment=false) нуль — робочий стан, і поріг «100 грн» перетворив би
 * щогодинний крон на джерело алерту, який завжди правдивий і тому нічого не
 * означає. Хто хоче запас — ставить поріг у app_settings.
 */
const RZ_MIN_BALANCE_FALLBACK = 0;

/**
 * Сторож логістичного балансу — чіпляється до щогодинного крона доставки.
 *
 * Без нього борг помітно тільки тоді, коли Rozetka відмовить у створенні
 * накладної: у неї є автоблокування партнера (autoblock_date у /auth/verify), і
 * настає воно мовчки. Ціна пропуску асиметрична — на боці «зайвий раз написали»
 * лише повідомлення в Telegram (та й те з тротлінгом у 30 хвилин по заголовку),
 * на боці «не написали» — заблоковані відправлення в розпал дня.
 *
 * Помилки ковтаємо: сторож балансу не має права зривати синк посилок.
 */
export async function checkRzBalanceAlert(): Promise<void> {
  try {
    if (!await getRzToken()) return;

    const raw = await readSetting(RZ_MIN_BALANCE_KEY);
    const min = Number.isFinite(Number(raw)) && raw ? Number(raw) : RZ_MIN_BALANCE_FALLBACK;

    const [balance, partner] = await Promise.all([
      rzBalance(),
      rzVerify().catch(() => null),
    ]);

    const { alertAdmin } = await import('./alert');

    if (partner && partner.status !== 'active') {
      alertAdmin('ROZETKA Доставка: партнер не активний', `Статус «${partner.status}» — накладні не оформляться`);
    }
    if (partner?.autoblock_date) {
      alertAdmin('ROZETKA Доставка: автоблокування',
        `Заблокують ${partner.autoblock_date}${partner.autoblock_days != null ? ` (лишилось ${partner.autoblock_days} дн.)` : ''}`);
    }
    if (balance && balance.amount < min) {
      alertAdmin('ROZETKA Доставка: низький логістичний баланс',
        `${balance.amount} грн (поріг ${min} грн). Поповніть у кабінеті rozetka.delivery`);
    }
  } catch (err) {
    console.error('[rz-delivery balance check]', err);
  }
}

// Єдина точка виклику API Нової Пошти. Ключ береться з app_settings.np_api_key,
// і лише як фолбек — з env: у налаштуваннях адмінки лежить ключ ФОП, під яким
// створюються ЕН, а в env може бути інший/застарілий. Для методів, що працюють
// із чужими документами (трекінг), різниці немає, але для «своїх» операцій
// (повернення, видалення ЕН) чужий ключ дає «Документ не належить даному
// користувачу» — тому precedence саме такий, як у /api/admin/create-ttn.

import { fetchWithTimeout } from './fetch-timeout';
import { withNpRetry } from './np-retry';

export const NP_URL = 'https://api.novaposhta.ua/v2.0/json/';

export type NpResponse<T> = {
  success: boolean;
  data: T[];
  errors: string[];
  warnings: string[];
  info: unknown[];
};

export async function npCall<T = Record<string, unknown>>(
  apiKey: string,
  modelName: string,
  calledMethod: string,
  methodProperties: object = {},
): Promise<NpResponse<T>> {
  // Ліміт запитів НП («To many requests») — повторюємо з паузою, див. lib/np-retry
  return withNpRetry(async () => {
    const res = await fetchWithTimeout(NP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey, modelName, calledMethod, methodProperties }),
    });
    return res.json() as Promise<NpResponse<T>>;
  });
}

export async function getNpApiKey(): Promise<string> {
  // Динамічний імпорт: lib/supabase валідує env ще на імпорті, а цей модуль має
  // лишатися придатним для юніт-тестів чистих функцій нижче, без .env.
  const { createServiceClient } = await import('./supabase');
  const { readSetting } = await import('./secrets');
  return (await readSetting(createServiceClient(), 'np_api_key')) || process.env.NOVA_POSHTA_API_KEY || '';
}

/**
 * Назва відділення/поштомату НП за його Ref («Відділення №447 (до 30 кг): вул. …»).
 * Ручне замовлення інколи доходило до бази з Ref відділення, але без назви
 * (9 замовлень з 01.09 по 06.11.2026) — картка показувала лише місто. Сервер
 * добирає назву сам; помилка НП не має валити створення замовлення → null.
 */
export async function npWarehouseDescription(ref: string): Promise<string | null> {
  if (!ref) return null;
  try {
    const res = await npCall<{ Description?: string }>(await getNpApiKey(), 'Address', 'getWarehouses', { Ref: ref, Limit: 1, Page: 1 });
    return res.success ? (res.data?.[0]?.Description?.trim() || null) : null;
  } catch {
    return null;
  }
}

export const npError = (res: NpResponse<unknown>, fallback: string) =>
  res.errors?.filter(Boolean).join('; ') || fallback;

/**
 * PDF маркування 100×100 для списку ТТН одним документом (сторінка на ТТН).
 * Друкована форма живе не в api.novaposhta.ua, а на my.novaposhta.ua; кілька
 * номерів передаються ПОВТОРЕННЯМ сегмента orders[] (перевірено наживо: кома
 * всередині одного сегмента дає порожню відповідь). На чужу/неіснуючу ТТН НП
 * віддає HTML-сторінку замість PDF — тому перевірка магічних байтів.
 */
export async function npMarkingPdf(apiKey: string, ttns: string[]): Promise<Buffer> {
  if (!apiKey) throw new Error('API ключ НП не налаштовано');
  const segs = ttns.map(t => `orders[]/${encodeURIComponent(t)}`).join('/');
  const res = await fetchWithTimeout(`https://my.novaposhta.ua/orders/printMarking100x100/${segs}/type/pdf/apiKey/${apiKey}`, undefined, 30_000);
  const buf = Buffer.from(await res.arrayBuffer());
  if (!res.ok || buf.subarray(0, 4).toString() !== '%PDF') {
    throw new Error('НП не віддала етикетки — перевірте, що ТТН створені під ключем із Налаштувань');
  }
  return buf;
}

// НП валідує текстові коментарі (Note у заявках) жорсткіше, ніж описано в доках.
// Перевірено живими викликами по неіснуючій ТТН, щоб нічого не створити:
// «Note is incorrect» дають латинські літери, «#» і «:»; кирилиця, цифри, пробіл
// і «. , - / « » ’» проходять, довжина 200+ теж. Без цієї чистки нешкідливий на
// вигляд «Повернення по замовленню #26071048» валив створення заявки цілком.
const NOTE_DISALLOWED = /[^А-Яа-яЁёІіЇїЄєҐґ0-9 .,\-/«»’]/g;

export function sanitizeNpNote(raw: string): string {
  return raw
    .replace(/['`]/g, '’')
    .replace(NOTE_DISALLOWED, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
}

/**
 * Офіційна друкована форма реєстру (та сама, що друкує кабінет НП): my.novaposhta.ua
 * віддає PDF по Ref реєстру. Перевірено живим викликом 01.09.2026 (200, %PDF, ~200 КБ).
 * Увага: після друку НП позначає реєстр Printed=1 і нові ЕН у нього вже не приймає —
 * так само, як при друку з кабінету.
 */
export async function npScanSheetPdf(apiKey: string, refs: string[]): Promise<Buffer> {
  if (!apiKey) throw new Error('API ключ НП не налаштовано');
  if (!refs.length) throw new Error('Не вказано реєстр');
  const segs = refs.map(r => `refs[]/${encodeURIComponent(r)}`).join('/');
  const res = await fetchWithTimeout(`https://my.novaposhta.ua/scanSheet/printScanSheet/${segs}/type/pdf/apiKey/${apiKey}`, undefined, 30_000);
  const buf = Buffer.from(await res.arrayBuffer());
  if (!res.ok || buf.subarray(0, 4).toString() !== '%PDF') {
    throw new Error('НП не віддала друковану форму реєстру — перевірте, що реєстр створений під ключем із Налаштувань');
  }
  return buf;
}

/**
 * Текст помилки з відповіді НП. `errors` буває масивом рядків, а буває
 * обʼєктом { поле: 'текст' } (03.11.2026: видалення вже видаленої ЕН дало
 * `e.errors?.join is not a function` і 500 замість відповіді менеджеру).
 */
export function npErrorText(res: unknown, fallback: string): string {
  const e = (res as { errors?: unknown } | null)?.errors;
  if (Array.isArray(e)) return e.map(String).join('; ') || fallback;
  if (e && typeof e === 'object') return Object.values(e as Record<string, unknown>).flat().map(String).join('; ') || fallback;
  if (typeof e === 'string' && e) return e;
  return fallback;
}

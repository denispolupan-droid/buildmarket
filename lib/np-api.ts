// Єдина точка виклику API Нової Пошти. Ключ береться з app_settings.np_api_key,
// і лише як фолбек — з env: у налаштуваннях адмінки лежить ключ ФОП, під яким
// створюються ЕН, а в env може бути інший/застарілий. Для методів, що працюють
// із чужими документами (трекінг), різниці немає, але для «своїх» операцій
// (повернення, видалення ЕН) чужий ключ дає «Документ не належить даному
// користувачу» — тому precedence саме такий, як у /api/admin/create-ttn.

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
  const res = await fetch(NP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey, modelName, calledMethod, methodProperties }),
  });
  return res.json() as Promise<NpResponse<T>>;
}

export async function getNpApiKey(): Promise<string> {
  // Динамічний імпорт: lib/supabase валідує env ще на імпорті, а цей модуль має
  // лишатися придатним для юніт-тестів чистих функцій нижче, без .env.
  const { createServiceClient } = await import('./supabase');
  const { data } = await createServiceClient()
    .from('app_settings')
    .select('value')
    .eq('key', 'np_api_key')
    .maybeSingle();
  return (data?.value as string | undefined) || process.env.NOVA_POSHTA_API_KEY || '';
}

export const npError = (res: NpResponse<unknown>, fallback: string) =>
  res.errors?.filter(Boolean).join('; ') || fallback;

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

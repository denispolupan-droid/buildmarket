import { createServiceClient } from './supabase-service';

/**
 * Секрети інтеграцій — у Supabase Vault, не в app_settings (аудит 31.10.2026,
 * §5 Medium / п. 14: токени відкритим текстом у таблиці, яку читає будь-який
 * серверний запит і бекап). Доступ — лише через SECURITY DEFINER-функції
 * secret_get/secret_set/secret_delete (міграція 150), EXECUTE у anon/authenticated
 * відкликано; Vault шифрує значення на диску й у дампах.
 *
 * Код працює через readSetting/writeSetting/deleteSetting: для ключів із
 * SECRET_KEYS вони йдуть у Vault, для решти — в app_settings, тож викликачу не
 * треба знати, де що лежить. Додаєш новий токен — додай ключ сюди.
 */
type Db = ReturnType<typeof createServiceClient>;

export const SECRET_KEYS: ReadonlySet<string> = new Set([
  'np_api_key',
  'prom_api_token',
  'rozetka_password', 'rozetka_token', 'rozetka_api_token',
  'rozetkapay_api_password',
  'epicentr_api_token',
  'rz_delivery_token',
  // Meest Пошта (договір 10031120, 13.11.2026): логін/пароль API і поточні токени
  'meest_api_username', 'meest_api_password', 'meest_api_token', 'meest_api_refresh_token',
  'mono_personal_token', 'mono_webhook_secret',
  'novapay_refresh_token', 'novapay_refresh_token_prev', 'novapay_certificate', 'novapay_certificate_prev', 'novapay_jwt',
  'google_ads_client_secret', 'google_ads_developer_token', 'google_ads_refresh_token',
]);

export const isSecretKey = (key: string): boolean => SECRET_KEYS.has(key);

export async function getSecret(db: Db, key: string): Promise<string | null> {
  const { data, error } = await db.rpc('secret_get', { p_name: key });
  if (error) throw new Error(`secret_get(${key}): ${error.message}`);
  const v = (data ?? '').trim();
  return v || null;
}

export async function setSecret(db: Db, key: string, value: string): Promise<void> {
  const { error } = await db.rpc('secret_set', { p_name: key, p_value: value });
  if (error) throw new Error(`secret_set(${key}): ${error.message}`);
}

export async function deleteSecret(db: Db, key: string): Promise<void> {
  const { error } = await db.rpc('secret_delete', { p_name: key });
  if (error) throw new Error(`secret_delete(${key}): ${error.message}`);
}

/** Значення налаштування або null (порожнє = null); секрети — з Vault. */
export async function readSetting(db: Db, key: string): Promise<string | null> {
  if (isSecretKey(key)) return getSecret(db, key);
  const { data } = await db.from('app_settings').select('value').eq('key', key).maybeSingle();
  const v = (data?.value ?? '').trim();
  return v || null;
}

/** Кілька ключів одразу → { key: value } (відсутні/порожні пропускаються). */
export async function readSettings(db: Db, keys: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const plain = keys.filter(k => !isSecretKey(k));
  const secret = keys.filter(isSecretKey);
  if (plain.length) {
    const { data, error } = await db.from('app_settings').select('key, value').in('key', plain);
    if (error) throw error;
    for (const r of data ?? []) { const v = (r.value ?? '').trim(); if (v) out[r.key] = v; }
  }
  await Promise.all(secret.map(async k => { const v = await getSecret(db, k); if (v) out[k] = v; }));
  return out;
}

export async function writeSetting(db: Db, key: string, value: string): Promise<void> {
  if (isSecretKey(key)) return setSecret(db, key, value);
  const { error } = await db.from('app_settings').upsert({ key, value }, { onConflict: 'key' });
  if (error) throw new Error(`app_settings(${key}): ${error.message}`);
}

export async function deleteSetting(db: Db, key: string): Promise<void> {
  if (isSecretKey(key)) return deleteSecret(db, key);
  const { error } = await db.from('app_settings').delete().eq('key', key);
  if (error) throw new Error(`app_settings(${key}): ${error.message}`);
}

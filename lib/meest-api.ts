/**
 * Meest Пошта — власне API (договір 10031120, 13.11.2026).
 *
 * Менеджер Meest підтвердив: договір, укладений для Епіцентру, можна вести й під
 * відправки сайту. API — https://api.meest.com/v3.0/openAPI (специфікація:
 * wiki.meest-group.com/api/files/openAPI_ua.json). Автентифікація: POST /auth
 * (логін і пароль) → token (заголовок `token`) + refresh_token; продовження —
 * POST /refreshToken. Усе секретне — у Vault (lib/secrets, SECRET_KEYS);
 * ContractID договору — у app_settings (не секрет).
 *
 * Тут лише транспорт і токени. Відділення, розрахунок, посилки, стікер — окремі
 * модулі поверх meestFetch.
 */

import { createServiceClient } from './supabase';
import { readSetting, writeSetting } from './secrets';
import { fetchWithTimeout } from './fetch-timeout';

export const MEEST_API = 'https://api.meest.com/v3.0/openAPI';
/** Договір 10031120 «Полупан Денис Олександрович Епіцентр» (кабінет 24.meest.com → Налаштування → Договір) */
export const MEEST_CONTRACT_ID_DEFAULT = '93cd97bf-802e-11f1-a793-005056bc5535';

type Envelope<T> = { status?: string; message?: string; messageDetails?: string; fieldName?: string; result?: T; info?: { message?: string; messageDetails?: string } };
type TokenResult = { token?: string; refresh_token?: string; expiresIn?: number };

const db = () => createServiceClient();

export async function meestContractId(): Promise<string> {
  return (await readSetting(db(), 'meest_contract_id')) || MEEST_CONTRACT_ID_DEFAULT;
}

async function post<T>(path: string, body: unknown, token?: string): Promise<{ http: number; env: Envelope<T> }> {
  const res = await fetchWithTimeout(`${MEEST_API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(token ? { token } : {}) },
    body: JSON.stringify(body),
  });
  return { http: res.status, env: (await res.json().catch(() => ({}))) as Envelope<T> };
}

const errText = (e: Envelope<unknown>) =>
  [e.message, e.messageDetails, e.info?.message, e.info?.messageDetails].filter(Boolean).join(' — ') || 'невідома помилка';

async function saveTokens(r: TokenResult) {
  if (!r.token) throw new Error('Meest не повернув token');
  await writeSetting(db(), 'meest_api_token', r.token);
  if (r.refresh_token) await writeSetting(db(), 'meest_api_refresh_token', r.refresh_token);
}

/** Новий токен за логіном і паролем (з Vault або переданими — для скрипта підключення). */
export async function meestLogin(creds?: { username: string; password: string }): Promise<void> {
  const username = creds?.username ?? await readSetting(db(), 'meest_api_username');
  const password = creds?.password ?? await readSetting(db(), 'meest_api_password');
  if (!username || !password) throw new Error('Meest: немає логіна/пароля API (scripts/set-meest-credentials.ts)');
  const { http, env } = await post<TokenResult>('/auth', { username, password });
  if (http !== 200 || env.status !== 'OK' || !env.result?.token) throw new Error(`Meest /auth: ${http} — ${errText(env)}`);
  await saveTokens(env.result);
}

/** Оновити токен за refresh_token; не вийшло — повний логін. */
async function meestRefresh(): Promise<void> {
  const refreshToken = await readSetting(db(), 'meest_api_refresh_token');
  if (refreshToken) {
    const { http, env } = await post<TokenResult>('/refreshToken', { refreshToken });
    if (http === 200 && env.status === 'OK' && env.result?.token) { await saveTokens(env.result); return; }
  }
  await meestLogin();
}

/**
 * Запит до API з токеном. Протух (401) — оновлюємо й повторюємо один раз.
 * Повертає result конверта; status ≠ OK — помилка з текстом Meest.
 */
export async function meestFetch<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  let token = await readSetting(db(), 'meest_api_token');
  if (!token) { await meestLogin(); token = await readSetting(db(), 'meest_api_token'); }
  const call = async (t: string) => fetchWithTimeout(`${MEEST_API}${path}`, {
    method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', token: t },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });
  let res = await call(token!);
  if (res.status === 401) {
    await meestRefresh();
    res = await call((await readSetting(db(), 'meest_api_token'))!);
  }
  const env = (await res.json().catch(() => ({}))) as Envelope<T>;
  if (!res.ok || (env.status && env.status !== 'OK')) throw new Error(`Meest ${path}: ${res.status} — ${errText(env)}`);
  return (env.result ?? (env as unknown)) as T;
}

/** Двійкова відповідь (PDF стікера) — з тим самим токеном і повтором після 401. */
export async function meestFile(path: string): Promise<Buffer> {
  let token = await readSetting(db(), 'meest_api_token');
  if (!token) { await meestLogin(); token = await readSetting(db(), 'meest_api_token'); }
  const call = (t: string) => fetchWithTimeout(`${MEEST_API}${path}`, { headers: { token: t, Accept: 'application/pdf' } });
  let res = await call(token!);
  if (res.status === 401) { await meestRefresh(); res = await call((await readSetting(db(), 'meest_api_token'))!); }
  const buf = Buffer.from(await res.arrayBuffer());
  if (!res.ok || buf.subarray(0, 4).toString() !== '%PDF') {
    throw new Error(`Meest ${path}: ${res.status} — ${buf.toString('utf8').slice(0, 200) || 'не PDF'}`);
  }
  return buf;
}

export type MeestContractInfo = { contractID?: string; contract?: string; number?: string; edrpou?: string; allowedCOD?: boolean; dateTo?: string; client?: string; clientFullName?: string };

/** Перевірка доступу: дані договору (номер, ЄДРПОУ, чи дозволено наложку). */
export async function meestContractInfo(contractId?: string): Promise<MeestContractInfo> {
  const r = await meestFetch<MeestContractInfo | MeestContractInfo[]>(`/contractClientInfo/${encodeURIComponent(contractId ?? await meestContractId())}`);
  return Array.isArray(r) ? (r[0] ?? {}) : r;
}

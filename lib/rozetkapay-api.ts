/**
 * RozetkaPay API (спека: OpenAPI 3.0.3 «RozetkaPay payment API specification»,
 * base https://api.rozetkapay.com, BasicAuth login:password від підтримки
 * RozetkaPay; підходять і API_KEY/API_SECRET інших продуктів RozetkaPay).
 *
 * Для обліку потрібні лише звіти:
 *   POST /api/reports/v1/payments     — реєстр ВИПЛАЧЕНИХ операцій за датою виплати
 *   POST /api/reports/v1/transactions — транзакції (вікно ≤ 14 днів, ≤ 90 днів назад)
 *   GET  /api/merchants/v1/me         — перевірка ключів
 *
 * Ключі — в app_settings (rozetkapay_api_login / rozetkapay_api_password), як
 * токен Prom; env ROZETKAPAY_API_LOGIN / ROZETKAPAY_API_PASSWORD — запасний варіант.
 */
import { createServiceClient } from './supabase';

const BASE = 'https://api.rozetkapay.com';
export const RZPAY_LOGIN_KEY    = 'rozetkapay_api_login';
export const RZPAY_PASSWORD_KEY = 'rozetkapay_api_password';

export type RzPayCreds = { login: string; password: string };

export async function getRzPayCreds(): Promise<RzPayCreds | null> {
  const db = createServiceClient();
  const { data } = await db.from('app_settings').select('key, value').in('key', [RZPAY_LOGIN_KEY, RZPAY_PASSWORD_KEY]);
  const map = new Map((data ?? []).map(r => [r.key as string, r.value as string]));
  const login    = map.get(RZPAY_LOGIN_KEY)    || process.env.ROZETKAPAY_API_LOGIN    || '';
  const password = map.get(RZPAY_PASSWORD_KEY) || process.env.ROZETKAPAY_API_PASSWORD || '';
  return login && password ? { login, password } : null;
}

async function rzFetch<T>(creds: RzPayCreds, path: string, init?: RequestInit): Promise<T> {
  const auth = Buffer.from(`${creds.login}:${creds.password}`).toString('base64');
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`RozetkaPay ${path}: ${res.status} — ${text.slice(0, 300)}`);
  return (text ? JSON.parse(text) : {}) as T;
}

/** GET /api/merchants/v1/me — перевіряє ключі; кидає з текстом помилки RozetkaPay. */
export async function validateRzPayKeys(creds: RzPayCreds): Promise<Record<string, unknown>> {
  return rzFetch<Record<string, unknown>>(creds, '/api/merchants/v1/me');
}

/* Поля за схемою PaymentsReportRow (суми — рядки decimal) */
export interface RzPayPaymentRow {
  payment_id: string;
  external_id: string | null;
  unified_external_id?: string | null;
  amount: string;
  currency: string;
  internal_commission: string;
  payer_external_fee?: string;
  payout_amount: string;
  payout_date: string;
  processing_date: string;
  payment_type: string;
  payment_method?: string;
  project_name?: string;
  description?: string;
}

/** Реєстр виплачених операцій за датою виплати (обидві дати включно). */
export async function getRzPayPaymentsReport(
  creds: RzPayCreds,
  dateFrom: string,
  dateTo: string,
  opts: { scope?: 'current_login' | 'all_keys'; registerType?: 'transactions_list' | 'transactions_list_dwh' } = {},
): Promise<RzPayPaymentRow[]> {
  const data = await rzFetch<{ payments?: RzPayPaymentRow[] }>(creds, '/api/reports/v1/payments', {
    method: 'POST',
    body: JSON.stringify({
      date_from: dateFrom, date_to: dateTo,
      scope: opts.scope ?? 'all_keys',
      register_type: opts.registerType ?? 'transactions_list',
    }),
  });
  return data.payments ?? [];
}

export interface RzPayTransactionRow {
  order_id: string;
  transaction_id: string;
  external_id: string | null;
  unified_external_id?: string | null;
  operation_type: string;
  status: string;
  original_amount: string;
  payer_amount?: string;
  merchant_fee?: string;
  payer_fee?: string;
  created_at: string;
  processed_at: string;
  project_name?: string;
}

/** Транзакції за період (≤ 14 днів, date_from ≤ 90 днів назад). */
export async function getRzPayTransactions(
  creds: RzPayCreds,
  dateFrom: string,
  dateTo: string,
  opts: { operationTypes?: string[]; statuses?: string[] } = {},
): Promise<RzPayTransactionRow[]> {
  const data = await rzFetch<{ transactions?: RzPayTransactionRow[] }>(creds, '/api/reports/v1/transactions', {
    method: 'POST',
    body: JSON.stringify({
      date_from: dateFrom, date_to: dateTo, register_type: 'transactions_list',
      ...(opts.operationTypes ? { operation_types: opts.operationTypes } : {}),
      ...(opts.statuses ? { statuses: opts.statuses } : {}),
    }),
  });
  return data.transactions ?? [];
}

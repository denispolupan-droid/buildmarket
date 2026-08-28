import crypto from 'node:crypto';

// Google Merchant Center через Merchant API v1 і той самий сервісний акаунт, що й
// Search Console (GSC_SERVICE_ACCOUNT_KEY) — просто інший scope. Без залежностей:
// JWT RS256 підписуємо вбудованим crypto, як у lib/gsc.ts.
//
// Тільки v1: v1beta вимкнено 28.02.2026, Content API for Shopping — 18.08.2026.
// Проєкт GCP має бути зареєстрований у кабінеті (developerRegistration:registerGcp),
// інакше кожен виклик віддає 401 GCP_NOT_REGISTERED.

const API = 'https://merchantapi.googleapis.com';
const SCOPE = 'https://www.googleapis.com/auth/content';

/** ID кабінету Merchant Center (fixline.com.ua). */
export const MERCHANT_ACCOUNT = '5819941342';

let cached: { token: string; expiresAt: number } | null = null;

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

async function accessToken(): Promise<string> {
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;

  const raw = process.env.GSC_SERVICE_ACCOUNT_KEY;
  if (!raw) throw new Error('GSC_SERVICE_ACCOUNT_KEY не налаштований');
  const key = JSON.parse(raw) as { client_email: string; private_key: string };

  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({
    iss: key.client_email,
    scope: SCOPE,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }));
  const sig = crypto.createSign('RSA-SHA256')
    .update(`${header}.${claims}`)
    .sign(key.private_key)
    .toString('base64url');

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${header}.${claims}.${sig}`,
  });
  if (!res.ok) throw new Error(`Merchant auth failed: ${res.status} ${await res.text()}`);
  const data = await res.json() as { access_token: string; expires_in: number };
  cached = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return data.access_token;
}

export async function merchantCall<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await accessToken();
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Merchant ${path} → ${res.status}: ${text.slice(0, 500)}`);
  return (text ? JSON.parse(text) : {}) as T;
}

export type DataSource = {
  name: string;
  dataSourceId: string;
  displayName: string;
  input: string;
  primaryProductDataSource?: {
    contentLanguage?: string;
    feedLabel?: string;
    destinations?: { destination: string; state: string }[];
  };
  fileInput?: { fetchSettings?: { fetchUri?: string; frequency?: string } };
};

export async function listDataSources(): Promise<DataSource[]> {
  const r = await merchantCall<{ dataSources?: DataSource[] }>(
    `/datasources/v1/accounts/${MERCHANT_ACCOUNT}/dataSources`,
  );
  return r.dataSources ?? [];
}

export type FileUpload = {
  processingState: string;
  itemsTotal?: string;
  itemsCreated?: string;
  itemsUpdated?: string;
  uploadTime?: string;
  issues?: { title: string; description?: string; severity?: string; count?: string }[];
};

/**
 * Приймаємо і голий id, і повне імʼя ресурсу з listDataSources
 * (`accounts/123/dataSources/456`). Передати `name` — найприродніша помилка:
 * шлях склеювався вдвічі й Merchant віддавав 404 замість зрозумілої відмови.
 */
function dsId(dataSource: string): string {
  return dataSource.split('/').pop() ?? dataSource;
}

/** Стан останньої виборки фіду. */
export async function latestUpload(dataSource: string): Promise<FileUpload> {
  return merchantCall<FileUpload>(
    `/datasources/v1/accounts/${MERCHANT_ACCOUNT}/dataSources/${dsId(dataSource)}/fileUploads/latest`,
  );
}

/** Позачергова виборка фіду — не чекаючи розкладу. */
export async function fetchNow(dataSource: string): Promise<void> {
  await merchantCall(
    `/datasources/v1/accounts/${MERCHANT_ACCOUNT}/dataSources/${dsId(dataSource)}:fetch`,
    { method: 'POST', body: '{}' },
  );
}

export type ProductRow = {
  id: string;
  offerId?: string;
  title?: string;
  languageCode?: string;
  clickPotential?: string;
  aggregatedReportingContextStatus?: string;
  itemIssues?: {
    issueType?: { code?: string; canonicalAttribute?: string };
    severity?: { aggregatedSeverity?: string };
  }[];
};

/** Усі товари кабінету зі статусом і проблемами (звітний API, посторінково). */
export async function productRows(): Promise<ProductRow[]> {
  const out: ProductRow[] = [];
  let pageToken: string | undefined;
  do {
    const r = await merchantCall<{ results?: { productView: ProductRow }[]; nextPageToken?: string }>(
      `/reports/v1/accounts/${MERCHANT_ACCOUNT}/reports:search`,
      {
        method: 'POST',
        body: JSON.stringify({
          // id обов'язковий у SELECT — інакше API віддає INVALID_QUERY
          query: 'SELECT id, offer_id, title, language_code, click_potential, aggregated_reporting_context_status, item_issues FROM product_view',
          pageSize: 1000,
          pageToken,
        }),
      },
    );
    out.push(...(r.results ?? []).map(x => x.productView));
    pageToken = r.nextPageToken;
  } while (pageToken);
  return out;
}

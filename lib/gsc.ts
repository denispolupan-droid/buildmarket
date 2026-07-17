import crypto from 'node:crypto';

// Google Search Console API через сервісний акаунт (GSC_SERVICE_ACCOUNT_KEY —
// JSON ключа). Без залежностей: JWT RS256 підписуємо вбудованим crypto.

const SITE = 'sc-domain:fixline.com.ua';
const SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';

type ServiceAccountKey = { client_email: string; private_key: string };

let cachedToken: { token: string; expiresAt: number } | null = null;

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.token;

  const raw = process.env.GSC_SERVICE_ACCOUNT_KEY;
  if (!raw) throw new Error('GSC_SERVICE_ACCOUNT_KEY не налаштований');
  const key = JSON.parse(raw) as ServiceAccountKey;

  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({
    iss: key.client_email,
    scope: SCOPE,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }));
  const signature = crypto.createSign('RSA-SHA256')
    .update(`${header}.${claims}`)
    .sign(key.private_key)
    .toString('base64url');
  const jwt = `${header}.${claims}.${signature}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${jwt}`,
  });
  if (!res.ok) throw new Error(`GSC auth failed: ${res.status} ${await res.text()}`);
  const data = await res.json() as { access_token: string; expires_in: number };
  cachedToken = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return data.access_token;
}

export type GscQueryRow = {
  query: string;
  page: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

/** Запити за останні N днів із позицією у заданому діапазоні, за спаданням показів. */
export async function getQueries(opts?: {
  days?: number;
  minPosition?: number;
  maxPosition?: number;
  limit?: number;
}): Promise<GscQueryRow[]> {
  const days = opts?.days ?? 28;
  const token = await getAccessToken();

  const end = new Date();
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  const res = await fetch(
    `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(SITE)}/searchAnalytics/query`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        startDate: fmt(start),
        endDate: fmt(end),
        dimensions: ['query', 'page'],
        rowLimit: 500,
      }),
    },
  );
  if (!res.ok) throw new Error(`GSC query failed: ${res.status} ${await res.text()}`);
  const data = await res.json() as { rows?: { keys: string[]; clicks: number; impressions: number; ctr: number; position: number }[] };

  let rows: GscQueryRow[] = (data.rows ?? []).map(r => ({
    query: r.keys[0],
    page: r.keys[1],
    clicks: r.clicks,
    impressions: r.impressions,
    ctr: r.ctr,
    position: r.position,
  }));

  const minP = opts?.minPosition ?? 0;
  const maxP = opts?.maxPosition ?? 100;
  rows = rows
    .filter(r => r.position >= minP && r.position <= maxP)
    .sort((a, b) => b.impressions - a.impressions);
  return rows.slice(0, opts?.limit ?? 50);
}

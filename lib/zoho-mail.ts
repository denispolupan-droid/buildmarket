import { createClient } from '@supabase/supabase-js';

const ZOHO_AUTH = 'https://accounts.zoho.eu/oauth/v2';
export const ZOHO_MAIL = 'https://mail.zoho.eu/api';

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function getTokenRow() {
  const { data } = await db.from('mail_oauth_tokens').select('*').eq('id', 1).maybeSingle();
  return data as { access_token: string; refresh_token: string; expires_at: string; account_id: string | null } | null;
}

export async function saveTokens(
  access_token: string,
  refresh_token: string,
  expires_in: number,
  account_id?: string | null,
) {
  const expires_at = new Date(Date.now() + expires_in * 1000).toISOString();
  await db.from('mail_oauth_tokens').upsert({
    id: 1, access_token, refresh_token, expires_at,
    ...(account_id !== undefined ? { account_id } : {}),
    updated_at: new Date().toISOString(),
  });
}

export async function getAccessToken(): Promise<string> {
  const row = await getTokenRow();
  if (!row) throw new Error('ZOHO_NOT_CONNECTED');

  const expiresAt = new Date(row.expires_at).getTime();
  if (Date.now() < expiresAt - 5 * 60 * 1000) return row.access_token;

  const res = await fetch(`${ZOHO_AUTH}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: row.refresh_token,
      client_id:     process.env.ZOHO_CLIENT_ID!,
      client_secret: process.env.ZOHO_CLIENT_SECRET!,
      grant_type:    'refresh_token',
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('Token refresh failed: ' + JSON.stringify(data));

  await saveTokens(data.access_token, row.refresh_token, data.expires_in ?? 3600, row.account_id);
  return data.access_token;
}

export async function getAccountId(): Promise<string> {
  const row = await getTokenRow();
  if (row?.account_id) return row.account_id;

  const token = await getAccessToken();
  const res = await fetch(`${ZOHO_MAIL}/accounts`, {
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
  });
  const data = await res.json();
  const accountId = data?.data?.[0]?.accountId as string | undefined;
  if (!accountId) throw new Error('Could not get Zoho account ID');

  await db.from('mail_oauth_tokens').update({ account_id: accountId }).eq('id', 1);
  return accountId;
}

export async function zohoFetch(path: string, options: RequestInit = {}) {
  const token = await getAccessToken();
  const res = await fetch(`${ZOHO_MAIL}${path}`, {
    ...options,
    headers: {
      Authorization: `Zoho-oauthtoken ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  });
  if (!res.ok && res.status !== 200) {
    const text = await res.text();
    throw new Error(`Zoho API error ${res.status}: ${text}`);
  }
  return res.json();
}

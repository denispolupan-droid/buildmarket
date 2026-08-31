import { createClient } from '@supabase/supabase-js';

/**
 * Google Ads API: витрати кампаній по днях → таблиця ads_spend (міграція 109)
 * для ROMI у Фінанси → «Реклама».
 *
 * Авторизація — refresh-токен користувача (Ads не приймає сервісні акаунти),
 * отриманий scripts/google-ads-auth.ts; усі креденшали в app_settings, щоб
 * керувати без редеплою:
 *   google_ads_client_id / client_secret / refresh_token
 *   google_ads_developer_token — токен розробника Ads API
 *   google_ads_customer_id     — рекламний акаунт (10 цифр, без дефісів)
 *   google_ads_manager_id      — MCC, якщо доступ через нього (login-customer-id)
 *
 * Версію API Google списує кожні ~9 місяців; щоб інтеграція не вмирала мовчки,
 * версія не зашита: пробуємо зі списку, робочу пам'ятаємо в app_settings
 * (google_ads_api_version) і починаємо з неї наступного разу.
 *
 * ВАЖЛИВО: поки OAuth-застосунок у Cloud Console у статусі Testing,
 * refresh-токен живе 7 днів — крон почне падати з invalid_grant; ліки —
 * опублікувати застосунок або перезапустити scripts/google-ads-auth.ts.
 */

const API_VERSIONS = ['v25', 'v24', 'v23', 'v22'];

const db = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

async function settings(keys: string[]): Promise<Record<string, string>> {
  const { data, error } = await db().from('app_settings').select('key, value').in('key', keys);
  if (error) throw error;
  const out: Record<string, string> = {};
  for (const r of data ?? []) out[r.key] = (r.value ?? '').trim();
  return out;
}

let tokenCache: { token: string; until: number } | null = null;

export async function getAccessToken(): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.until) return tokenCache.token;
  const s = await settings(['google_ads_client_id', 'google_ads_client_secret', 'google_ads_refresh_token']);
  for (const k of ['google_ads_client_id', 'google_ads_client_secret', 'google_ads_refresh_token']) {
    if (!s[k]) throw new Error(`У app_settings немає ${k}${k.includes('refresh') ? ' — запусти scripts/google-ads-auth.ts' : ''}`);
  }
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: s.google_ads_client_id,
      client_secret: s.google_ads_client_secret,
      refresh_token: s.google_ads_refresh_token,
      grant_type: 'refresh_token',
    }),
  });
  const tok = await res.json() as { access_token?: string; expires_in?: number; error?: string; error_description?: string };
  if (!res.ok || !tok.access_token) {
    throw new Error(`Google OAuth: ${tok.error ?? res.status} ${tok.error_description ?? ''}`.trim()
      + (tok.error === 'invalid_grant' ? ' — refresh-токен протух (застосунок у Testing живе 7 днів), перезапусти scripts/google-ads-auth.ts' : ''));
  }
  tokenCache = { token: tok.access_token, until: Date.now() + ((tok.expires_in ?? 3600) - 120) * 1000 };
  return tok.access_token;
}

type SearchRow = {
  campaign?: { id?: string; name?: string; advertisingChannelType?: string };
  metrics?: { costMicros?: string; clicks?: string; impressions?: string; conversions?: number; conversionsValue?: number };
  segments?: { date?: string };
  customer?: { currencyCode?: string };
};

/** searchStream із перебором версій API; робочу версію запам'ятовує. */
async function adsSearch(query: string): Promise<SearchRow[]> {
  const s = await settings(['google_ads_developer_token', 'google_ads_customer_id', 'google_ads_manager_id', 'google_ads_api_version']);
  if (!s.google_ads_developer_token) throw new Error('У app_settings немає google_ads_developer_token');
  if (!s.google_ads_customer_id) throw new Error('У app_settings немає google_ads_customer_id');
  const cid = s.google_ads_customer_id.replace(/-/g, '');
  const token = await getAccessToken();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'developer-token': s.google_ads_developer_token,
    'Content-Type': 'application/json',
  };
  if (s.google_ads_manager_id) headers['login-customer-id'] = s.google_ads_manager_id.replace(/-/g, '');

  const tried = s.google_ads_api_version ? [s.google_ads_api_version, ...API_VERSIONS.filter(v => v !== s.google_ads_api_version)] : API_VERSIONS;
  let lastErr = '';
  for (const v of tried) {
    const res = await fetch(`https://googleads.googleapis.com/${v}/customers/${cid}/googleAds:searchStream`, {
      method: 'POST', headers, body: JSON.stringify({ query }),
    });
    if (res.status === 404) { lastErr = `${v}: 404 (версію списано)`; continue; }
    const body = await res.json() as { results?: SearchRow[] }[] | { error?: { message?: string; details?: unknown } };
    if (!res.ok) {
      const msg = (body as { error?: { message?: string } }).error?.message ?? JSON.stringify(body).slice(0, 300);
      throw new Error(`Google Ads API ${v}: ${res.status} ${msg}`);
    }
    if (v !== s.google_ads_api_version) await db().from('app_settings').upsert({ key: 'google_ads_api_version', value: v });
    return (body as { results?: SearchRow[] }[]).flatMap(chunk => chunk.results ?? []);
  }
  throw new Error(`Жодна версія Ads API не відповіла: ${lastErr}`);
}

export type AdsSyncResult = { days: number; rows: number; costUah: number; currency: string };

/** Тягне витрати по кампаніях за останні N днів і upsert'ить в ads_spend. */
export async function syncAdsSpend(days = 7): Promise<AdsSyncResult> {
  const to = new Date(); const from = new Date(Date.now() - (days - 1) * 864e5);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const rows = await adsSearch(`
    SELECT segments.date, campaign.id, campaign.name, campaign.advertising_channel_type,
           metrics.cost_micros, metrics.clicks, metrics.impressions,
           metrics.conversions, metrics.conversions_value, customer.currency_code
    FROM campaign
    WHERE segments.date BETWEEN '${iso(from)}' AND '${iso(to)}'`);
  const client = db();
  const up = rows.filter(r => r.campaign?.id && r.segments?.date).map(r => ({
    date: r.segments!.date!,
    campaign_id: Number(r.campaign!.id),
    campaign_name: r.campaign!.name ?? String(r.campaign!.id),
    channel_type: r.campaign!.advertisingChannelType ?? null,
    cost_micros: Number(r.metrics?.costMicros ?? 0),
    clicks: Number(r.metrics?.clicks ?? 0),
    impressions: Number(r.metrics?.impressions ?? 0),
    conversions: Number(r.metrics?.conversions ?? 0),
    conv_value: Number(r.metrics?.conversionsValue ?? 0),
    currency: rows[0]?.customer?.currencyCode ?? 'UAH',
    synced_at: new Date().toISOString(),
  }));
  for (let i = 0; i < up.length; i += 200) {
    const { error } = await client.from('ads_spend').upsert(up.slice(i, i + 200), { onConflict: 'date,campaign_id' });
    if (error) throw error;
  }
  return { days, rows: up.length, costUah: Math.round(up.reduce((s2, r) => s2 + r.cost_micros, 0) / 1e6), currency: up[0]?.currency ?? 'UAH' };
}

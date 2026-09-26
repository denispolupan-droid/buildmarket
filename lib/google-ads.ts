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

/**
 * Один виклик Ads API з перебором версій; робочу версію запам'ятовує.
 * `path` — хвіст після `/customers/<cid>` (напр. `/googleAds:searchStream`,
 * `:uploadClickConversions`). `customerId` за замовчуванням — рекламний акаунт
 * із налаштувань; для конверсій може бути інший (див. conversionCustomerId).
 */
async function adsCall<T>(path: string, body: unknown, customerId?: string): Promise<T> {
  const s = await settings(['google_ads_developer_token', 'google_ads_customer_id', 'google_ads_manager_id', 'google_ads_api_version']);
  if (!s.google_ads_developer_token) throw new Error('У app_settings немає google_ads_developer_token');
  if (!s.google_ads_customer_id) throw new Error('У app_settings немає google_ads_customer_id');
  const cid = (customerId ?? s.google_ads_customer_id).replace(/-/g, '');
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
    const res = await fetch(`https://googleads.googleapis.com/${v}/customers/${cid}${path}`, {
      method: 'POST', headers, body: JSON.stringify(body),
    });
    if (res.status === 404) { lastErr = `${v}: 404 (версію списано)`; continue; }
    const json = await res.json() as T | { error?: { message?: string } };
    if (!res.ok) {
      const msg = (json as { error?: { message?: string } }).error?.message ?? JSON.stringify(json).slice(0, 300);
      throw new Error(`Google Ads API ${v}: ${res.status} ${msg}`);
    }
    if (v !== s.google_ads_api_version) await db().from('app_settings').upsert({ key: 'google_ads_api_version', value: v });
    return json as T;
  }
  throw new Error(`Жодна версія Ads API не відповіла: ${lastErr}`);
}

/** searchStream: усі рядки звіту. */
async function adsSearch(query: string, customerId?: string): Promise<SearchRow[]> {
  const chunks = await adsCall<{ results?: SearchRow[] }[]>('/googleAds:searchStream', { query }, customerId);
  return chunks.flatMap(chunk => chunk.results ?? []);
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

// ───────────────────────── Офлайн-конверсії ─────────────────────────
//
// На сайті немає тега Google (його блокує CSP), тому Ads не бачить покупок і
// оптимізує ставки на кліки. Замість тега віддаємо конверсії з сервера:
// замовлення з gclid (lib/utm.ts зберігає його з рекламного переходу), яке
// підтвердили/відправили/вручили, — конверсія з цінністю = сума замовлення.
// Скасоване після вивантаження відкликаємо. Журнал — таблиця ads_conversions
// (міграція 119), щоб не віддати одне замовлення двічі.

/** Назва дії-конверсії в кабінеті Ads. Не перейменовувати: за нею шукаємо існуючу. */
const CONVERSION_ACTION_NAME = 'Замовлення на сайті (сервер)';

/** Статуси замовлення, з яких воно вважається конверсією. */
const CONVERTED_STATUSES = ['confirmed', 'shipped', 'delivered'];

/** Google приймає конверсії за кліком до 90 днів; беремо з запасом менше. */
const LOOKBACK_DAYS = 60;

/**
 * Акаунт, у якому живуть конверсії. При «міжакаунтному відстеженні» через MCC
 * дії-конверсії створюються в менеджері, і вивантажувати треба туди ж — Ads
 * сам каже, куди, у customer.conversion_tracking_setting.
 */
async function conversionCustomerId(): Promise<string> {
  const rows = await adsSearch(`
    SELECT customer.id, customer.conversion_tracking_setting.google_ads_conversion_customer
    FROM customer`);
  const r = rows[0] as { customer?: { id?: string; conversionTrackingSetting?: { googleAdsConversionCustomer?: string } } } | undefined;
  const res = r?.customer?.conversionTrackingSetting?.googleAdsConversionCustomer; // "customers/123"
  const id = res?.split('/')[1] ?? r?.customer?.id;
  if (!id) throw new Error('Ads не повернув customer.id');
  return id;
}

/**
 * Дія-конверсія типу UPLOAD_CLICKS: знаходить існуючу за назвою або створює.
 * Ресурсне ім'я кешується в app_settings.google_ads_conversion_action.
 */
export async function ensureConversionAction(): Promise<{ resourceName: string; customerId: string; created: boolean }> {
  const s = await settings(['google_ads_conversion_action']);
  if (s.google_ads_conversion_action) {
    return { resourceName: s.google_ads_conversion_action, customerId: s.google_ads_conversion_action.split('/')[1], created: false };
  }
  const customerId = await conversionCustomerId();
  const found = await adsSearch(`
    SELECT conversion_action.resource_name, conversion_action.name
    FROM conversion_action
    WHERE conversion_action.name = '${CONVERSION_ACTION_NAME}' AND conversion_action.status != 'REMOVED'`, customerId);
  let resourceName = (found[0] as { conversionAction?: { resourceName?: string } } | undefined)?.conversionAction?.resourceName;
  let created = false;
  if (!resourceName) {
    const out = await adsCall<{ results?: { resourceName?: string }[] }>('/conversionActions:mutate', {
      operations: [{
        create: {
          name: CONVERSION_ACTION_NAME,
          type: 'UPLOAD_CLICKS',
          category: 'PURCHASE',
          status: 'ENABLED',
          countingType: 'ONE_PER_CLICK',
          valueSettings: { defaultValue: 0, alwaysUseDefaultValue: false },
          attributionModelSettings: { attributionModel: 'GOOGLE_ADS_LAST_CLICK' },
          clickThroughLookbackWindowDays: 90,
        },
      }],
    }, customerId);
    resourceName = out.results?.[0]?.resourceName;
    if (!resourceName) throw new Error('Ads не повернув resourceName створеної дії-конверсії');
    created = true;
  }
  await db().from('app_settings').upsert({ key: 'google_ads_conversion_action', value: resourceName });
  return { resourceName, customerId, created };
}

/** "2026-09-26 10:15:30+00:00" — формат дати, який приймає Ads. */
function adsDateTime(iso: string): string {
  return new Date(iso).toISOString().slice(0, 19).replace('T', ' ') + '+00:00';
}

type PartialFailure = {
  partialFailureError?: { message?: string; details?: { errors?: { message?: string; location?: { fieldPathElements?: { fieldName?: string; index?: number }[] } }[] }[] };
};

/** Помилки partialFailure → мапа індекс конверсії → текст. */
function partialErrors(res: PartialFailure): Map<number, string> {
  const out = new Map<number, string>();
  for (const d of res.partialFailureError?.details ?? []) {
    for (const e of d.errors ?? []) {
      const idx = e.location?.fieldPathElements?.find(f => f.index !== undefined)?.index;
      if (idx !== undefined) out.set(idx, e.message ?? 'помилка');
    }
  }
  if (res.partialFailureError && out.size === 0) out.set(-1, res.partialFailureError.message ?? 'помилка');
  return out;
}

export type ConversionsResult = { candidates: number; uploaded: number; retracted: number; failed: number; action: string };

/**
 * Вивантажує нові конверсії та відкликає скасовані. Ідемпотентно: журнал
 * ads_conversions не дає віддати замовлення двічі, невдалі — повторюються
 * наступним прогоном.
 */
export async function uploadOrderConversions(): Promise<ConversionsResult> {
  const client = db();
  const since = new Date(Date.now() - LOOKBACK_DAYS * 864e5).toISOString();

  // Замовлення з gclid за вікно + що вже є в журналі.
  const { data: orders, error: oErr } = await client.from('orders')
    .select('id, order_number, gclid, status, total_price, created_at')
    .not('gclid', 'is', null)
    .gte('created_at', since)
    .order('created_at')
    .limit(2000);
  if (oErr) throw oErr;
  const ids = (orders ?? []).map(o => o.id);
  const { data: logged, error: lErr } = ids.length
    ? await client.from('ads_conversions').select('order_id, uploaded_at, retracted_at').in('order_id', ids)
    : { data: [], error: null };
  if (lErr) throw lErr;
  const log = new Map((logged ?? []).map(l => [l.order_id as string, l]));

  const toUpload = (orders ?? []).filter(o => CONVERTED_STATUSES.includes(o.status) && !log.get(o.id)?.uploaded_at);
  const toRetract = (orders ?? []).filter(o => o.status === 'cancelled' && log.get(o.id)?.uploaded_at && !log.get(o.id)?.retracted_at);
  const result: ConversionsResult = { candidates: toUpload.length + toRetract.length, uploaded: 0, retracted: 0, failed: 0, action: '' };
  if (result.candidates === 0) return result;

  const { resourceName, customerId } = await ensureConversionAction();
  result.action = resourceName;
  const now = new Date().toISOString();

  if (toUpload.length) {
    const res = await adsCall<PartialFailure>(':uploadClickConversions', {
      conversions: toUpload.map(o => ({
        gclid: o.gclid,
        conversionAction: resourceName,
        conversionDateTime: adsDateTime(o.created_at),
        conversionValue: Number(o.total_price ?? 0),
        currencyCode: 'UAH',
        orderId: String(o.order_number),
      })),
      partialFailure: true,
    }, customerId);
    const errs = partialErrors(res);
    const rows = toUpload.map((o, i) => {
      const err = errs.get(i) ?? errs.get(-1);
      if (err) result.failed++; else result.uploaded++;
      return {
        order_id: o.id, order_number: o.order_number, gclid: o.gclid, conversion_action: resourceName,
        value: Number(o.total_price ?? 0), currency: 'UAH', conversion_time: o.created_at,
        uploaded_at: err ? null : now, error: err ?? null, updated_at: now,
      };
    });
    const { error } = await client.from('ads_conversions').upsert(rows, { onConflict: 'order_id' });
    if (error) throw error;
  }

  if (toRetract.length) {
    const res = await adsCall<PartialFailure>(':uploadConversionAdjustments', {
      conversionAdjustments: toRetract.map(o => ({
        conversionAction: resourceName,
        adjustmentType: 'RETRACTION',
        adjustmentDateTime: adsDateTime(now),
        gclidDateTimePair: { gclid: o.gclid, conversionDateTime: adsDateTime(o.created_at) },
        orderId: String(o.order_number),
      })),
      partialFailure: true,
    }, customerId);
    const errs = partialErrors(res);
    for (const [i, o] of toRetract.entries()) {
      const err = errs.get(i) ?? errs.get(-1);
      if (err) result.failed++; else result.retracted++;
      const { error } = await client.from('ads_conversions')
        .update({ retracted_at: err ? null : now, error: err ?? null, updated_at: now })
        .eq('order_id', o.id);
      if (error) throw error;
    }
  }
  return result;
}

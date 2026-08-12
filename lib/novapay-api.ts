import { createServiceClient } from './supabase';

// NovaPay Business Cabinet API v2.0 (SOAP, business.novapay.ua).
// Автентифікація UserAuthenticationJWT з ОДНОРАЗОВОЮ РОТАЦІЄЮ: кожен виклик
// повертає НОВИЙ refresh_token і сертифікат — їх треба зберегти ДО використання
// jwt, інакше ланцюжок сесії рветься. Креденшали живуть в app_settings
// (novapay_login / novapay_refresh_token / novapay_certificate) — керовано без
// редеплою; кнопку «Згенерувати» в кабінеті після підключення НЕ натискати.

const SVC = 'https://business.novapay.ua/Services/ClientAPIService.svc';

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Декодує XML-сутності відповіді. КРИТИЧНО для ротації: сервер віддає \r у
 *  сертифікаті як &#xD; — збережене сирим значення ламало наступну автентифікацію. */
function unesc(s: string): string {
  return s
    .replace(/&#x?[dD];/g, '')
    .replace(/&#13;/g, '')
    .replace(/&#x?[aA];/g, '\n')
    .replace(/&#10;/g, '\n')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/** Витягує текст першого тега з такою локальною назвою (незалежно від префікса ns) */
function tag(xml: string, local: string): string | null {
  const m = xml.match(new RegExp(`<(?:\\w+:)?${local}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?${local}>`));
  return m ? unesc(m[1]).trim() : null;
}

function tags(xml: string, local: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`<(?:\\w+:)?${local}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?${local}>`, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out.push(m[1].trim());
  return out;
}

async function soapCall(method: string, fields: Record<string, string | number | null | undefined>): Promise<string> {
  const body = Object.entries(fields)
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(([k, v]) => `<tem:${k}>${esc(String(v))}</tem:${k}>`)
    .join('');
  const envelope =
    `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:tem="http://tempuri.org/">` +
    `<soapenv:Header/><soapenv:Body><tem:${method}><tem:request>${body}</tem:request></tem:${method}></soapenv:Body></soapenv:Envelope>`;
  const res = await fetch(SVC, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      SOAPAction: `http://tempuri.org/IClientAPIService/${method}`,
    },
    body: envelope,
    // NovaPay відповідає повільно (8–30+ с — виміряно); викликається з крону,
    // тож щедрий таймаут не тримає користувацькі рендери
    signal: AbortSignal.timeout(60000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`NovaPay ${method}: HTTP ${res.status} — ${text.slice(0, 300)}`);
  return text;
}

type Db = ReturnType<typeof createServiceClient>;

async function setting(db: Db, key: string): Promise<string | null> {
  const { data } = await db.from('app_settings').select('value').eq('key', key).maybeSingle();
  const v = (data?.value ?? '').trim();
  return v || null;
}

/**
 * JWT-автентифікація з ротацією. КРИТИЧНО: новий refresh_token/сертифікат
 * пишуться в app_settings ОДРАЗУ після відповіді — до будь-якого використання jwt.
 */
async function authenticate(db: Db): Promise<string> {
  const [login, refreshToken, certificate] = await Promise.all([
    setting(db, 'novapay_login'),
    setting(db, 'novapay_refresh_token'),
    setting(db, 'novapay_certificate'),
  ]);
  if (!login || !refreshToken || !certificate) {
    throw new Error('NovaPay: креденшали не налаштовані (novapay_login / novapay_refresh_token / novapay_certificate в app_settings)');
  }

  const xml = await soapCall('UserAuthenticationJWT', {
    request_ref: crypto.randomUUID(),
    refresh_token: refreshToken,
    login,
    public_certificate: certificate,
  });

  const result = tag(xml, 'result');
  const jwt = tag(xml, 'jwt');
  const newToken = tag(xml, 'refresh_token');
  const newCert = tag(xml, 'public_certificate');
  if (result === 'error' || !jwt) {
    throw new Error(`NovaPay auth failed: ${tag(xml, 'error') ?? tag(xml, 'error_description') ?? xml.slice(0, 300)}`);
  }
  // Ротація: зберігаємо новий ланцюжок ПЕРШИМ ділом
  if (newToken) await db.from('app_settings').upsert({ key: 'novapay_refresh_token', value: newToken });
  if (newCert) await db.from('app_settings').upsert({ key: 'novapay_certificate', value: newCert });
  return jwt;
}

export type NovapayLiveBalance = {
  available: number;    // доступний залишок, ₴ (сума по рахунках)
  projected: number;    // прогнозований (з урахуванням непідтверджених)
  fetchedAt: string;
};

const CACHE_KEY = 'novapay_balance_cache';

/**
 * Баланс NovaPay для сторінок: ЛИШЕ з кешу, без походу в API. NovaPay
 * відповідає по 8–30+ с на виклик — тримати на цьому рендер не можна.
 * Кеш наповнює refreshNovapayBalance() з крону.
 */
export async function getNovapayLiveBalance(): Promise<NovapayLiveBalance | null> {
  const db = createServiceClient();
  const { data: cached } = await db.from('app_settings').select('value').eq('key', CACHE_KEY).maybeSingle();
  if (!cached?.value) return null;
  try { return JSON.parse(cached.value) as NovapayLiveBalance; } catch { return null; }
}

/** Оновлення кешу балансу (кличе крон). Ротація токена всередині authenticate(). */
export async function refreshNovapayBalance(): Promise<NovapayLiveBalance | null> {
  const db = createServiceClient();
  try {
    const jwt = await authenticate(db);

    // Рахунки: id кешуємо, щоб не смикати список щоразу
    let accountIds: number[] = [];
    const cachedIds = await setting(db, 'novapay_account_ids');
    if (cachedIds) {
      try { accountIds = JSON.parse(cachedIds) as number[]; } catch { /* перечитаємо */ }
    }
    if (!accountIds.length) {
      const listXml = await soapCall('GetAccountsList', { request_ref: crypto.randomUUID(), jwt });
      accountIds = tags(listXml, 'account_id').map(Number).filter(Number.isFinite);
      // Фолбек: інколи id лежить у тегу id всередині accounts
      if (!accountIds.length) accountIds = tags(listXml, 'id').map(Number).filter(Number.isFinite);
      if (accountIds.length) await db.from('app_settings').upsert({ key: 'novapay_account_ids', value: JSON.stringify(accountIds) });
    }
    if (!accountIds.length) throw new Error('NovaPay: не знайдено жодного рахунку в GetAccountsList');

    let available = 0, projected = 0;
    for (const id of accountIds) {
      const xml = await soapCall('GetAccountRest', { request_ref: crypto.randomUUID(), jwt, account_id: id });
      if (tag(xml, 'result') === 'error') continue;
      available += Number(tag(xml, 'available_balance') ?? 0);
      projected += Number(tag(xml, 'projected_balance') ?? tag(xml, 'available_balance') ?? 0);
    }

    const result: NovapayLiveBalance = {
      available: Math.round(available * 100) / 100,
      projected: Math.round(projected * 100) / 100,
      fetchedAt: new Date().toISOString(),
    };
    await db.from('app_settings').upsert({ key: CACHE_KEY, value: JSON.stringify(result) });
    return result;
  } catch (err) {
    console.error('[novapay-balance]', err instanceof Error ? err.message : err);
    return null;
  }
}

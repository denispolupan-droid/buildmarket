import { createServiceClient } from './supabase';
import { getMonoToken } from './mono-config';

// Живі залишки рахунків Monobank (Personal API client-info) для «Огляду»
// фінансів. client-info має жорсткий рейт-ліміт (1 запит / 60 с), тому
// відповідь кешується в app_settings — кожен рендер сторінки НЕ б'є в банк.

const CACHE_KEY = 'mono_balance_cache';
const TTL_MS = 90_000;

export type MonoLiveBalance = {
  total: number;                                   // сума всіх грн-рахунків, ₴
  accounts: { type: string; balance: number }[];   // fop / black …, ₴
  fetchedAt: string;
};

export async function getMonoLiveBalance(): Promise<MonoLiveBalance | null> {
  const db = createServiceClient();

  const { data: cached } = await db.from('app_settings').select('value').eq('key', CACHE_KEY).maybeSingle();
  if (cached?.value) {
    try {
      const parsed = JSON.parse(cached.value) as MonoLiveBalance;
      if (Date.now() - Date.parse(parsed.fetchedAt) < TTL_MS) return parsed;
    } catch { /* битий кеш — перечитаємо з API */ }
  }

  const token = await getMonoToken(db);
  if (!token) return null;

  try {
    const res = await fetch('https://api.monobank.ua/personal/client-info', {
      headers: { 'X-Token': token },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      // 429 (рейт-ліміт) тощо: віддаємо протухлий кеш, якщо він був — краще
      // стара цифра з міткою часу, ніж жодної
      if (cached?.value) { try { return JSON.parse(cached.value) as MonoLiveBalance; } catch { /* ignore */ } }
      return null;
    }
    const j = await res.json() as { accounts?: { type: string; currencyCode: number; balance: number }[] };
    const uah = (j.accounts ?? []).filter(a => a.currencyCode === 980);
    const result: MonoLiveBalance = {
      total: Math.round(uah.reduce((s, a) => s + a.balance, 0)) / 100,
      accounts: uah.map(a => ({ type: a.type, balance: a.balance / 100 })),
      fetchedAt: new Date().toISOString(),
    };
    await db.from('app_settings').upsert({ key: CACHE_KEY, value: JSON.stringify(result) });
    return result;
  } catch {
    if (cached?.value) { try { return JSON.parse(cached.value) as MonoLiveBalance; } catch { /* ignore */ } }
    return null;
  }
}

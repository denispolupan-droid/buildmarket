/**
 * IndexNow — миттєве повідомлення пошуковиків (Bing, Yandex, Seznam, Naver)
 * про змінені сторінки. Google протокол не читає, але Bing живить пошук
 * ChatGPT і Copilot, тож для ШІ-видимості це найдешевший канал: один POST
 * при публікації. Ключ публічний за протоколом і лежить у public/<key>.txt.
 *
 * Пінгуємо лише з продакшену: з localhost і превʼю посилання все одно
 * ведуть на fixline.com.ua, і пошуковик отримував би сигнали про сторінки,
 * яких ще немає. Помилки ковтаємо — сигнал допоміжний, ламати збереження
 * статті через нього не можна.
 */
import { SITE_URL } from './site';

export const INDEXNOW_KEY = 'f0bce4f4bd5e58829d72a5be66069d81';
const HOST = 'fixline.com.ua';

export function isIndexNowEnabled(): boolean {
  return process.env.VERCEL_ENV === 'production' || process.env.INDEXNOW_FORCE === '1';
}

/** Шляхи сайту (`/blog/x`, `/ru/blog/x`) → один запит до api.indexnow.org. */
export async function submitIndexNow(paths: string[]): Promise<{ ok: boolean; status?: number; skipped?: string }> {
  const urlList = [...new Set(paths)].filter(p => p.startsWith('/')).map(p => `${SITE_URL}${p}`).slice(0, 10_000);
  if (urlList.length === 0) return { ok: false, skipped: 'no urls' };
  if (!isIndexNowEnabled()) return { ok: false, skipped: 'not production' };
  try {
    const res = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ host: HOST, key: INDEXNOW_KEY, keyLocation: `${SITE_URL}/${INDEXNOW_KEY}.txt`, urlList }),
      signal: AbortSignal.timeout(8000),
    });
    // 200/202 — прийнято; 4xx — щось із ключем або форматом, побачимо в логах
    if (!res.ok && res.status !== 202) console.warn('[indexnow]', res.status, urlList.length, 'urls');
    return { ok: res.ok || res.status === 202, status: res.status };
  } catch (e) {
    console.warn('[indexnow] failed:', e instanceof Error ? e.message : e);
    return { ok: false };
  }
}

'use client';

const UTM_KEY = 'fixline_utm';
const UTM_PARAMS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'] as const;

/**
 * Скільки живе збережене джерело переходу. Google Ads зараховує конверсію за
 * кліком до 90 днів — тримаємо стільки ж, щоб замовлення через тиждень після
 * рекламного кліку не осіло «прямим».
 */
const TTL_MS = 90 * 24 * 60 * 60 * 1000;

export type UtmData = {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  referrer_url?: string;
  /** Ідентифікатор рекламного кліку Google — ключ для вивантаження офлайн-конверсій */
  gclid?: string;
};

type Stored = UtmData & { at?: number };

function readStored(): Stored {
  try { return JSON.parse(localStorage.getItem(UTM_KEY) ?? '{}'); } catch { return {}; }
}

function writeStored(data: Stored): void {
  try { localStorage.setItem(UTM_KEY, JSON.stringify(data)); } catch {}
}

/**
 * Запам'ятовує, звідки прийшла людина. Викликається на кожній зміні сторінки
 * (Header), тому головне правило — НЕ затирати вже збережені мітки.
 *
 * Інцидент, який це закріплює: до 26.09.2026 функція на другій сторінці
 * (пошуковий рядок уже порожній, а document.referrer у SPA лишається google.com)
 * перезаписувала збережений gclid об'єктом з одним referrer_url. За два місяці
 * реклами в базі не було жодного замовлення з gclid, а оплачені кліки осідали
 * як «перехід із google.com».
 *
 * Правила:
 *  - є utm_* або gclid у адресі — це новий позначений перехід, він перебиває
 *    збережене (останній рекламний клік важливіший за перший);
 *  - міток немає, але є зовнішній реферер і нічого не збережено — записуємо
 *    реферер (органіка, ChatGPT тощо);
 *  - інакше нічого не чіпаємо.
 */
export function captureUtm(): void {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams(window.location.search);
  const gclid = params.get('gclid');
  const tagged = UTM_PARAMS.some(k => params.get(k)) || !!gclid;

  const externalRef = document.referrer && !document.referrer.includes(window.location.hostname)
    ? document.referrer
    : undefined;

  if (!tagged) {
    const stored = readStored();
    const alive = stored.at ? Date.now() - stored.at < TTL_MS : false;
    // Щось уже є (і не протухло) — зберігаємо перший/рекламний дотик.
    if (alive && Object.keys(stored).some(k => k !== 'at')) return;
    if (!externalRef) return;
    writeStored({ referrer_url: externalRef, at: Date.now() });
    return;
  }

  const data: Stored = { at: Date.now() };
  UTM_PARAMS.forEach(k => { if (params.get(k)) data[k] = params.get(k)!; });
  // Google Ads чіпляє до посилання свій gclid і не завжди лишає utm_*. Без цієї
  // гілки платний клік осідав би у звіті як звичайний перехід з google.com.
  if (!data.utm_source && gclid) {
    data.utm_source = 'google';
    data.utm_medium = 'cpc';
  }
  // Сам ідентифікатор теж зберігаємо: за ним Google приймає офлайн-конверсії,
  // тобто фактичну прибутковість замовлення. Відновити його заднім числом
  // неможливо — він живе лише в посиланні, за яким людина прийшла.
  if (gclid) data.gclid = gclid;
  if (externalRef) data.referrer_url = externalRef;
  writeStored(data);
}

/** Збережене джерело без службових полів; протухле — порожній об'єкт. */
export function getStoredUtm(): UtmData {
  if (typeof window === 'undefined') return {};
  const { at, ...data } = readStored();
  if (at && Date.now() - at >= TTL_MS) return {};
  return data;
}

export function clearUtm(): void {
  try { localStorage.removeItem(UTM_KEY); } catch {}
}

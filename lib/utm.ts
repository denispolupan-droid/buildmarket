'use client';

const UTM_KEY = 'fixline_utm';
const UTM_PARAMS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'] as const;

export type UtmData = {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  referrer_url?: string;
};

export function captureUtm(): void {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams(window.location.search);
  const hasUtm = UTM_PARAMS.some(k => params.has(k)) || params.has('gclid');
  if (!hasUtm && !document.referrer) return;

  const data: UtmData = {};
  UTM_PARAMS.forEach(k => { if (params.get(k)) data[k] = params.get(k)!; });
  // Google Ads чіпляє до посилання свій gclid і не завжди лишає utm_*. Без цієї
  // гілки платний клік осідав би у звіті як звичайний перехід з google.com.
  if (!data.utm_source && params.get('gclid')) {
    data.utm_source = 'google';
    data.utm_medium = 'cpc';
  }
  if (document.referrer && !document.referrer.includes(window.location.hostname)) {
    data.referrer_url = document.referrer;
  }

  try { localStorage.setItem(UTM_KEY, JSON.stringify(data)); } catch {}
}

export function getStoredUtm(): UtmData {
  if (typeof window === 'undefined') return {};
  try { return JSON.parse(localStorage.getItem(UTM_KEY) ?? '{}'); } catch { return {}; }
}

export function clearUtm(): void {
  try { localStorage.removeItem(UTM_KEY); } catch {}
}

'use client';

import { useEffect } from 'react';

/**
 * «Google Отзывы клиентов» — безкоштовний опитувальник Merchant Center: після
 * замовлення покупцю показують одне вікно «отримати лист від Google з
 * оцінкою покупки?». Згоди достатньо, щоб у видачі Shopping і в профілі
 * компанії з'явився рейтинг магазину. Для нас це головний дешевий канал
 * відгуків (своя розсилка дає ~4,5 %).
 *
 * Дані покупця (пошта) йдуть у Google ЛИШЕ після його «Так» у цьому вікні —
 * так влаштована програма. Пошту й номер замовлення передає кошик через
 * sessionStorage (у URL їм не місце), ключ стирається після показу — вікно
 * з'являється один раз на замовлення. Merchant ID публічний (він же у фіді).
 * Скрипт Google дозволений у CSP (next.config: apis.google.com, frame google.com).
 */
export const GCR_STORAGE_KEY = 'fixline_gcr';
const MERCHANT_ID = 5819941342;
/** Нова Пошта по Україні — 1–3 дні; Google просить дату, після якої питати про покупку */
const DELIVERY_DAYS = 3;

type Stored = { email?: string; num?: string | number };

declare global {
  interface Window {
    renderOptIn?: () => void;
    gapi?: { load: (lib: string, cb: () => void) => void; surveyoptin?: { render: (opts: Record<string, unknown>) => void } };
  }
}

export default function GoogleCustomerReviewsOptIn() {
  useEffect(() => {
    let stored: Stored | null = null;
    try {
      const raw = sessionStorage.getItem(GCR_STORAGE_KEY);
      if (raw) stored = JSON.parse(raw) as Stored;
      sessionStorage.removeItem(GCR_STORAGE_KEY);
    } catch { /* приватний режим або заборонене сховище — просто без вікна */ }
    if (!stored?.email || !stored.num) return;

    const date = new Date(Date.now() + DELIVERY_DAYS * 864e5).toISOString().slice(0, 10);
    const { email, num } = stored;
    window.renderOptIn = () => {
      window.gapi?.load('surveyoptin', () => {
        window.gapi?.surveyoptin?.render({
          merchant_id: MERCHANT_ID,
          order_id: String(num),
          email,
          delivery_country: 'UA',
          estimated_delivery_date: date,
          opt_in_style: 'CENTER_DIALOG',
        });
      });
    };
    const s = document.createElement('script');
    s.src = 'https://apis.google.com/js/platform.js?onload=renderOptIn';
    s.async = true; s.defer = true;
    document.body.appendChild(s);
    return () => { delete window.renderOptIn; };
  }, []);
  return null;
}

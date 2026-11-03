'use client';

/** Повідомити сервер про помилку з error boundary (→ /api/client-error → лог + Telegram). */
export function reportClientError(error: Error & { digest?: string }, scope: 'error' | 'global-error'): void {
  try {
    const body = JSON.stringify({
      message: error.message, digest: error.digest, scope,
      url: typeof location !== 'undefined' ? location.href : '', stack: error.stack,
    });
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      navigator.sendBeacon('/api/client-error', new Blob([body], { type: 'application/json' }));
    } else {
      fetch('/api/client-error', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
    }
  } catch { /* звіт про помилку не має ламати сторінку помилки */ }
}

'use client';

// global-error замінює КОРЕНЕВИЙ layout, коли помилка стається в самому layout
// (де ми викликаємо headers() і рендеримо провайдери). Звичайний app/error.tsx
// такі помилки не ловить. Тут не можна покладатися на глобальний CSS/провайдери,
// тож рендеримо власні <html>/<body> з інлайновими стилями.

import { useEffect } from 'react';
import { monitoring } from '../lib/monitoring';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    monitoring.captureException(error, {
      tags: { digest: error.digest ?? 'unknown', scope: 'global-error' },
    });
  }, [error]);

  return (
    <html lang="uk">
      <body style={{ margin: 0, fontFamily: 'system-ui, -apple-system, sans-serif', background: '#F8FAFC' }}>
        <div style={{
          minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{ textAlign: 'center', padding: 40, maxWidth: 400 }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0F172A', margin: '0 0 8px' }}>
              Щось пішло не так
            </h1>
            <p style={{ fontSize: 14, color: '#475569', marginBottom: 24 }}>
              Сталася критична помилка. Спробуйте оновити сторінку.
            </p>
            {error.digest && (
              <p style={{ fontSize: 12, color: '#94A3B8', marginBottom: 24, fontFamily: 'monospace' }}>
                Код: {error.digest}
              </p>
            )}
            <button
              onClick={reset}
              style={{
                height: 44, padding: '0 24px', borderRadius: 10,
                background: '#1E3A5F', color: '#fff', fontSize: 14, fontWeight: 700,
                border: 'none', cursor: 'pointer',
              }}
            >
              Спробувати знову
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}

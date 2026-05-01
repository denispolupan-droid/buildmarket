'use client';

import { useEffect } from 'react';
import { monitoring } from '../lib/monitoring';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    monitoring.captureException(error, {
      tags: { digest: error.digest ?? 'unknown' },
    });
  }, [error]);

  return (
    <div style={{
      minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg-page)',
    }}>
      <div style={{ textAlign: 'center', padding: '40px', maxWidth: '400px' }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚠️</div>
        <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 8px' }}>
          Щось пішло не так
        </h1>
        <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '24px' }}>
          Виникла помилка при завантаженні сторінки. Спробуйте оновити або поверніться пізніше.
        </p>
        {error.digest && (
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '24px', fontFamily: 'monospace' }}>
            Код: {error.digest}
          </p>
        )}
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={reset}
            style={{
              height: '44px', padding: '0 24px', borderRadius: '10px',
              background: '#1E3A5F', color: '#fff', fontSize: '14px', fontWeight: 700,
              border: 'none', cursor: 'pointer',
            }}
          >
            Спробувати знову
          </button>
          <a
            href="/"
            style={{
              height: '44px', padding: '0 24px', borderRadius: '10px',
              border: '1px solid var(--border)', background: 'var(--bg-card)',
              color: 'var(--text-primary)', fontSize: '14px', fontWeight: 600,
              display: 'inline-flex', alignItems: 'center', textDecoration: 'none',
            }}
          >
            На головну
          </a>
        </div>
      </div>
    </div>
  );
}

import React from 'react';

export default function ProductLoading() {
  const sk: React.CSSProperties = { background: 'var(--border)', borderRadius: '4px' };
  return (
    <div style={{ background: 'var(--bg-soft)', minHeight: '100vh' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '8px 32px 48px' }}>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', paddingTop: '16px' }}>
          {[80, 60, 100, 120].map((w, i) => (
            <div key={i} style={{ height: '14px', width: w, ...sk }} />
          ))}
        </div>
        <div style={{ display: 'flex', gap: '48px', flexWrap: 'wrap' }}>
          <div style={{ width: '480px', flexShrink: 0 }}>
            <div style={{ aspectRatio: '1', background: 'var(--bg-card)', borderRadius: '16px', border: '1px solid var(--border)' }} />
          </div>
          <div style={{ flex: 1, minWidth: '300px' }}>
            <div style={{ height: '16px', width: '100px', marginBottom: '12px', ...sk }} />
            <div style={{ height: '32px', width: '80%', borderRadius: '6px', marginBottom: '20px', ...sk }} />
            <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
              {[60, 80, 50].map((w, i) => (
                <div key={i} style={{ height: '28px', width: w, borderRadius: '14px', ...sk }} />
              ))}
            </div>
            <div style={{ height: '16px', width: '120px', marginBottom: '8px', ...sk }} />
            <div style={{ height: '14px', width: '140px', marginBottom: '24px', ...sk }} />
            <div style={{ height: '1px', background: 'var(--border)', marginBottom: '24px' }} />
            <div style={{ height: '36px', width: '150px', borderRadius: '6px', marginBottom: '12px', ...sk }} />
            <div style={{ height: '16px', width: '200px', marginBottom: '24px', ...sk }} />
            <div style={{ height: '1px', background: 'var(--border)', marginBottom: '24px' }} />
            <div style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
              <div style={{ height: '48px', width: '120px', borderRadius: '8px', ...sk }} />
              <div style={{ height: '48px', flex: 1, borderRadius: '8px', background: 'var(--bg-card)' }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

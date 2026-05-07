export default function ShopLoading() {
  return (
    <div style={{ background: 'var(--bg-soft)', minHeight: '100vh' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px' }}>
        <nav style={{ marginBottom: '24px', fontSize: '13px', color: '#94A3B8' }}>
          Головна / Магазин
        </nav>

        <div className="shop-layout">
          {/* Filters skeleton */}
          <aside className="shop-sidebar">
            <div className="skeleton" style={{ height: '24px', width: '120px', marginBottom: '16px' }} />
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="skeleton" style={{ height: '40px', marginBottom: '4px' }} />
            ))}
            <div className="skeleton" style={{ height: '1px', margin: '16px 0' }} />
            <div className="skeleton" style={{ height: '20px', width: '80px', marginBottom: '12px' }} />
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="skeleton" style={{ height: '36px', marginBottom: '8px' }} />
            ))}
          </aside>

          {/* Products grid skeleton */}
          <div style={{ flex: 1 }}>
            <div className="skeleton" style={{ height: '48px', marginBottom: '24px' }} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '20px' }}>
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} style={{ background: '#fff', borderRadius: '12px', overflow: 'hidden', border: '1px solid #E2E8F0' }}>
                  <div className="skeleton" style={{ aspectRatio: '1', borderRadius: 0 }} />
                  <div style={{ padding: '16px' }}>
                    <div className="skeleton" style={{ height: '14px', marginBottom: '8px', width: '40%' }} />
                    <div className="skeleton" style={{ height: '18px', marginBottom: '12px' }} />
                    <div className="skeleton" style={{ height: '24px', width: '50%' }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

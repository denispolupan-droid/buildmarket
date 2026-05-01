export default function ShopLoading() {
  return (
    <div style={{ background: '#fff', minHeight: '100vh' }}>
      <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '32px' }}>
        <nav style={{ marginBottom: '16px', fontSize: '13px', color: '#94A3B8' }}>
          Головна / Магазин
        </nav>

        <div style={{ display: 'flex', gap: '32px' }}>
          {/* Filters skeleton */}
          <div style={{ width: '240px', flexShrink: 0 }}>
            <div style={{ height: '40px', background: '#F1F5F9', borderRadius: '8px', marginBottom: '16px' }} />
            <div style={{ height: '200px', background: '#F1F5F9', borderRadius: '8px' }} />
          </div>

          {/* Products grid skeleton */}
          <div style={{ flex: 1 }}>
            <div style={{ height: '48px', background: '#F1F5F9', borderRadius: '8px', marginBottom: '24px' }} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '20px' }}>
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} style={{ background: '#F8FAFC', borderRadius: '12px', overflow: 'hidden' }}>
                  <div style={{ aspectRatio: '1', background: '#F1F5F9' }} />
                  <div style={{ padding: '16px' }}>
                    <div style={{ height: '14px', background: '#E2E8F0', borderRadius: '4px', marginBottom: '8px', width: '40%' }} />
                    <div style={{ height: '18px', background: '#E2E8F0', borderRadius: '4px', marginBottom: '12px' }} />
                    <div style={{ height: '24px', background: '#E2E8F0', borderRadius: '4px', width: '50%' }} />
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

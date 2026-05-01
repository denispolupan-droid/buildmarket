export default function ProductLoading() {
  return (
    <div style={{ background: '#F8FAFC', minHeight: '100vh' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '8px 32px 48px' }}>
        {/* Breadcrumb skeleton */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', paddingTop: '16px' }}>
          {[80, 60, 100, 120].map((w, i) => (
            <div key={i} style={{ height: '14px', background: '#E2E8F0', borderRadius: '4px', width: w }} />
          ))}
        </div>

        <div style={{ display: 'flex', gap: '48px', flexWrap: 'wrap' }}>
          {/* Gallery skeleton */}
          <div style={{ width: '480px', flexShrink: 0 }}>
            <div style={{ aspectRatio: '1', background: '#fff', borderRadius: '16px', border: '1px solid #E2E8F0' }} />
          </div>

          {/* Info skeleton */}
          <div style={{ flex: 1, minWidth: '300px' }}>
            <div style={{ height: '16px', background: '#E2E8F0', borderRadius: '4px', width: '100px', marginBottom: '12px' }} />
            <div style={{ height: '32px', background: '#E2E8F0', borderRadius: '6px', width: '80%', marginBottom: '20px' }} />

            <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
              {[60, 80, 50].map((w, i) => (
                <div key={i} style={{ height: '28px', background: '#E2E8F0', borderRadius: '14px', width: w }} />
              ))}
            </div>

            <div style={{ height: '16px', background: '#E2E8F0', borderRadius: '4px', width: '120px', marginBottom: '8px' }} />
            <div style={{ height: '14px', background: '#E2E8F0', borderRadius: '4px', width: '140px', marginBottom: '24px' }} />

            <div style={{ height: '1px', background: '#E2E8F0', marginBottom: '24px' }} />

            <div style={{ height: '36px', background: '#E2E8F0', borderRadius: '6px', width: '150px', marginBottom: '12px' }} />
            <div style={{ height: '16px', background: '#E2E8F0', borderRadius: '4px', width: '200px', marginBottom: '24px' }} />

            <div style={{ height: '1px', background: '#E2E8F0', marginBottom: '24px' }} />

            <div style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
              <div style={{ height: '48px', background: '#E2E8F0', borderRadius: '8px', width: '120px' }} />
              <div style={{ height: '48px', background: '#1E293B', borderRadius: '8px', flex: 1, opacity: 0.3 }} />
            </div>

            <div style={{ height: '1px', background: '#E2E8F0', marginBottom: '24px' }} />

            {[1, 2, 3, 4].map(i => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                <div style={{ height: '14px', background: '#E2E8F0', borderRadius: '4px', width: '80px' }} />
                <div style={{ height: '14px', background: '#E2E8F0', borderRadius: '4px', width: '100px' }} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CatalogLoading() {
  return (
    <div style={{ background: '#fff', minHeight: '100vh', padding: '32px' }}>
      <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
        <div className="skeleton" style={{ height: '32px', marginBottom: '24px', width: '200px' }} />

        <div style={{ display: 'flex', gap: '16px', marginBottom: '24px' }}>
          <div className="skeleton" style={{ height: '40px', width: '200px' }} />
          <div className="skeleton" style={{ height: '40px', width: '150px' }} />
        </div>

        <div style={{ background: '#F8FAFC', borderRadius: '12px', overflow: 'hidden' }}>
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} style={{
              display: 'flex',
              gap: '16px',
              padding: '16px 20px',
              borderBottom: '1px solid #E2E8F0',
              alignItems: 'center'
            }}>
              <div className="skeleton" style={{ width: '60px', height: '60px', flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div className="skeleton" style={{ height: '14px', marginBottom: '8px', width: '30%' }} />
                <div className="skeleton" style={{ height: '18px', width: '60%' }} />
              </div>
              <div className="skeleton" style={{ height: '20px', width: '80px' }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

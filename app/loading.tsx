export default function HomeLoading() {
  return (
    <div>
      {/* Hero skeleton */}
      <div style={{ background: 'linear-gradient(160deg, #1E293B 0%, #243F6B 100%)', padding: '52px 40px' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', textAlign: 'center' }}>
          <div className="skeleton-dark" style={{ height: '48px', maxWidth: '600px', margin: '0 auto 28px' }} />
          <div className="skeleton-dark" style={{ height: '20px', maxWidth: '500px', margin: '0 auto 36px' }} />
          <div style={{ display: 'flex', justifyContent: 'center', gap: '24px' }}>
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="skeleton-dark" style={{ height: '60px', width: '200px' }} />
            ))}
          </div>
        </div>
      </div>

      {/* Paths skeleton */}
      <div style={{ background: '#fff', padding: '48px 0' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '0 40px' }}>
          <div className="skeleton" style={{ height: '28px', maxWidth: '400px', margin: '0 auto 32px' }} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px' }}>
            {[1, 2, 3].map(i => (
              <div key={i} className="skeleton" style={{ height: '280px', borderRadius: '16px' }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function HomeLoading() {
  return (
    <div>
      {/* Hero skeleton */}
      <div style={{ background: 'linear-gradient(160deg, #1E293B 0%, #243F6B 100%)', padding: '52px 40px' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', textAlign: 'center' }}>
          <div style={{ height: '48px', background: 'rgba(255,255,255,0.1)', borderRadius: '8px', marginBottom: '28px', maxWidth: '600px', margin: '0 auto 28px' }} />
          <div style={{ height: '20px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', maxWidth: '500px', margin: '0 auto 36px' }} />
          <div style={{ display: 'flex', justifyContent: 'center', gap: '24px' }}>
            {[1, 2, 3, 4].map(i => (
              <div key={i} style={{ height: '60px', width: '200px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px' }} />
            ))}
          </div>
        </div>
      </div>

      {/* Paths skeleton */}
      <div style={{ background: '#fff', padding: '48px 0' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '0 40px' }}>
          <div style={{ height: '28px', background: '#F1F5F9', borderRadius: '8px', marginBottom: '32px', maxWidth: '400px', margin: '0 auto 32px' }} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px' }}>
            {[1, 2, 3].map(i => (
              <div key={i} style={{ height: '280px', background: '#F8FAFC', borderRadius: '16px' }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

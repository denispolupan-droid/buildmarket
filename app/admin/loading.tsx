export default function AdminLoading() {
  return (
    <div style={{ padding: '32px 36px 64px', background: 'var(--bg-soft)', minHeight: '100vh' }}>
      <div style={{ marginBottom: '28px' }}>
        <div style={{ width: '160px', height: '24px', background: 'var(--border)', borderRadius: '6px', marginBottom: '8px' }} />
        <div style={{ width: '80px', height: '16px', background: 'var(--border)', borderRadius: '4px', opacity: 0.6 }} />
      </div>
      {[1, 2, 3].map(i => (
        <div key={i} style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '16px',
          marginBottom: '16px', overflow: 'hidden', animation: 'pulse 1.5s ease-in-out infinite',
        }}>
          <div style={{ padding: '14px 20px', background: 'var(--bg-soft)', height: '48px' }} />
          <div style={{ height: '120px' }} />
        </div>
      ))}
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.5} }`}</style>
    </div>
  );
}

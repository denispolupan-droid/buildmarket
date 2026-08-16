'use client';

import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function SyncButton({ supplierId }: { supplierId: number }) {
  const [syncing, setSyncing] = useState(false);
  const [result, setResult]   = useState<{ rows_updated?: number; error?: string } | null>(null);
  const router = useRouter();

  async function handleSync() {
    setSyncing(true);
    setResult(null);
    try {
      const res = await fetch(`/api/admin/suppliers/${supplierId}/sync`, { method: 'POST' });
      const data = await res.json();
      setResult(data);
      router.refresh();
    } catch {
      setResult({ error: 'Помилка мережі' });
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
      <button onClick={handleSync} disabled={syncing} style={{
        display: 'flex', alignItems: 'center', gap: '7px',
        height: '36px', padding: '0 16px', borderRadius: '8px',
        border: 'none', background: '#1E3A5F', color: '#fff',
        fontSize: '13px', fontWeight: 700, cursor: syncing ? 'wait' : 'pointer',
        opacity: syncing ? 0.7 : 1,
      }}>
        <RefreshCw size={14} style={{ animation: syncing ? 'spin 1s linear infinite' : 'none' }} />
        {syncing ? 'Синхронізація...' : 'Синхронізувати зараз'}
      </button>
      {result && !result.error && (
        <span style={{ fontSize: '13px', color: '#15803D', fontWeight: 600 }}>
          ✓ Оновлено {result.rows_updated} позицій
        </span>
      )}
      {result?.error && (
        <span style={{ fontSize: '13px', color: '#DC2626' }}>{result.error}</span>
      )}
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

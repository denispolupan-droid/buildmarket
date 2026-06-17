'use client';

import { useState } from 'react';
import { Pencil } from 'lucide-react';

export default function CorrectButton({ documentId, docNumber }: { documentId: string; docNumber: string }) {
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  async function handleCorrect() {
    if (!confirm(`Виправити ${docNumber}?\n\nДокумент буде скасовано (сторно), і ви зможете створити новий виправлений.`)) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/accounting/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'correct', document_id: documentId }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Помилка'); return; }
      if (data.parentDocId) {
        window.location.href = `/admin/procurement/${data.parentDocId}`;
      } else {
        window.location.href = '/admin/accounting/documents';
      }
    } catch { setError('Мережева помилка'); }
    finally { setLoading(false); }
  }

  return (
    <>
      <button
        onClick={handleCorrect}
        disabled={loading}
        style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          height: '34px', padding: '0 14px', borderRadius: '8px',
          border: '1.5px solid #93C5FD', background: '#EFF6FF',
          color: '#1D4ED8', fontSize: '12px', fontWeight: 700,
          cursor: loading ? 'not-allowed' : 'pointer',
          opacity: loading ? 0.6 : 1,
        }}
      >
        <Pencil size={13} /> {loading ? 'Виправлення...' : 'Виправити'}
      </button>
      {error && (
        <div style={{ position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)', zIndex: 9999, background: '#FEF2F2', border: '1.5px solid #FCA5A5', borderRadius: '10px', padding: '10px 18px', fontSize: '13px', color: '#DC2626', fontWeight: 600, boxShadow: '0 4px 16px rgba(0,0,0,0.12)' }}>
          {error}
        </div>
      )}
    </>
  );
}

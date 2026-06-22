'use client';

import { useState, useRef, useEffect } from 'react';
import { MoreHorizontal, RotateCcw, Pencil } from 'lucide-react';
import ReturnButton from './ReturnButton';

type ReceiptLine = { sku: string; qty: number; cost_price: number; name?: string };

const menuBtnStyle: React.CSSProperties = {
  width: '100%', textAlign: 'left', padding: '8px 12px',
  borderRadius: '7px', border: 'none', background: 'none',
  fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)',
  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px',
};

export default function ReceiptActionsMenu({
  receiptId,
  docNumber,
  lines,
}: {
  receiptId: string;
  docNumber: string;
  lines: ReceiptLine[];
  hasExistingLC?: boolean;
}) {
  const [open,          setOpen]          = useState(false);
  const [showReturn,    setShowReturn]    = useState(false);
  const [correcting,    setCorrecting]    = useState(false);
  const [correctError,  setCorrectError]  = useState('');
  const ref = useRef<HTMLDivElement>(null);

  async function handleCorrect() {
    if (!confirm(`Виправити ${docNumber}?\n\nДокумент буде скасовано (сторно), і ви зможете створити новий виправлений прихід.`)) return;
    setOpen(false);
    setCorrecting(true);
    setCorrectError('');
    try {
      const res = await fetch('/api/admin/accounting/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'correct', document_id: receiptId }),
      });
      const data = await res.json();
      if (!res.ok) { setCorrectError(data.error ?? 'Помилка'); return; }
      if (data.parentDocId) {
        window.location.href = `/admin/procurement/${data.parentDocId}`;
      } else {
        window.location.href = '/admin/procurement/receipts';
      }
    } catch { setCorrectError('Мережева помилка'); }
    finally { setCorrecting(false); }
  }

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  return (
    <>
      <ReturnButton
        receiptId={receiptId}
        lines={lines}
        open={showReturn}
        onClose={() => setShowReturn(false)}
      />
      {correctError && (
        <div style={{ position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)', zIndex: 9999, background: '#FEF2F2', border: '1.5px solid #FCA5A5', borderRadius: '10px', padding: '10px 18px', fontSize: '13px', color: '#DC2626', fontWeight: 600, boxShadow: '0 4px 16px rgba(0,0,0,0.12)' }}>
          {correctError}
        </div>
      )}

      <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
        <button
          onClick={() => setOpen(v => !v)}
          title="Дії"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: '34px', height: '34px', borderRadius: '8px',
            border: '1px solid var(--border)',
            background: open ? 'var(--bg-soft)' : 'none',
            color: 'var(--text-secondary)', cursor: 'pointer',
          }}
        >
          <MoreHorizontal size={16} />
        </button>

        {open && (
          <div style={{
            position: 'absolute', right: 0, top: '40px', zIndex: 200,
            background: 'var(--bg-card)', border: '1px solid var(--border)',
            borderRadius: '10px', boxShadow: '0 8px 24px rgba(0,0,0,0.13)',
            minWidth: '220px', padding: '4px',
          }}>
            <button
              onClick={handleCorrect}
              disabled={correcting}
              style={{ ...menuBtnStyle, opacity: correcting ? 0.6 : 1 }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-soft)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'none')}
            >
              <Pencil size={14} style={{ color: 'var(--text-muted)' }} />
              {correcting ? 'Виправлення...' : 'Виправити прихід'}
            </button>
            <button
              onClick={() => { setOpen(false); setShowReturn(true); }}
              style={menuBtnStyle}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-soft)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'none')}
            >
              <RotateCcw size={14} style={{ color: 'var(--text-muted)' }} />
              Повернення постачальнику
            </button>
          </div>
        )}
      </div>
    </>
  );
}

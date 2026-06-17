'use client';

import { useState, useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';

type Confirm = {
  id: number;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  resolve: (ok: boolean) => void;
};

let nextId = 1;

export default function ConfirmProvider() {
  const [confirm, setConfirm] = useState<Confirm | null>(null);

  useEffect(() => {
    function handler(e: Event) {
      const { message, resolve, confirmLabel, cancelLabel } = (e as CustomEvent).detail as {
        message: string;
        resolve: (ok: boolean) => void;
        confirmLabel?: string;
        cancelLabel?: string;
      };
      setConfirm({ id: nextId++, message, resolve, confirmLabel: confirmLabel ?? 'Так', cancelLabel: cancelLabel ?? 'Скасувати' });
    }
    window.addEventListener('show-confirm', handler);
    return () => window.removeEventListener('show-confirm', handler);
  }, []);

  if (!confirm) return null;

  function answer(ok: boolean) {
    confirm!.resolve(ok);
    setConfirm(null);
  }

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={() => answer(false)}
        style={{
          position: 'fixed', inset: 0, zIndex: 999998,
          background: 'rgba(0,0,0,0.45)',
        }}
      />
      {/* Dialog */}
      <div style={{
        position: 'fixed', zIndex: 999999,
        top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        background: '#fff', borderRadius: '16px',
        boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
        padding: '28px 28px 22px',
        width: '380px', maxWidth: 'calc(100vw - 32px)',
        display: 'flex', flexDirection: 'column', gap: '16px',
      }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
          <span style={{ flexShrink: 0, marginTop: '2px', color: '#B45309' }}>
            <AlertTriangle size={22} />
          </span>
          <p style={{ margin: 0, fontSize: '14px', lineHeight: 1.55, color: '#1E293B', fontWeight: 500 }}>
            {confirm.message}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button
            onClick={() => answer(false)}
            style={{
              padding: '8px 18px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
              border: '1.5px solid #E2E8F0', background: '#F8FAFC', color: '#475569', cursor: 'pointer',
            }}
          >
            {confirm.cancelLabel}
          </button>
          <button
            autoFocus
            onClick={() => answer(true)}
            style={{
              padding: '8px 18px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
              border: 'none', background: '#1E3A5F', color: '#fff', cursor: 'pointer',
            }}
          >
            {confirm.confirmLabel}
          </button>
        </div>
      </div>
    </>
  );
}

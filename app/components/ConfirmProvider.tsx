'use client';

import { useState, useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Modal } from './admin/ui/Modal';

type Confirm = {
  id: number;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  resolve: (ok: boolean) => void;
};

let nextId = 1;

// Підтвердження (lib/confirm) — на тій самій Modal (<dialog>): відкривається
// пізніше за модалку, з якої його викликали, тож лягає поверх неї у верхньому
// шарі. Escape і клік повз картку = «Скасувати».
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

  function answer(ok: boolean) {
    confirm?.resolve(ok);
    setConfirm(null);
  }

  return (
    <Modal open={!!confirm} onClose={() => answer(false)} width={380} padding="28px 28px 22px" aria-label="Підтвердження">
      {confirm && (
        <div key={confirm.id} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
            <span style={{ flexShrink: 0, marginTop: '2px', color: '#B45309' }}>
              <AlertTriangle size={22} />
            </span>
            <p style={{ margin: 0, fontSize: '14px', lineHeight: 1.55, color: 'var(--text-primary)', fontWeight: 500 }}>
              {confirm.message}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={() => answer(false)}
              style={{
                padding: '8px 18px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
                border: '1.5px solid #E2E8F0', background: '#F8FAFC', color: '#475569', cursor: 'pointer',
              }}
            >
              {confirm.cancelLabel}
            </button>
            <button
              type="button"
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
      )}
    </Modal>
  );
}

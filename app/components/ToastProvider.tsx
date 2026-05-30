'use client';

import { useState, useEffect, useCallback } from 'react';
import { CheckCircle, XCircle, Info, AlertTriangle, X } from 'lucide-react';
import type { ToastType } from '../../lib/toast';

type Toast = { id: number; message: string; type: ToastType; duration: number };

const CFG: Record<ToastType, { icon: React.ReactNode; bg: string; border: string; color: string }> = {
  success: { icon: <CheckCircle size={18} />, bg: '#F0FDF4', border: '#86EFAC', color: '#15803D' },
  error:   { icon: <XCircle    size={18} />, bg: '#FEF2F2', border: '#FCA5A5', color: '#DC2626' },
  warning: { icon: <AlertTriangle size={18} />, bg: '#FFFBEB', border: '#FCD34D', color: '#B45309' },
  info:    { icon: <Info       size={18} />, bg: '#EFF6FF', border: '#93C5FD', color: '#1D4ED8' },
};

let nextId = 1;

export default function ToastProvider() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const remove = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  useEffect(() => {
    function handler(e: Event) {
      const { message, type, duration } = (e as CustomEvent).detail as { message: string; type: ToastType; duration: number };
      if (!message) return;
      const id = nextId++;
      setToasts(prev => [...prev, { id, message, type, duration }]);
      setTimeout(() => remove(id), duration);
    }
    window.addEventListener('show-toast', handler);
    return () => window.removeEventListener('show-toast', handler);
  }, [remove]);

  if (toasts.length === 0) return null;

  return (
    <div style={{
      position: 'fixed', top: '24px', left: '50%', transform: 'translateX(-50%)',
      zIndex: 99999, display: 'flex', flexDirection: 'column', gap: '8px',
      alignItems: 'center', pointerEvents: 'none',
    }}>
      {toasts.map(t => {
        const c = CFG[t.type];
        return (
          <div key={t.id} style={{
            pointerEvents: 'auto',
            display: 'flex', alignItems: 'flex-start', gap: '10px',
            padding: '12px 16px', borderRadius: '12px',
            background: c.bg, border: `1.5px solid ${c.border}`, color: c.color,
            fontSize: '14px', fontWeight: 600, lineHeight: 1.4,
            boxShadow: '0 8px 32px rgba(0,0,0,0.14)',
            maxWidth: '480px', minWidth: '260px',
            animation: 'toast-in 0.22s cubic-bezier(0.22,1,0.36,1)',
          }}>
            <span style={{ flexShrink: 0, marginTop: '1px' }}>{c.icon}</span>
            <span style={{ flex: 1 }}>{t.message}</span>
            <button onClick={() => remove(t.id)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: c.color, opacity: 0.6, padding: 0, display: 'flex', flexShrink: 0 }}>
              <X size={16} />
            </button>
          </div>
        );
      })}
      <style>{`
        @keyframes toast-in {
          from { opacity: 0; transform: translateY(-12px) scale(0.96); }
          to   { opacity: 1; transform: translateY(0)     scale(1);    }
        }
      `}</style>
    </div>
  );
}

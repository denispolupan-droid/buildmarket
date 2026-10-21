'use client';

import { useEffect, useState } from 'react';
import { X, Copy, Check } from 'lucide-react';
import type { TtnDetails } from '../../../lib/ttn-details';

/**
 * «Деталі ЕН»: що вписано в накладну — післяплата, отримувач, звідки/куди,
 * вага, платник, статус. Лише перегляд; дані збирає /api/admin/orders/[id]/ttn-details
 * (знімок при створенні + живі дані перевізника).
 */
type Props = { orderId: string; orderNumber: number; onClose: () => void };

const caps: React.CSSProperties = { fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' };

export default function TtnDetailsModal({ orderId, orderNumber, onClose }: Props) {
  const [data, setData] = useState<TtnDetails | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/orders/${orderId}/ttn-details`)
      .then(async r => {
        const d = await r.json().catch(() => ({}));
        if (cancelled) return;
        if (!r.ok || d.error) setError(d.error ?? 'Не вдалося завантажити накладну');
        else setData(d as TtnDetails);
      })
      .catch(() => { if (!cancelled) setError('Збій мережі'); });
    return () => { cancelled = true; };
  }, [orderId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  function copyTtn() {
    if (!data) return;
    navigator.clipboard?.writeText(data.ttn).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {});
  }

  return (
    <div onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', overflowY: 'auto' }}>
      <div className="adm-modal-box" onClick={e => e.stopPropagation()}
        style={{ background: 'var(--bg-card)', borderRadius: '16px', width: '520px', maxWidth: '96vw', maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontWeight: 800, fontSize: '16px', color: 'var(--text-primary)' }}>{data ? data.ttn : 'Накладна'}</span>
              {data && (
                <button onClick={copyTtn} title="Скопіювати номер"
                  style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: copied ? '#15803D' : 'var(--text-muted)', display: 'inline-flex' }}>
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                </button>
              )}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              {data ? `${data.carrierLabel} · ` : ''}замовлення #{orderNumber}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'inline-flex' }}><X size={18} /></button>
        </div>

        <div style={{ padding: '14px 20px 20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {!data && !error && <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Завантажуємо дані накладної…</div>}
          {error && (
            <div style={{ fontSize: '12px', color: '#DC2626', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '9px', padding: '9px 11px' }}>⚠ {error}</div>
          )}

          {data?.sections.map(sec => (
            <section key={sec.title}>
              <div style={{ ...caps, marginBottom: '6px' }}>{sec.title}</div>
              <div style={{ borderTop: '1px solid var(--border-light)' }}>
                {sec.rows.map(r => (
                  <div key={r.label} style={{ display: 'flex', gap: '12px', padding: '7px 0', borderBottom: '1px solid var(--border-light)', fontSize: '13px' }}>
                    <div style={{ width: '42%', flexShrink: 0, color: 'var(--text-secondary)' }}>{r.label}</div>
                    <div style={{ flex: 1, minWidth: 0, color: 'var(--text-primary)', fontWeight: r.accent ? 700 : 500, wordBreak: 'break-word' }}>
                      {r.value}
                      {r.hint && <div style={{ fontSize: '11.5px', fontWeight: 400, color: 'var(--text-muted)' }}>{r.hint}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}

          {data && data.history.length > 1 && (
            <section>
              <div style={{ ...caps, marginBottom: '6px' }}>Історія</div>
              <div style={{ borderTop: '1px solid var(--border-light)' }}>
                {data.history.map((h, i) => (
                  <div key={`${h.date}-${i}`} style={{ display: 'flex', gap: '12px', padding: '6px 0', borderBottom: '1px solid var(--border-light)', fontSize: '12.5px' }}>
                    <div style={{ width: '42%', flexShrink: 0, color: 'var(--text-muted)' }}>{h.date}</div>
                    <div style={{ flex: 1, color: 'var(--text-primary)' }}>{h.status_name}</div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {data && data.notes.length > 0 && (
            <div style={{ fontSize: '11.5px', lineHeight: 1.5, color: 'var(--text-muted)', background: 'var(--bg-soft)', borderRadius: '9px', padding: '9px 11px' }}>
              {data.notes.map(n => <div key={n}>{n}</div>)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

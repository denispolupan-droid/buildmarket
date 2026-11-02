'use client';

import { useState, useEffect, useRef } from 'react';
import { Pencil, UserPlus } from 'lucide-react';
import type { CounterpartyOption } from './types';

/**
 * Контрагент замовлення. Міняють у двох випадках: замовлення оформили не на
 * того клієнта, або клієнт просить відправити взагалі іншій людині. Тому разом
 * із прив'язкою підставляються контакт, телефон і компанія з картки —
 * лишається поправити хіба що адресу доставки.
 *
 * Проведені документи лишаються на старому контрагенті — там уже проводки;
 * чернетку РН серверна частина переносить на нового.
 */
export function CounterpartyPicker({ orderId, customerId, onPicked }: {
  orderId: string;
  customerId: string | null;
  onPicked: (patch: { customer_id: string | null; contact?: string; phone?: string; company?: string | null }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState<CounterpartyOption | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CounterpartyOption[]>([]);
  const [saving, setSaving] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // Ім'я прив'язаного контрагента: у замовленні лежить лише id
  useEffect(() => {
    if (!customerId) { setCurrent(null); return; }
    let alive = true;
    fetch(`/api/admin/customers/search?id=${customerId}`)
      .then(r => r.ok ? r.json() : [])
      .then((rows: CounterpartyOption[]) => { if (alive) setCurrent(rows[0] ?? null); })
      .catch(() => {});
    return () => { alive = false; };
  }, [customerId]);

  // Список: спершу останні клієнти, далі — пошук із паузою на набір
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      const q = query.trim();
      fetch(`/api/admin/customers/search?q=${encodeURIComponent(q.length >= 2 ? q : '')}&limit=30`)
        .then(r => r.ok ? r.json() : [])
        .then((rows: CounterpartyOption[]) => setResults(rows))
        .catch(() => setResults([]));
    }, query ? 250 : 0);
    return () => clearTimeout(t);
  }, [open, query]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  async function pick(id: string | null) {
    setSaving(true);
    const res = await fetch(`/api/admin/orders/${orderId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customer_id: id }),
    });
    setSaving(false);
    if (!res.ok) return;
    const data = await res.json().catch(() => ({}));
    const c = data.customer as { contact?: string | null; phone?: string | null; company?: string | null } | undefined;
    onPicked({
      customer_id: id,
      ...(c?.contact ? { contact: c.contact } : {}),
      ...(c?.phone ? { phone: c.phone } : {}),
      ...(c ? { company: c.company ?? null } : {}),
    });
    setOpen(false);
    setQuery('');
  }

  return (
    <div ref={boxRef} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
      <button type="button" onClick={() => setOpen(o => !o)}
        title={customerId
          ? `Контрагент: ${current ? [current.name, current.company].filter(Boolean).join(' · ') : '…'} — натисніть, щоб змінити`
          : 'Прив\'язати контрагента'}
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', color: open ? 'var(--brand-blue)' : 'var(--text-muted)', lineHeight: 1, display: 'inline-flex' }}>
        {customerId ? <Pencil size={12} /> : <UserPlus size={13} />}
      </button>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 60, width: '320px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '10px', boxShadow: '0 12px 32px rgba(16,24,40,0.18)', padding: '8px' }}>
          <div className="oc-sub-lbl" style={{ marginBottom: '2px' }}>Контрагент замовлення</div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.35, marginBottom: '6px' }}>
            Контакт, телефон і компанія підставляться з картки. Адреса доставки лишиться колишня.
          </div>
          <input autoFocus value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Ім'я, компанія, телефон…"
            style={{ width: '100%', height: '30px', padding: '0 8px', boxSizing: 'border-box', border: '1px solid var(--border)', borderRadius: '7px', fontSize: '12px', outline: 'none' }} />
          <div style={{ maxHeight: '210px', overflowY: 'auto', marginTop: '6px' }}>
            {results.length === 0 && (
              <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', padding: '8px 4px' }}>Нічого не знайшлось</div>
            )}
            {results.map(c => (
              <button key={c.id} type="button" disabled={saving} onClick={() => pick(c.id)}
                style={{ width: '100%', textAlign: 'left', padding: '6px 6px', border: 'none', borderRadius: '7px', cursor: saving ? 'wait' : 'pointer',
                  background: c.id === customerId ? '#EAF1F8' : 'transparent', display: 'flex', flexDirection: 'column', gap: '1px' }}>
                <span style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {c.name}{c.company ? ` · ${c.company}` : ''}
                </span>
                {(c.phone || c.city) && (
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{[c.phone, c.city].filter(Boolean).join(' · ')}</span>
                )}
              </button>
            ))}
          </div>
          {customerId && (
            <button type="button" disabled={saving} onClick={() => pick(null)}
              style={{ marginTop: '6px', width: '100%', height: '28px', border: '1px solid var(--border)', borderRadius: '7px', background: 'var(--bg-soft)', cursor: 'pointer', fontSize: '11.5px', fontWeight: 600, color: 'var(--text-secondary)' }}>
              {`Відв'язати контрагента`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

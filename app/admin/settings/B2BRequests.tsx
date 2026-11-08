'use client';

import { useState } from 'react';
import { Briefcase, Check, X, Loader2 } from 'lucide-react';
import { showToast } from '../../../lib/toast';
import { useAdminQuery } from '../../../lib/admin/api';

// Заявки на B2B-доступ (міграція 146): новий оптовик чи дропшипер бачить
// роздріб, доки адмін не схвалить заявку. Стиль — як у блоці «Користувачі».

type B2BRequest = {
  id: string; email: string; status: 'pending' | 'rejected';
  type: string; typeLabel: string; company: string; contact: string;
  phone: string; city: string; taxNumber: string; requestedAt: string; confirmed: boolean;
};

const fmtDate = (iso: string) => new Date(iso).toLocaleString('uk-UA', { timeZone: 'Europe/Kyiv', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export default function B2BRequests() {
  const { data, isValidating: loading, refresh: load } = useAdminQuery<{ requests?: B2BRequest[] }>('/api/admin/b2b-requests', {
    onError: e => showToast(e.message, 'error'),
  });
  const items = data?.requests ?? [];
  const [busy, setBusy] = useState<string | null>(null);

  async function decide(id: string, action: 'approve' | 'reject') {
    setBusy(id);
    try {
      const res = await fetch('/api/admin/b2b-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: id, action }),
      });
      const data = await res.json();
      if (!res.ok) { showToast(data.error ?? 'Помилка', 'error'); return; }
      showToast(action === 'approve' ? 'Доступ відкрито — оптові ціни з наступного входу партнера' : 'Заявку відхилено', 'success');
      await load();
    } finally { setBusy(null); }
  }

  const pending = items.filter(i => i.status === 'pending');
  const rejected = items.filter(i => i.status === 'rejected');

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px 24px', marginBottom: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
        <Briefcase size={16} color="var(--brand-blue)" />
        <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
          Заявки на оптовий / дропшип доступ{pending.length ? ` · ${pending.length}` : ''}
        </span>
      </div>
      <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 14px' }}>
        Поки заявку не схвалено, партнер бачить роздрібні ціни. Після схвалення створюється контрагент і договір.
      </p>

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)', fontSize: '13px' }}>
          <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Завантаження…
        </div>
      ) : pending.length === 0 ? (
        <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Нових заявок немає</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {pending.map(r => (
            <div key={r.id} style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', padding: '10px 12px', borderRadius: '8px', background: 'var(--bg-soft)', border: '1px solid var(--border)' }}>
              <div style={{ flex: 1, minWidth: '220px' }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {r.company || r.contact || r.email} <span style={{ fontWeight: 500, color: 'var(--text-muted)' }}>· {r.typeLabel}</span>
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                  {[r.contact, r.email, r.phone, r.city, r.taxNumber && `ЄДРПОУ/ІПН ${r.taxNumber}`].filter(Boolean).join(' · ')}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                  {fmtDate(r.requestedAt)}{r.confirmed ? '' : ' · email ще не підтверджено'}
                </div>
              </div>
              <button className="fin-pill active" disabled={busy === r.id} onClick={() => decide(r.id, 'approve')} style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <Check size={13} /> Схвалити
              </button>
              <button className="fin-pill" disabled={busy === r.id} onClick={() => decide(r.id, 'reject')} style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <X size={13} /> Відхилити
              </button>
            </div>
          ))}
        </div>
      )}

      {rejected.length > 0 && (
        <details style={{ marginTop: '12px', fontSize: '12px', color: 'var(--text-muted)' }}>
          <summary style={{ cursor: 'pointer' }}>Відхилені · {rejected.length}</summary>
          {rejected.map(r => (
            <div key={r.id} style={{ display: 'flex', gap: '10px', alignItems: 'center', padding: '6px 0' }}>
              <span style={{ flex: 1 }}>{r.company || r.contact || r.email} · {r.typeLabel} · {r.email}</span>
              <button className="fin-pill" disabled={busy === r.id} onClick={() => decide(r.id, 'approve')} style={{ cursor: 'pointer' }}>Схвалити</button>
            </div>
          ))}
        </details>
      )}
    </div>
  );
}

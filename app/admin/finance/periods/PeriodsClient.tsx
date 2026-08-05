'use client';

import { useEffect, useState, useCallback } from 'react';
import { Lock, LockOpen } from 'lucide-react';
import { showToast } from '../../../../lib/toast';

type MonthRow = {
  month: string;          // YYYY-MM-01
  closed: boolean;
  closed_at: string | null;
  closed_by: string | null;
  entries: number;
  revenue: number;
};

const UA_MONTHS = ['Січень','Лютий','Березень','Квітень','Травень','Червень','Липень','Серпень','Вересень','Жовтень','Листопад','Грудень'];

function label(month: string) {
  const d = new Date(month);
  return `${UA_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export default function PeriodsClient() {
  const [months, setMonths] = useState<MonthRow[] | null>(null);
  const [busy, setBusy]     = useState<string | null>(null);

  const load = useCallback(() => {
    fetch('/api/admin/finance/periods')
      .then(r => r.json())
      .then(d => setMonths(d.months ?? []))
      .catch(() => showToast('Не вдалося завантажити періоди', 'error'));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function act(month: string, action: 'close' | 'open') {
    setBusy(month);
    try {
      const res = await fetch('/api/admin/finance/periods', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month, action }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        showToast(action === 'close' ? `${label(month)} закрито 🔒` : `${label(month)} відкрито`, 'success');
        load();
      } else {
        showToast(data.error ?? 'Помилка', 'error');
      }
    } catch {
      showToast('Мережева помилка', 'error');
    }
    setBusy(null);
  }

  if (!months) return <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Завантаження…</div>;

  const currentKey = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {months.map(m => {
        const isCurrent = m.month === currentKey;
        return (
          <div key={m.month} className="fin-card" style={{
            display: 'grid', gridTemplateColumns: '1fr 130px 150px 140px',
            gap: '12px', alignItems: 'center', padding: '14px 18px',
          }}>
            <div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
                {label(m.month)}{isCurrent && <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '8px' }}>поточний</span>}
              </div>
              {m.closed && (
                <div style={{ fontSize: '11px', color: '#15803D', marginTop: '2px' }}>
                  🔒 Закрито {m.closed_at ? new Date(m.closed_at).toLocaleDateString('uk-UA') : ''}{m.closed_by ? ` · ${m.closed_by}` : ''}
                </div>
              )}
            </div>
            <div style={{ textAlign: 'right', fontSize: '12px', color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
              {m.entries} проводок
            </div>
            <div style={{ textAlign: 'right', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
              {m.revenue > 0 ? `${m.revenue.toLocaleString('uk-UA', { minimumFractionDigits: 2 })} ₴` : '—'}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              {isCurrent ? (
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>відкрито</span>
              ) : m.closed ? (
                <button onClick={() => act(m.month, 'open')} disabled={busy === m.month}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', height: '32px', padding: '0 14px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-soft)', color: 'var(--text-secondary)', fontSize: '12px', fontWeight: 600, cursor: 'pointer', opacity: busy === m.month ? 0.6 : 1 }}>
                  <LockOpen size={13} /> Відкрити
                </button>
              ) : (
                <button onClick={() => act(m.month, 'close')} disabled={busy === m.month}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', height: '32px', padding: '0 14px', borderRadius: '8px', border: 'none', background: '#1E3A5F', color: '#fff', fontSize: '12px', fontWeight: 700, cursor: 'pointer', opacity: busy === m.month ? 0.6 : 1 }}>
                  <Lock size={13} /> Закрити місяць
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

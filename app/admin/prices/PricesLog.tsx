'use client';

import { useState, useEffect } from 'react';
import { Tag, RotateCcw, TrendingUp, TrendingDown, Minus, ChevronDown, ChevronUp, Clock, X } from 'lucide-react';
import { showToast } from '../../../lib/toast';

type LogEntry = {
  id: number;
  created_at: string;
  type: string;
  value: number;
  target: string;
  is_promo: boolean;
  comment: string | null;
  revert_at: string | null;
  reverted_at: string | null;
  effective_from: string | null;
  status: string;
  count: number | null;
  snapshot: { sku: string; name: string; before: Record<string, number | null>; after: Record<string, number | null> }[] | null;
};

const TYPE_LABEL: Record<string, string> = {
  multiply_cost: '× від собівартості',
  increase_pct:  '% зміна',
  fixed:         'Фіксована ціна',
  manual:        'Ручна правка',
};

const TARGET_LABEL: Record<string, string> = {
  retail: 'Роздріб',
  unit:   'Опт',
  drop:   'Дроп',
  all:    'Всі',
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('uk-UA', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatDateOnly(iso: string) {
  return new Date(iso).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function promoStatus(entry: LogEntry) {
  if (!entry.is_promo) return null;
  const today = new Date().toISOString().split('T')[0];
  if (entry.reverted_at) return { label: 'Скасовано', color: '#6B7280', bg: '#F3F4F6' };
  if (entry.revert_at && entry.revert_at <= today) return { label: 'Протерміновано', color: '#B45309', bg: '#FEF3C7' };
  return { label: 'Активна', color: '#15803D', bg: '#DCFCE7' };
}

export default function PricesLog() {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [cancelling, setCancelling] = useState<number | null>(null);

  useEffect(() => {
    fetch('/api/admin/prices/log')
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setEntries(d); })
      .finally(() => setLoading(false));
  }, []);

  function toggle(id: number) {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function cancelPending(id: number) {
    setCancelling(id);
    try {
      const res = await fetch('/api/admin/prices/log', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action: 'cancel' }),
      });
      if (!res.ok) throw new Error(await res.text());
      setEntries(prev => prev.map(e => e.id === id ? { ...e, status: 'cancelled' } : e));
      showToast('Заплановану переоцінку скасовано', 'success');
    } catch {
      showToast('Помилка скасування', 'error');
    } finally {
      setCancelling(null);
    }
  }

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 14 }}>Завантаження...</div>;
  }

  if (entries.length === 0) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 14 }}>Журнал порожній — операцій переоцінки ще не було</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {entries.map(entry => {
        const isOpen = expanded.has(entry.id);
        const valStr = entry.type === 'manual'
          ? ''
          : entry.type === 'increase_pct'
          ? (entry.value >= 0 ? `+${entry.value}%` : `${entry.value}%`)
          : entry.type === 'multiply_cost'
          ? `×${entry.value}`
          : `${entry.value} ₴`;
        const isPositive = entry.value >= 0;
        const ps = promoStatus(entry);
        const hasSnapshot = (entry.snapshot?.length ?? 0) > 0;
        const isPending   = entry.status === 'pending';
        const isCancelled = entry.status === 'cancelled';

        return (
          <div key={entry.id} style={{
            background: isPending ? '#F0F9FF' : isCancelled ? '#F9FAFB' : 'var(--bg-card)',
            border: `1px solid ${isPending ? '#BAE6FD' : isCancelled ? '#E5E7EB' : 'var(--border)'}`,
            borderRadius: 10, overflow: 'hidden',
            opacity: isCancelled ? 0.7 : 1,
          }}>
            <div
              style={{ display: 'grid', gridTemplateColumns: '155px 80px 80px 70px 1fr auto', alignItems: 'center', gap: 10, padding: '11px 16px', cursor: hasSnapshot ? 'pointer' : 'default' }}
              onClick={() => hasSnapshot && toggle(entry.id)}
            >
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{formatDate(entry.created_at)}</div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontWeight: 700, fontSize: 14,
                color: isPositive ? '#15803D' : '#DC2626' }}>
                {entry.type === 'increase_pct'
                  ? (isPositive ? <TrendingUp size={13} /> : <TrendingDown size={13} />)
                  : <Minus size={13} />}
                {valStr}
              </div>

              <div style={{ fontSize: 12, color: '#6B7280', background: '#F3F4F6', padding: '2px 8px', borderRadius: 5, textAlign: 'center' }}>
                {TARGET_LABEL[entry.target] ?? entry.target}
              </div>

              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                {entry.count != null ? `${entry.count} поз.` : '—'}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0, flexWrap: 'wrap' }}>
                {isPending && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 700,
                    color: '#0369A1', background: '#E0F2FE', border: '1px solid #BAE6FD',
                    padding: '2px 6px', borderRadius: 4, flexShrink: 0 }}>
                    <Clock size={10} /> Заплановано
                  </span>
                )}
                {isCancelled && (
                  <span style={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF', background: '#F3F4F6',
                    padding: '2px 7px', borderRadius: 4, flexShrink: 0 }}>
                    Скасовано
                  </span>
                )}
                {entry.is_promo && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 700,
                    color: '#C2410C', background: '#FFF7ED', border: '1px solid #FDBA74',
                    padding: '2px 6px', borderRadius: 4, flexShrink: 0 }}>
                    <Tag size={10} /> Акція
                  </span>
                )}
                {ps && (
                  <span style={{ fontSize: 11, fontWeight: 600, color: ps.color, background: ps.bg,
                    padding: '2px 7px', borderRadius: 4, flexShrink: 0 }}>
                    {ps.label}
                  </span>
                )}
                {entry.effective_from && isPending && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, color: '#0369A1', flexShrink: 0 }}>
                    з {formatDateOnly(entry.effective_from)}
                  </span>
                )}
                {entry.revert_at && !entry.reverted_at && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, color: '#6B7280', flexShrink: 0 }}>
                    <RotateCcw size={10} /> до {formatDateOnly(entry.revert_at)}
                  </span>
                )}
                {entry.reverted_at && (
                  <span style={{ fontSize: 11, color: '#9CA3AF' }}>скасовано {formatDateOnly(entry.reverted_at)}</span>
                )}
                {entry.comment && (
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {entry.comment}
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                {isPending && (
                  <button
                    onClick={() => cancelPending(entry.id)}
                    disabled={cancelling === entry.id}
                    title="Скасувати заплановану переоцінку"
                    style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '3px 8px', borderRadius: 5, border: '1px solid #FCA5A5', background: '#FEF2F2', color: '#DC2626', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                    <X size={10} /> {cancelling === entry.id ? '...' : 'Скасувати'}
                  </button>
                )}
                {hasSnapshot && (
                  <div style={{ color: 'var(--text-secondary)' }}>
                    {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </div>
                )}
                {!hasSnapshot && !isPending && <div />}
              </div>
            </div>

            {isOpen && hasSnapshot && (
              <div style={{ borderTop: '1px solid var(--border)', padding: '0 16px 12px' }}>
                <div style={{ fontSize: 11, color: '#9CA3AF', padding: '8px 0 6px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {TYPE_LABEL[entry.type] ?? entry.type}
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: '#F8FAFC' }}>
                        {['Артикул', 'Назва', 'До', 'Після', 'Різниця'].map(h => (
                          <th key={h} style={{ padding: '5px 10px', textAlign: h === 'Артикул' || h === 'Назва' ? 'left' : 'right',
                            color: '#94A3B8', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {entry.snapshot!.slice(0, 100).map(row => {
                        const bv = row.before?.[entry.target] ?? row.before?.retail ?? null;
                        const av = row.after?.[entry.target]  ?? row.after?.retail  ?? null;
                        const diff = bv != null && av != null ? (av as number) - (bv as number) : null;
                        return (
                          <tr key={row.sku} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '4px 10px', fontFamily: 'monospace', color: '#6B7280' }}>{row.sku}</td>
                            <td style={{ padding: '4px 10px' }}>{row.name}</td>
                            <td style={{ padding: '4px 10px', textAlign: 'right', color: '#6B7280' }}>{bv != null ? `${bv} ₴` : '—'}</td>
                            <td style={{ padding: '4px 10px', textAlign: 'right', fontWeight: 600 }}>{av != null ? `${av} ₴` : '—'}</td>
                            <td style={{ padding: '4px 10px', textAlign: 'right', fontWeight: 600,
                              color: diff == null ? '#9CA3AF' : diff > 0 ? '#15803D' : diff < 0 ? '#DC2626' : '#6B7280' }}>
                              {diff == null ? '—' : diff > 0 ? `+${diff.toFixed(0)} ₴` : `${diff.toFixed(0)} ₴`}
                            </td>
                          </tr>
                        );
                      })}
                      {(entry.snapshot?.length ?? 0) > 100 && (
                        <tr><td colSpan={5} style={{ padding: '6px 10px', color: '#9CA3AF', fontStyle: 'italic' }}>
                          + ще {entry.snapshot!.length - 100} позицій
                        </td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

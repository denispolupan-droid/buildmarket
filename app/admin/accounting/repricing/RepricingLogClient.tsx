'use client';

import { useState } from 'react';
import { Tag, RotateCcw, TrendingUp, TrendingDown, Minus, ChevronDown, ChevronUp } from 'lucide-react';

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
  count: number | null;
  snapshot: { sku: string; name: string; before: Record<string, number>; after: Record<string, number> }[] | null;
};

const TYPE_LABEL: Record<string, string> = {
  multiply_cost: '× від собівартості',
  increase_pct:  '% зміна',
  fixed:         'Фіксована ціна',
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
  return new Date(iso).toLocaleDateString('uk-UA', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });
}

function promoStatus(entry: LogEntry): { label: string; color: string; bg: string } {
  if (!entry.is_promo) return { label: '', color: '', bg: '' };
  const today = new Date().toISOString().split('T')[0];
  if (entry.reverted_at) return { label: 'Скасовано', color: '#6B7280', bg: '#F3F4F6' };
  if (entry.revert_at && entry.revert_at <= today) return { label: 'Протерміновано', color: '#B45309', bg: '#FEF3C7' };
  return { label: 'Активна', color: '#15803D', bg: '#DCFCE7' };
}

export default function RepricingLogClient({ entries }: { entries: LogEntry[] }) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  function toggle(id: number) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1100 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Журнал переоцінок</h1>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '4px 0 0' }}>
          Всі операції зміни цін з деталізацією по товарах
        </p>
      </div>

      {entries.length === 0 && (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 14 }}>
          Журнал порожній
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {entries.map(entry => {
          const isOpen = expanded.has(entry.id);
          const pct = entry.type === 'increase_pct' ? (entry.value >= 0 ? `+${entry.value}%` : `${entry.value}%`) : null;
          const multiplier = entry.type === 'multiply_cost' ? `×${entry.value}` : null;
          const fixed = entry.type === 'fixed' ? `${entry.value} ₴` : null;
          const valueLabel = pct ?? multiplier ?? fixed ?? String(entry.value);
          const isPositive = entry.value >= 0;
          const ps = promoStatus(entry);
          const hasSnapshot = (entry.snapshot?.length ?? 0) > 0;

          return (
            <div key={entry.id} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
              {/* Row */}
              <div
                style={{ display: 'grid', gridTemplateColumns: '160px 90px 80px 80px 1fr auto', alignItems: 'center', gap: 12, padding: '12px 16px', cursor: hasSnapshot ? 'pointer' : 'default' }}
                onClick={() => hasSnapshot && toggle(entry.id)}
              >
                {/* Date */}
                <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                  {formatDate(entry.created_at)}
                </div>

                {/* Value */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontWeight: 700, fontSize: 14,
                  color: isPositive ? '#15803D' : '#DC2626' }}>
                  {entry.type === 'increase_pct'
                    ? (isPositive ? <TrendingUp size={14} /> : <TrendingDown size={14} />)
                    : <Minus size={14} />}
                  {valueLabel}
                </div>

                {/* Target */}
                <div style={{ fontSize: 12, color: '#6B7280', background: '#F3F4F6', padding: '2px 8px', borderRadius: 5, textAlign: 'center' }}>
                  {TARGET_LABEL[entry.target] ?? entry.target}
                </div>

                {/* Count */}
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  {entry.count != null ? `${entry.count} поз.` : '—'}
                </div>

                {/* Comment + badges */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                  {entry.is_promo && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 700,
                      color: '#C2410C', background: '#FFF7ED', border: '1px solid #FDBA74',
                      padding: '2px 7px', borderRadius: 5, flexShrink: 0 }}>
                      <Tag size={10} /> Акція
                    </span>
                  )}
                  {entry.is_promo && ps.label && (
                    <span style={{ fontSize: 11, fontWeight: 600, color: ps.color, background: ps.bg,
                      padding: '2px 7px', borderRadius: 5, flexShrink: 0 }}>
                      {ps.label}
                    </span>
                  )}
                  {entry.revert_at && !entry.reverted_at && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, color: '#6B7280', flexShrink: 0 }}>
                      <RotateCcw size={10} /> до {formatDateOnly(entry.revert_at)}
                    </span>
                  )}
                  {entry.reverted_at && (
                    <span style={{ fontSize: 11, color: '#9CA3AF', flexShrink: 0 }}>
                      скасовано {formatDateOnly(entry.reverted_at)}
                    </span>
                  )}
                  {entry.comment && (
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {entry.comment}
                    </span>
                  )}
                </div>

                {/* Expand toggle */}
                {hasSnapshot && (
                  <div style={{ color: 'var(--text-secondary)', flexShrink: 0 }}>
                    {isOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                  </div>
                )}
              </div>

              {/* Expanded snapshot */}
              {isOpen && hasSnapshot && (
                <div style={{ borderTop: '1px solid var(--border)', padding: '0 16px 12px' }}>
                  <div style={{ fontSize: 11, color: '#9CA3AF', padding: '8px 0 6px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {TYPE_LABEL[entry.type] ?? entry.type}
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr style={{ background: '#F8FAFC' }}>
                          <th style={{ padding: '5px 10px', textAlign: 'left', color: '#94A3B8', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>Артикул</th>
                          <th style={{ padding: '5px 10px', textAlign: 'left', color: '#94A3B8', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>Назва</th>
                          <th style={{ padding: '5px 10px', textAlign: 'right', color: '#94A3B8', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>До</th>
                          <th style={{ padding: '5px 10px', textAlign: 'right', color: '#94A3B8', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>Після</th>
                          <th style={{ padding: '5px 10px', textAlign: 'right', color: '#94A3B8', fontWeight: 600, borderBottom: '1px solid var(--border)' }}>Різниця</th>
                        </tr>
                      </thead>
                      <tbody>
                        {entry.snapshot!.slice(0, 100).map(row => {
                          const beforeVal = row.before?.[entry.target] ?? row.before?.retail ?? null;
                          const afterVal  = row.after?.[entry.target]  ?? row.after?.retail  ?? null;
                          const diff = beforeVal != null && afterVal != null ? afterVal - beforeVal : null;
                          return (
                            <tr key={row.sku} style={{ borderBottom: '1px solid var(--border)' }}>
                              <td style={{ padding: '4px 10px', fontFamily: 'monospace', color: '#6B7280' }}>{row.sku}</td>
                              <td style={{ padding: '4px 10px', color: 'var(--text-primary)' }}>{row.name}</td>
                              <td style={{ padding: '4px 10px', textAlign: 'right', color: '#6B7280' }}>{beforeVal != null ? `${beforeVal} ₴` : '—'}</td>
                              <td style={{ padding: '4px 10px', textAlign: 'right', fontWeight: 600, color: 'var(--text-primary)' }}>{afterVal != null ? `${afterVal} ₴` : '—'}</td>
                              <td style={{ padding: '4px 10px', textAlign: 'right', fontWeight: 600,
                                color: diff == null ? '#9CA3AF' : diff > 0 ? '#15803D' : diff < 0 ? '#DC2626' : '#6B7280' }}>
                                {diff == null ? '—' : diff > 0 ? `+${diff.toFixed(0)} ₴` : `${diff.toFixed(0)} ₴`}
                              </td>
                            </tr>
                          );
                        })}
                        {(entry.snapshot?.length ?? 0) > 100 && (
                          <tr>
                            <td colSpan={5} style={{ padding: '6px 10px', color: '#9CA3AF', fontStyle: 'italic' }}>
                              + ще {entry.snapshot!.length - 100} позицій
                            </td>
                          </tr>
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
    </div>
  );
}

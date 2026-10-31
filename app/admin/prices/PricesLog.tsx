'use client';

import React, { useState, useEffect } from 'react';
import { Tag, RotateCcw, TrendingUp, TrendingDown, Minus, ChevronDown, ChevronUp, Clock, X, Undo2 } from 'lucide-react';
import { showToast } from '../../../lib/toast';
import { isMpTarget } from '../../../lib/mp-reprice';

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
  set_markup:    'Націнка = N %',
  mp_revert:     'Відкат переоцінки МП',
  manual:        'Ручна правка',
  promo_cancel:  'Завершення акції',
  supplier_discount: 'Знижка постачальника',
};

const TARGET_LABEL: Record<string, string> = {
  retail:  'Роздріб',
  unit:    'Опт',
  drop:    'Дроп',
  all:     'Всі',
  rozetka: 'Rozetka',
  prom:    'Prom',
  mp:      'Prom + Rozetka',
};

// Знімок переоцінки МП: ціна фіда й товарна націнка (null = категорійна) по каналах
const MP_COLS: Record<string, { price: string; markup: string; label: string }[]> = {
  rozetka: [{ price: 'rz_price', markup: 'rz_markup', label: 'Rozetka' }],
  prom:    [{ price: 'prom_price', markup: 'prom_markup', label: 'Prom' }],
  mp:      [{ price: 'prom_price', markup: 'prom_markup', label: 'Prom' }, { price: 'rz_price', markup: 'rz_markup', label: 'Rozetka' }],
};

function mpCell(rec: Record<string, number | null> | undefined, col: { price: string; markup: string }) {
  if (!rec || (!(col.price in rec) && !(col.markup in rec))) return '—';
  const price  = rec[col.price];
  const markup = rec[col.markup];
  return `${price != null ? `${price} ₴` : '—'} · ${markup != null ? `${markup}%` : 'кат.'}`;
}

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
  const [reverting, setReverting]   = useState<number | null>(null);

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

  // Відкат переоцінки маркетплейсів: сервер повертає товарні націнки «до» зі
  // знімка (null → знову категорійна), позначає запис і пише окремий рядок
  // «Відкат». Для цін сайту такого відкату немає — там інший механізм (наценки
  // постачальника, акції з датою повернення).
  async function revertMp(entry: LogEntry) {
    const when = formatDate(entry.created_at);
    if (!confirm(`Відкотити переоцінку від ${when} (${entry.count ?? 0} товарів)?\n\nНацінки Prom/Rozetka повернуться до значень, що були до неї; фіди перерахують ціни від поточної собівартості.`)) return;
    setReverting(entry.id);
    try {
      const res = await fetch('/api/admin/prices/log', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: entry.id, action: 'revert' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? 'Помилка відкату');
      // Перечитуємо журнал: з'явився рядок відкату, а вихідний позначено
      const fresh = await fetch('/api/admin/prices/log').then(r => r.json()).catch(() => null);
      if (Array.isArray(fresh)) setEntries(fresh);
      else setEntries(prev => prev.map(e => e.id === entry.id ? { ...e, status: 'reverted', reverted_at: data.reverted_at ?? new Date().toISOString() } : e));
      const drifted = Array.isArray(data.drifted) ? data.drifted.length : 0;
      showToast(
        `Відкочено ${data.reverted ?? entry.count ?? 0} товарів` + (drifted ? ` · ${drifted} з них змінювали після переоцінки — їх теж повернуто до «до»` : ''),
        drifted ? 'warning' : 'success', drifted ? 7000 : 4000);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Помилка відкату', 'error');
    } finally {
      setReverting(null);
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
        const valStr = entry.type === 'manual' || entry.type === 'promo_cancel' || entry.type === 'mp_revert'
          ? ''
          : entry.type === 'increase_pct'
          ? (entry.value >= 0 ? `+${entry.value}%` : `${entry.value}%`)
          : entry.type === 'multiply_cost'
          ? `×${entry.value}`
          : entry.type === 'set_markup'
          ? `${entry.value}%`
          : entry.type === 'supplier_discount'
          ? `−${entry.value}%`
          : `${entry.value} ₴`;
        // Знижка постачальника зберігається додатним відсотком, але ціни від неї падають
        const isPositive = entry.type === 'supplier_discount' ? false : entry.value >= 0;
        const ps = promoStatus(entry);
        const hasSnapshot = (entry.snapshot?.length ?? 0) > 0;
        const isPending   = entry.status === 'pending';
        const isCancelled = entry.status === 'cancelled';
        const isMp        = isMpTarget(entry.target);
        const isReverted  = entry.status === 'reverted';
        const canRevert   = isMp && entry.type !== 'mp_revert' && entry.status === 'applied' && !entry.reverted_at && hasSnapshot;
        const mpCols      = isMp ? (MP_COLS[entry.target] ?? []) : [];

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
                {entry.type === 'increase_pct' || entry.type === 'supplier_discount'
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
                {isMp && (
                  <span style={{ fontSize: 11, fontWeight: 600, color: '#5B21B6', background: '#F5F3FF', border: '1px solid #DDD6FE',
                    padding: '2px 7px', borderRadius: 4, flexShrink: 0 }}>
                    {entry.type === 'mp_revert' ? 'Відкат' : entry.revert_at ? 'Тимчасова націнка МП' : 'Націнка МП'}
                  </span>
                )}
                {isReverted && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 600, color: '#6B7280', background: '#F3F4F6',
                    padding: '2px 7px', borderRadius: 4, flexShrink: 0 }}>
                    <Undo2 size={10} /> Відкочено{entry.reverted_at ? ` ${formatDateOnly(entry.reverted_at)}` : ''}
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
                  <span title={isMp ? 'Автовідкат націнок кроном у цю дату' : undefined}
                    style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, color: '#6B7280', flexShrink: 0 }}>
                    <RotateCcw size={10} /> до {formatDateOnly(entry.revert_at)}
                  </span>
                )}
                {entry.reverted_at && !isReverted && (
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
                {canRevert && (
                  <button
                    onClick={() => revertMp(entry)}
                    disabled={reverting === entry.id}
                    title="Повернути націнки Prom/Rozetka, що були до цієї переоцінки"
                    style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '3px 8px', borderRadius: 5, border: '1px solid #DDD6FE', background: '#F5F3FF', color: '#5B21B6', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                    <Undo2 size={10} /> {reverting === entry.id ? '...' : 'Відкотити'}
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
                {isMp ? (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: '#F8FAFC' }}>
                        {['Артикул', 'Назва', ...mpCols.flatMap(c => [`${c.label}: до`, `${c.label}: після`])].map((h, i) => (
                          <th key={h} style={{ padding: '5px 10px', textAlign: i < 2 ? 'left' : 'right',
                            color: '#94A3B8', fontWeight: 600, borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {entry.snapshot!.slice(0, 100).map(row => (
                        <tr key={row.sku} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '4px 10px', fontFamily: 'monospace', color: '#6B7280' }}>{row.sku}</td>
                          <td style={{ padding: '4px 10px' }}>{row.name}</td>
                          {mpCols.map(c => {
                            const bp = row.before?.[c.price] ?? null;
                            const ap = row.after?.[c.price] ?? null;
                            const color = bp != null && ap != null ? (ap > bp ? '#15803D' : ap < bp ? '#DC2626' : '#111') : '#111';
                            return (
                              <React.Fragment key={c.price}>
                                <td style={{ padding: '4px 10px', textAlign: 'right', color: '#6B7280', whiteSpace: 'nowrap' }}>{mpCell(row.before, c)}</td>
                                <td style={{ padding: '4px 10px', textAlign: 'right', fontWeight: 600, color, whiteSpace: 'nowrap' }}>{mpCell(row.after, c)}</td>
                              </React.Fragment>
                            );
                          })}
                        </tr>
                      ))}
                      {(entry.snapshot?.length ?? 0) > 100 && (
                        <tr><td colSpan={2 + mpCols.length * 2} style={{ padding: '6px 10px', color: '#9CA3AF', fontStyle: 'italic' }}>
                          + ще {entry.snapshot!.length - 100} позицій
                        </td></tr>
                      )}
                    </tbody>
                  </table>
                  <div style={{ fontSize: 11, color: '#9CA3AF', padding: '6px 0 0' }}>ціна фіда · товарна націнка («кат.» — рахувалась від націнки категорії)</div>
                </div>
                ) : (
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
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

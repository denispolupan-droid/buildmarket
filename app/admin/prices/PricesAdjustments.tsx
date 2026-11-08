'use client';

import { useState } from 'react';
import { useAdminQuery } from '../../../lib/admin/api';
import { Tag, Undo2, Clock } from 'lucide-react';
import { showToast } from '../../../lib/toast';
import { ADJ_CHANNEL_LABEL, factorLabel, lastDayOf, type AdjChannel } from '../../../lib/price-adjustments';

// Вкладка «Акції МП»: усі живі корекції цін МП (міграція 147), згруповані за
// переоцінкою, що їх створила. Кожну можна вимкнути окремо — решта лишаються,
// ціни повертаються рівно на її внесок.

type Group = {
  log_id: number | null;
  created_at: string | null;
  comment: string | null;
  type: string | null;
  value: number | null;
  target: string | null;
  is_promo: boolean;
  starts_on: string;
  ends_on: string | null;
  state: 'active' | 'scheduled';
  channels: string[];
  skus: number;
  pct_min: number;
  pct_max: number;
};

const fmtDate = (d: string) => new Date(d).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' });

function pctText(g: Group) {
  const a = factorLabel(1 + g.pct_min / 100);
  const b = factorLabel(1 + g.pct_max / 100);
  return Math.abs(g.pct_max - g.pct_min) < 0.005 ? a : `${a} … ${b}`;
}

export default function PricesAdjustments({ onChanged }: { onChanged: () => void }) {
  const query = useAdminQuery<Group[]>('/api/admin/prices/adjustments');
  const groups = query.data ? (Array.isArray(query.data) ? query.data : []) : query.error ? [] : null;
  const [busy, setBusy] = useState<number | null>(null);

  async function cancel(g: Group) {
    if (g.log_id == null) return;
    const what = `${pctText(g)} · ${g.channels.map(c => ADJ_CHANNEL_LABEL[c as AdjChannel] ?? c).join(', ')} · ${g.skus} товарів`;
    if (!confirm(`Вимкнути корекцію ${what}?\n\nЦіни Prom/Rozetka цих товарів повернуться на її внесок; наценки й інші акції лишаються.`)) return;
    setBusy(g.log_id);
    try {
      const res = await fetch('/api/admin/prices/adjustments', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel', log_id: g.log_id }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? 'Помилка');
      showToast(`Корекцію вимкнено: ${json.skus ?? g.skus} товарів`, 'success');
      onChanged();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Помилка', 'error');
    } finally {
      setBusy(null);
    }
  }

  if (groups == null) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 14 }}>Завантаження...</div>;
  }
  if (!groups.length) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.6 }}>
        Діючих акцій і тимчасових змін на маркетплейсах немає — ціни рахуються від наценки.<br />
        Акцію запускає переоцінка Prom/Rozetka з галочкою «Акція», тимчасову зміну — переоцінка з датою «Діє до».
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6, lineHeight: 1.5 }}>
        Ціна Prom/Rozetka = ціна від наценки × усі діючі акції й тимчасові зміни. Вимкнення прибирає лише внесок цієї позиції, у будь-якому порядку.
      </div>
      {groups.map(g => (
        <div key={String(g.log_id)} style={{
          display: 'grid', gridTemplateColumns: '120px 110px 1fr 160px auto', alignItems: 'center', gap: 12,
          padding: '11px 16px', borderRadius: 10, border: `1px solid ${g.state === 'scheduled' ? '#BAE6FD' : 'var(--border)'}`,
          background: g.state === 'scheduled' ? '#F0F9FF' : 'var(--bg-card)',
        }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: g.pct_max >= 0 ? 'var(--color-success)' : 'var(--color-danger)', whiteSpace: 'nowrap' }}>{pctText(g)}</div>
          <div style={{ fontSize: 12, color: 'var(--text-gray)' }}>
            {g.channels.map(c => ADJ_CHANNEL_LABEL[c as AdjChannel] ?? c).join(' + ')}
            <div style={{ fontSize: 11, color: 'var(--text-gray-light)' }}>{g.skus} товарів</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', minWidth: 0 }}>
            {g.is_promo ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 700, color: 'var(--orange)', background: 'var(--orange-bg)', border: '1px solid var(--orange-border)', padding: '2px 6px', borderRadius: 4 }}>
                <Tag size={10} /> Акція
              </span>
            ) : (
              <span style={{ fontSize: 11, fontWeight: 700, color: '#5B21B6', background: 'var(--violet-bg)', border: '1px solid #DDD6FE', padding: '2px 6px', borderRadius: 4 }}>
                Тимчасова зміна
              </span>
            )}
            {g.state === 'scheduled' && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 700, color: '#0369A1', background: '#E0F2FE', border: '1px solid #BAE6FD', padding: '2px 6px', borderRadius: 4 }}>
                <Clock size={10} /> з {fmtDate(g.starts_on)}
              </span>
            )}
            <span style={{ fontSize: 12, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {g.comment || '—'}
            </span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-gray)' }}>
            {g.created_at ? `створено ${fmtDate(g.created_at)}` : ''}
            <div style={{ fontSize: 11, color: g.ends_on ? 'var(--color-warn)' : 'var(--text-gray-light)' }}>
              {g.ends_on ? `діє до ${fmtDate(lastDayOf(g.ends_on)!)} включно` : 'без дати завершення'}
            </div>
          </div>
          <button
            onClick={() => cancel(g)}
            disabled={busy === g.log_id || g.log_id == null}
            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 6, border: '1px solid #DDD6FE', background: 'var(--violet-bg)', color: '#5B21B6', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            <Undo2 size={12} /> {busy === g.log_id ? '...' : 'Вимкнути'}
          </button>
        </div>
      ))}
    </div>
  );
}

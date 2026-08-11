'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil } from 'lucide-react';
import { showToast } from '../../../lib/toast';

// Віджет «План на місяць»: план виручки з app_settings проти факту з обліку
// + прогноз за поточним темпом. Редагування — олівець → інпут → Enter.

function fmt(n: number) {
  return n.toLocaleString('uk-UA', { maximumFractionDigits: 0 });
}

export default function PlanCard({ plan }: {
  plan: { value: number | null; fact: number; forecast: number; daysPassed: number; daysInMonth: number; monthLabel: string };
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState(plan.value != null ? String(plan.value) : '');
  const [saving, setSaving]   = useState(false);

  async function save() {
    const value = Number(draft.replace(/\s/g, ''));
    if (!Number.isFinite(value) || value < 0) { showToast('Введіть суму плану числом', 'error'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/admin/finance/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      setEditing(false);
      router.refresh();
    } catch (err) {
      showToast(`Не збережено: ${err instanceof Error ? err.message : 'помилка'}`, 'error');
    } finally {
      setSaving(false);
    }
  }

  const donePct    = plan.value ? Math.min(100, Math.round(plan.fact / plan.value * 100)) : null;
  const paceOk     = plan.value ? plan.forecast >= plan.value : null;
  const timePct    = Math.round(plan.daysPassed / plan.daysInMonth * 100);

  return (
    <div className="fin-card" style={{ gridColumn: 'span 4' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div className="fin-card-title">План на місяць <span className="fin-card-sub">· виручка · {plan.monthLabel}</span></div>
        {!editing && (
          <button onClick={() => { setDraft(plan.value != null ? String(plan.value) : ''); setEditing(true); }}
            title="Змінити план"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: '2px' }}>
            <Pencil size={13} />
          </button>
        )}
      </div>

      {editing ? (
        <div style={{ display: 'flex', gap: '8px', marginTop: '12px', alignItems: 'center' }}>
          <input
            autoFocus type="text" inputMode="numeric" value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }}
            placeholder="напр. 150000"
            style={{ flex: 1, height: '34px', padding: '0 10px', border: '1.5px solid var(--border)', borderRadius: '8px', fontSize: '14px', outline: 'none', fontVariantNumeric: 'tabular-nums' }}
          />
          <button onClick={save} disabled={saving}
            style={{ height: '34px', padding: '0 14px', borderRadius: '8px', border: 'none', background: '#1E3A5F', color: '#fff', fontSize: '13px', fontWeight: 600, cursor: saving ? 'wait' : 'pointer' }}>
            {saving ? '…' : 'Зберегти'}
          </button>
        </div>
      ) : plan.value == null ? (
        <div style={{ marginTop: '12px', fontSize: '13px', color: 'var(--text-muted)' }}>
          План не задано — натисніть олівець і введіть цільову виручку на місяць.
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '10px' }}>
            <span style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{fmt(plan.fact)} ₴</span>
            <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>з {fmt(plan.value)} ₴ · {donePct}%</span>
          </div>
          <div className="fin-funnel-track" style={{ marginTop: '8px', position: 'relative' }}>
            <div className="fin-funnel-fill" style={{ width: `${Math.max(2, donePct ?? 0)}%` }} />
            {/* риска: скільки місяця вже минуло — якщо заливка лівіше за риску, темп відстає */}
            <div title={`Минуло ${plan.daysPassed} з ${plan.daysInMonth} днів (${timePct}%)`}
              style={{ position: 'absolute', top: '-3px', bottom: '-3px', left: `${timePct}%`, width: '2px', background: 'var(--text-primary)', opacity: 0.5, borderRadius: '1px' }} />
          </div>
          <div className="fin-hint" style={{ marginTop: '9px' }}>
            Прогноз за поточним темпом: <b style={{ color: paceOk ? '#15803D' : '#DC2626' }}>{fmt(plan.forecast)} ₴</b>
            {paceOk ? ' — план виконується' : ` — не вистачає ${fmt(plan.value - plan.forecast)} ₴`}
            {' · '}минуло {plan.daysPassed}/{plan.daysInMonth} дн.
          </div>
        </>
      )}
    </div>
  );
}

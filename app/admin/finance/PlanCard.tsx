'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil } from 'lucide-react';
import { showToast } from '../../../lib/toast';
import { fmtInt as fmt } from '../../../lib/format';

// «План на місяць» — повноширинний прогрес-бар (рішення власника): факт
// виручки проти плану з app_settings, риска — скільки місяця вже минуло
// (заливка лівіше риски = темп відстає), праворуч прогноз за поточним темпом.
// Редагування — олівець → інпут → Enter.

export default function PlanCard({ plan, sales: sales0 }: {
  plan: { value: number | null; fact: number; forecast: number; daysPassed: number; daysInMonth: number; monthLabel: string };
  /** продажі місяця (створені замовлення, вкл. в роботі й у дорозі) — та сама база, що графік «План» */
  sales?: number;
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

  // Смуга (07.11.2026, без дубля з графіком «План»): виручка факт (темна) + ще в
  // роботі й у дорозі (світла) = продажі місяця; риска — де має бути темп. Праворуч —
  // нове: скільки лишилось до плану і скільки це на день проти поточного темпу.
  const sales   = Math.max(plan.fact, sales0 ?? plan.fact);
  const inFlight = Math.max(0, sales - plan.fact);
  const pctOf   = (v: number) => (plan.value ? Math.min(100, v / plan.value * 100) : 0);
  const donePct = plan.value ? Math.round(sales / plan.value * 100) : null;
  const timePct = Math.round(plan.daysPassed / plan.daysInMonth * 100);
  const daysLeft = Math.max(0, plan.daysInMonth - plan.daysPassed);
  const left     = plan.value ? Math.max(0, plan.value - sales) : 0;
  const needDay  = daysLeft > 0 ? Math.round(left / daysLeft) : left;
  const nowDay   = plan.daysPassed > 0 ? Math.round(sales / plan.daysPassed) : 0;
  const paceOk   = plan.value ? nowDay >= needDay : null;
  // «Сьогодні за планом» — скільки мало б бути продано на сьогодні при рівномірному виконанні
  const dueToday = plan.value ? Math.round(plan.value * plan.daysPassed / plan.daysInMonth) : 0;
  const paceTitle = `Рівномірний план: ${fmt(plan.value ?? 0)} ₴ ÷ ${plan.daysInMonth} дн. × ${plan.daysPassed} дн. минуло = ${fmt(dueToday)} ₴. `
    + (sales >= dueToday ? `Продано більше — випереджаємо на ${fmt(sales - dueToday)} ₴` : `Продано менше — відстаємо на ${fmt(dueToday - sales)} ₴`);

  return (
    <div className="fin-card" style={{ marginTop: '6px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '12px', flexWrap: 'wrap' }}>
        <div className="fin-card-title">План на місяць <span className="fin-card-sub">· продажі · {plan.monthLabel}</span></div>
        {!editing && plan.value != null && (
          <span style={{ display: 'flex', alignItems: 'baseline', gap: '8px', fontVariantNumeric: 'tabular-nums' }}>
            <span style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)' }}>{fmt(sales)} ₴</span>
            <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>з {fmt(plan.value)} ₴ · {donePct}%</span>
            <button onClick={() => { setDraft(String(plan.value)); setEditing(true); }} title="Змінити план"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: '2px', alignSelf: 'center' }}>
              <Pencil size={13} />
            </button>
          </span>
        )}
      </div>

      {editing ? (
        <div style={{ display: 'flex', gap: '8px', marginTop: '12px', alignItems: 'center', maxWidth: '420px' }}>
          <input
            autoFocus type="text" inputMode="numeric" value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }}
            placeholder="напр. 150000"
            style={{ flex: 1, height: '34px', padding: '0 10px', border: '1.5px solid var(--border)', borderRadius: '8px', fontSize: '14px', outline: 'none', fontVariantNumeric: 'tabular-nums' }}
          />
          <button onClick={save} disabled={saving}
            style={{ height: '34px', padding: '0 14px', borderRadius: '8px', border: 'none', background: 'var(--navy)', color: '#fff', fontSize: '13px', fontWeight: 600, cursor: saving ? 'wait' : 'pointer' }}>
            {saving ? '…' : 'Зберегти'}
          </button>
        </div>
      ) : plan.value == null ? (
        <div style={{ marginTop: '6px', fontSize: '13px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          План не задано — натисніть олівець і введіть цільову виручку на місяць.
          <button onClick={() => { setDraft(''); setEditing(true); }} title="Задати план"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: '2px' }}>
            <Pencil size={13} />
          </button>
        </div>
      ) : (
        <>
          {/* Шкала з віхами (вибір власника 07.11.2026): 25/50/75/100 %, ▲ — де має бути
              темп сьогодні; темна частина — виручка (вручено), світла — ще в роботі й у дорозі */}
          <div className="fin-plan-scale">
            <div className="fin-plan-track">
              <div title={`Виручка (вручено): ${fmt(plan.fact)} ₴`} style={{ width: `${pctOf(plan.fact)}%`, background: 'var(--brand-blue)' }} />
              <div title={`Ще в роботі й у дорозі: ${fmt(inFlight)} ₴`} style={{ width: `${pctOf(inFlight)}%`, background: 'var(--brand-blue)', opacity: 0.35 }} />
              {[25, 50, 75].map(t => <span key={t} className="fin-plan-tick" style={{ left: `${t}%` }} />)}
              <span className="fin-plan-pace" style={{ left: `${timePct}%` }} title={paceTitle} />
            </div>
            <div className="fin-plan-axis">
              {/* підписи віх, що потрапили під позначку «сьогодні», ховаємо — не налазять */}
              {[0, 25, 50, 75, 100].filter(t => Math.abs(t - timePct) > 14 || t === 0).map(t => <span key={t} style={{ left: `${t}%` }}>{t === 0 ? '0' : `${t}%`}</span>)}
              <b className="fin-plan-pace-label" title={paceTitle}
                style={{ left: `${timePct}%`, transform: timePct > 75 ? 'translateX(-100%)' : timePct < 12 ? 'none' : undefined, color: paceOk ? 'var(--color-success)' : 'var(--color-danger)' }}>
                ▲ сьогодні за планом: {fmt(dueToday)} ₴
              </b>
            </div>
          </div>
          <div className="fin-plan-stats">
            <div title={`Виручка ${fmt(plan.fact)} ₴ + ще в роботі й у дорозі ${fmt(inFlight)} ₴`}>
              <span>Зроблено</span><b>{fmt(sales)} ₴</b>
            </div>
            <div>
              <span>Лишилось</span><b>{left > 0 ? `${fmt(left)} ₴` : 'план виконано'}</b>
            </div>
            <div title={`Щоб виконати план за ${daysLeft} дн., що лишились`}>
              <span>Треба на день</span>
              <b style={{ color: left > 0 ? (paceOk ? 'var(--color-success)' : 'var(--color-danger)') : 'var(--color-success)' }}>{left > 0 ? `${fmt(needDay)} ₴` : '—'}</b>
              <em>зараз {fmt(nowDay)} ₴</em>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

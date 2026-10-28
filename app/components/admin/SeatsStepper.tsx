'use client';

import { useMemo, useState } from 'react';
import { Minus, Plus } from 'lucide-react';

/**
 * «Місць»: − число +. Спільне для вікон накладних НП і Rozetka.
 * Число можна ввести руками й міняти стрілками ↑/↓; рядки місць підлаштовуються одразу.
 */
export const MAX_SEATS = 20;

/** Вага порівну на n місць (до грама, залишок — першому) */
export function splitWeight(total: number, n: number): string[] {
  const each = Math.floor((total / n) * 1000) / 1000;
  const first = Number((total - each * (n - 1)).toFixed(3));
  return Array.from({ length: n }, (_, i) => String(i === 0 ? first : each));
}

/** «2 однакових місця», «5 однакових місць» */
export function sameSeatsLabel(n: number): string {
  const d = n % 10, dd = n % 100;
  const word = d === 1 && dd !== 11 ? 'однакове місце' : d >= 2 && d <= 4 && (dd < 12 || dd > 14) ? 'однакових місця' : 'однакових місць';
  return `${n} ${word}`;
}

type SeatsState<R> = { rows: R[]; count: number; same: boolean; auto: number | null; edited: boolean };

/**
 * Місця накладної. Частіше вони однакові (два відра — два місця однієї ваги й
 * розміру), тож за замовчуванням «однакові»: один рядок = кожне місце, вага в
 * ньому — на одне місце. Зняли галочку — рядок на кожне місце, спершу копії.
 *
 * Вага з карток товарів (setAutoWeight) ділиться між місцями, поки менеджер
 * не правив вагу руками.
 */
function applyAuto<R extends { weight: string }>(st: SeatsState<R>): SeatsState<R> {
  if (st.edited || st.auto == null) return st;
  if (st.same) {
    return { ...st, rows: [{ ...st.rows[0], weight: String(Number((st.auto / st.count).toFixed(3))) }, ...st.rows.slice(1)] };
  }
  const w = splitWeight(st.auto, st.rows.length);
  return { ...st, rows: st.rows.map((r, i) => ({ ...r, weight: w[i] })) };
}

export function useSeats<R extends { weight: string }>(initial: R) {
  const [s, setS] = useState<SeatsState<R>>({ rows: [initial], count: 1, same: true, auto: null, edited: false });

  // Дії стабільні між рендерами — їх можна класти в залежності ефектів
  const actions = useMemo(() => ({
    setCount: (n: number) => setS(st => {
      const count = Math.min(MAX_SEATS, Math.max(1, Math.floor(n) || 1));
      if (count === st.count) return st;
      if (st.same) return applyAuto({ ...st, count });
      const last = st.rows[st.rows.length - 1];
      const rows = count < st.rows.length
        ? st.rows.slice(0, count)
        : [...st.rows, ...Array.from({ length: count - st.rows.length }, () => ({ ...last, weight: '' }))];
      return applyAuto({ ...st, count, rows });
    }),
    setSame: (same: boolean) => setS(st => {
      if (same === st.same) return st;
      const rows = same ? [st.rows[0]] : Array.from({ length: st.count }, () => ({ ...st.rows[0] }));
      return applyAuto({ ...st, same, rows });
    }),
    setField: (i: number, key: keyof R, v: string) => setS(st => ({
      ...st,
      edited: key === 'weight' ? true : st.edited,
      rows: st.rows.map((r, j) => (j === i ? { ...r, [key]: v } : r)),
    })),
    remove: (i: number) => setS(st => {
      if (st.same || st.rows.length <= 1) return st;
      const rows = st.rows.filter((_, j) => j !== i);
      return applyAuto({ ...st, rows, count: rows.length });
    }),
    setAutoWeight: (total: number) => setS(st => applyAuto({ ...st, auto: total })),
  }), []);

  return {
    count: s.count,
    same: s.same,
    /** Що піде в накладну: по рядку на кожне місце */
    seats: s.same ? Array.from({ length: s.count }, () => s.rows[0]) : s.rows,
    /** Що показувати для введення: однакові — один рядок */
    editRows: s.same ? [s.rows[0]] : s.rows,
    ...actions,
  };
}

/** Галочка «Однакові місця» — однаково в обох вікнах */
export function SameSeatsToggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', color: 'var(--text-secondary)', cursor: 'pointer', userSelect: 'none' }}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} style={{ margin: 0, cursor: 'pointer' }} />
      Однакові місця
    </label>
  );
}

export default function SeatsStepper({ value, onChange, style }: {
  value: number;
  onChange: (n: number) => void;
  /** Рамка поля — щоб збігалась з іншими полями свого вікна */
  style?: React.CSSProperties;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const set = (n: number) => { setDraft(null); onChange(Math.min(MAX_SEATS, Math.max(1, Math.floor(n) || 1))); };
  const btn = (disabled: boolean): React.CSSProperties => ({
    width: '30px', height: '100%', flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    background: 'none', border: 'none', padding: 0, color: 'var(--text-secondary)',
    opacity: disabled ? 0.35 : 1, cursor: disabled ? 'default' : 'pointer',
  });
  return (
    <div style={{ display: 'flex', alignItems: 'center', padding: 0, overflow: 'hidden', boxSizing: 'border-box', ...style }}>
      <button type="button" aria-label="Менше місць" disabled={value <= 1} onClick={() => set(value - 1)} style={btn(value <= 1)}>
        <Minus size={14} />
      </button>
      <input value={draft ?? String(value)} inputMode="numeric" aria-label="Кількість місць"
        onChange={e => {
          const v = e.target.value.replace(/\D/g, '');
          setDraft(v);
          if (v) onChange(Math.min(MAX_SEATS, Math.max(1, Number(v))));
        }}
        onBlur={() => setDraft(null)}
        onKeyDown={e => {
          if (e.key === 'ArrowUp') { e.preventDefault(); set(value + 1); }
          if (e.key === 'ArrowDown') { e.preventDefault(); set(value - 1); }
        }}
        style={{ width: 0, flex: 1, minWidth: 0, height: '100%', border: 'none', outline: 'none', background: 'transparent', color: 'var(--text-primary)', fontSize: '13.5px', textAlign: 'center', fontVariantNumeric: 'tabular-nums', padding: 0 }} />
      <button type="button" aria-label="Більше місць" disabled={value >= MAX_SEATS} onClick={() => set(value + 1)} style={btn(value >= MAX_SEATS)}>
        <Plus size={14} />
      </button>
    </div>
  );
}

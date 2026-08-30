'use client';

import type { CSSProperties } from 'react';

type Props = {
  values: string[];
  multi: boolean;
  value: string;
  onChange: (v: string) => void;
  style?: CSSProperties;
};

const SEP = '; ';

/**
 * Значення фасета (закритий список зі словника): одиночний — select, перелік —
 * перемикачі-чипи, що збираються в рядок через «; » (як зберігає normalizeChars).
 * Значення поза списком (legacy) показуємо як є, щоб не загубити при збереженні.
 */
export default function FacetValueInput({ values, multi, value, onChange, style }: Props) {
  if (!multi) {
    const known = values.some(v => v.toLowerCase() === value.trim().toLowerCase());
    return (
      <select value={value} onChange={e => onChange(e.target.value)} style={style}>
        <option value="">— не вказано —</option>
        {!known && value.trim() && <option value={value}>{value} (поза довідником)</option>}
        {values.map(v => <option key={v} value={v}>{v}</option>)}
      </select>
    );
  }

  const chosen = value.split(';').map(s => s.trim()).filter(Boolean);
  const chosenLower = new Set(chosen.map(s => s.toLowerCase()));
  const unknown = chosen.filter(c => !values.some(v => v.toLowerCase() === c.toLowerCase()));
  const toggle = (v: string) => {
    const next = chosenLower.has(v.toLowerCase())
      ? chosen.filter(c => c.toLowerCase() !== v.toLowerCase())
      : [...chosen, v];
    // порядок — як у довіднику, невідомі — в кінці
    onChange([...values.filter(x => next.some(n => n.toLowerCase() === x.toLowerCase())), ...unknown.filter(u => next.includes(u))].join(SEP));
  };
  return (
    <div style={{ ...style, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', height: 'auto', minHeight: 44, padding: '6px 10px' }}>
      {values.map(v => {
        const on = chosenLower.has(v.toLowerCase());
        return (
          <button
            key={v}
            type="button"
            onClick={() => toggle(v)}
            style={{
              fontSize: 12, padding: '3px 10px', borderRadius: 999, cursor: 'pointer',
              border: on ? '1px solid var(--brand-blue)' : '1px solid var(--border)',
              background: on ? 'var(--brand-blue)' : 'var(--bg-soft)',
              color: on ? '#fff' : 'var(--text-primary)', fontWeight: on ? 600 : 400,
            }}
          >
            {v}
          </button>
        );
      })}
      {unknown.map(u => (
        <span key={u} title="поза довідником" style={{ fontSize: 12, padding: '3px 10px', borderRadius: 999, border: '1px dashed #F59E0B', color: '#B45309' }}>
          {u} ×
          <button type="button" onClick={() => toggle(u)} style={{ marginLeft: 4, border: 'none', background: 'none', cursor: 'pointer', color: '#B45309' }} aria-label={`прибрати ${u}`}>✕</button>
        </span>
      ))}
    </div>
  );
}

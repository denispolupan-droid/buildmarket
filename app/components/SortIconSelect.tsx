'use client';

import { ArrowDownUp } from 'lucide-react';

/**
 * Сортування квадратною іконкою (телефон) — як «⇅» у журналі замовлень:
 * прозорий нативний <select> поверх іконки, тож список варіантів — системний.
 * Коли обрано не «за замовчуванням», кнопка підсвічується. Видимість (лише
 * телефон) задає батько через className.
 */
export default function SortIconSelect<V extends string>({
  value, defaultValue, options, onChange, label, className,
}: {
  value: V;
  defaultValue: V;
  options: { value: V; label: string }[];
  onChange: (v: V) => void;
  label: string;
  className?: string;
}) {
  const active = value !== defaultValue;
  const current = options.find(o => o.value === value)?.label ?? '';
  return (
    <label
      className={className}
      title={`${label}: ${current}`}
      style={{
        position: 'relative', width: '34px', height: '34px', flexShrink: 0, boxSizing: 'border-box',
        alignItems: 'center', justifyContent: 'center', borderRadius: '8px', cursor: 'pointer',
        border: `1px solid ${active ? '#4880B8' : 'var(--border)'}`,
        background: active ? 'var(--brand-blue-light)' : 'var(--bg-soft)',
        color: active ? '#1E3A5F' : 'var(--text-secondary)',
      }}
    >
      <ArrowDownUp size={15} strokeWidth={2} aria-hidden />
      <select
        value={value}
        onChange={e => onChange(e.target.value as V)}
        aria-label={label}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer', fontSize: '16px' }}
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

'use client';

import { useState, useEffect } from 'react';

export function parseSmartDate(raw: string): string | null {
  const s = raw.trim();
  if (!s) return '';

  // дд.мм.рр або дд.мм.рррр (також - та / як роздільники)
  const withYear = s.match(/^(\d{1,2})[.\-\/](\d{1,2})[.\-\/](\d{2,4})$/);
  if (withYear) {
    const day   = parseInt(withYear[1], 10);
    const month = parseInt(withYear[2], 10);
    const rawY  = parseInt(withYear[3], 10);
    const year  = withYear[3].length <= 2 ? 2000 + rawY : rawY;
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  // дд.мм без року → поточний рік
  const noYear = s.match(/^(\d{1,2})[.\-\/](\d{1,2})$/);
  if (noYear) {
    const day   = parseInt(noYear[1], 10);
    const month = parseInt(noYear[2], 10);
    const year  = new Date().getFullYear();
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  // вже ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return null;
}

export function isoToDisplay(iso: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

function autoFormat(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}.${d.slice(2)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 4)}.${d.slice(4)}`;
}

export default function SmartDateInput({
  value,
  onChange,
  placeholder = 'дд.мм.рр',
  style,
}: {
  value: string;
  onChange: (isoDate: string) => void;
  placeholder?: string;
  style?: React.CSSProperties;
}) {
  const [display, setDisplay] = useState(isoToDisplay(value));
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    setDisplay(isoToDisplay(value));
    setInvalid(false);
  }, [value]);

  function commit(raw: string) {
    if (!raw.trim()) { onChange(''); setInvalid(false); return; }
    const parsed = parseSmartDate(raw);
    if (parsed !== null) {
      onChange(parsed);
      setDisplay(isoToDisplay(parsed));
      setInvalid(false);
    } else {
      setInvalid(true);
    }
  }

  return (
    <input
      type="text"
      value={display}
      placeholder={placeholder}
      onChange={e => {
        setDisplay(autoFormat(e.target.value));
        setInvalid(false);
      }}
      onBlur={e => commit(e.target.value)}
      onKeyDown={e => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commit(display);
          (e.target as HTMLInputElement).blur();
        }
      }}
      title="Формат: дд.мм.рр або дд.мм.рррр"
      style={{
        border: `1px solid ${invalid ? '#DC2626' : '#E2E8F0'}`,
        borderRadius: '6px',
        padding: '0 8px',
        fontSize: '13px',
        outline: 'none',
        background: 'var(--bg-card)',
        color: 'var(--text-primary)',
        width: '100px',
        ...style,
      }}
    />
  );
}

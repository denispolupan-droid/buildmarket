'use client';

import { useState, useEffect, useRef } from 'react';

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

  // лише день («05») → поточний місяць і рік
  const dayOnly = s.match(/^(\d{1,2})\.?$/);
  if (dayOnly) {
    const day = parseInt(dayOnly[1], 10);
    if (day < 1 || day > 31) return null;
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  // дд.мм без року → поточний рік
  const noYear = s.match(/^(\d{1,2})[.\-\/](\d{1,2})\.?$/);
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
  withPicker = false,
}: {
  value: string;
  onChange: (isoDate: string) => void;
  placeholder?: string;
  style?: React.CSSProperties;
  /** Поруч із полем — кнопка-календар, що відкриває системний вибір дати */
  withPicker?: boolean;
}) {
  const [display, setDisplay] = useState(isoToDisplay(value));
  const [invalid, setInvalid] = useState(false);
  const pickerRef = useRef<HTMLInputElement>(null);

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

  const input = (
    <input
      type="text"
      value={display}
      placeholder={placeholder}
      onChange={e => {
        setDisplay(autoFormat(e.target.value));
        setInvalid(false);
      }}
      // Курсор — на початок, на день: дату вводять зліва направо, а клік у
      // поле ставив курсор у кінець і перші цифри дописувались до року.
      onFocus={e => {
        const el = e.currentTarget;
        requestAnimationFrame(() => { try { el.setSelectionRange(0, 0); } catch {} });
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

  if (!withPicker) return input;

  // Системний календар: прихований input[type=date] відкривається кнопкою
  // (showPicker), вибір одразу комітиться як ISO-дата.
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
      {input}
      <button
        type="button"
        tabIndex={-1}
        aria-label="Вибрати дату з календаря"
        title="Календар"
        onClick={() => {
          const p = pickerRef.current;
          if (!p) return;
          try { (p as HTMLInputElement & { showPicker?: () => void }).showPicker?.(); } catch { p.focus(); p.click(); }
        }}
        style={{ width: '26px', height: '26px', border: 'none', borderRadius: '999px', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
      </button>
      <input
        ref={pickerRef}
        type="date"
        value={value || ''}
        onChange={e => { if (e.target.value) { onChange(e.target.value); setInvalid(false); } }}
        tabIndex={-1}
        aria-hidden="true"
        style={{ position: 'absolute', width: '1px', height: '1px', opacity: 0, pointerEvents: 'none' }}
      />
    </span>
  );
}

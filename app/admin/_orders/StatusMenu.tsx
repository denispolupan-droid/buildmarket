'use client';

import { useEffect, useRef } from 'react';
import { Check } from 'lucide-react';
import { STATUSES } from './constants';

type Status = (typeof STATUSES)[number];

/**
 * Ручна зміна статусу: випадний список одразу під плашкою статусу —
 * один клік відкрити, другий вибрати (раніше «...» відкривало ще й <select>,
 * який треба було розкривати окремо). Закривається кліком поза ним або Esc.
 */
export function StatusMenu({ current, options, locked, onPick, onClose }: {
  current: string;
  options: Status[];
  locked: boolean;
  onPick: (value: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const box = ref.current?.parentElement; // плашка статусу разом із кнопкою «...»
      if (box && !box.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <div ref={ref} role="menu"
      style={{ position: 'absolute', top: 'calc(100% + 4px)', right: 0, zIndex: 40, width: '186px', padding: '4px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '9px', boxShadow: '0 8px 24px rgba(15,23,42,0.14)' }}>
      <div style={{ padding: '4px 8px 5px', fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        Змінити вручну{locked && <span style={{ marginLeft: '4px', color: '#F59E0B' }}>🔒</span>}
      </div>
      {options.map(s => {
        const isCurrent = s.value === current;
        const danger = s.value === 'cancelled';
        return (
          <button key={s.value} type="button" role="menuitem"
            onClick={() => { onClose(); if (!isCurrent) onPick(s.value); }}
            onMouseEnter={e => { if (!isCurrent) e.currentTarget.style.background = 'var(--bg-soft)'; }}
            onMouseLeave={e => { if (!isCurrent) e.currentTarget.style.background = 'none'; }}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '6px 8px', border: 'none', borderRadius: '6px', background: isCurrent ? s.bg : 'none', cursor: isCurrent ? 'default' : 'pointer', textAlign: 'left', fontSize: '13px', fontWeight: isCurrent || danger ? 700 : 500, color: danger ? 'var(--color-danger)' : 'var(--text-primary)' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: s.color, flexShrink: 0 }} />
            <span style={{ flex: 1 }}>{s.label}</span>
            {isCurrent && <Check size={14} style={{ color: s.color }} />}
          </button>
        );
      })}
    </div>
  );
}

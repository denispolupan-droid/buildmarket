'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { RefreshCw } from 'lucide-react';

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Швидкі періоди — від сьогоднішньої дати за місцевим часом (облік веде дати по Києву). */
function presets(): { label: string; from: string; to: string }[] {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  const q = Math.floor(m / 3) * 3;
  return [
    { label: 'Цей місяць',     from: iso(new Date(y, m, 1)),     to: iso(now) },
    { label: 'Минулий місяць', from: iso(new Date(y, m - 1, 1)), to: iso(new Date(y, m, 0)) },
    { label: 'Квартал',        from: iso(new Date(y, q, 1)),     to: iso(now) },
    { label: 'Рік',            from: iso(new Date(y, 0, 1)),     to: iso(now) },
    { label: 'Весь час',       from: '2024-01-01',               to: iso(now) },
  ];
}

export default function PeriodBar({ dateFrom, dateTo }: { dateFrom: string; dateTo: string }) {
  const router = useRouter();
  const sp = useSearchParams();
  const [from, setFrom] = useState(dateFrom);
  const [to, setTo]     = useState(dateTo);
  useEffect(() => { setFrom(dateFrom); setTo(dateTo); }, [dateFrom, dateTo]);

  function go(f: string, t: string) {
    const qs = new URLSearchParams(sp.toString());
    qs.set('from', f);
    qs.set('to', t);
    router.push(`/admin/finance/mutual?${qs}`);
  }

  const inp: React.CSSProperties = {
    height: '34px', padding: '0 10px', border: '1.5px solid var(--border)', borderRadius: '8px',
    fontSize: '13px', outline: 'none', color: 'var(--text-primary)', background: 'var(--bg-soft)',
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
      <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Період</span>
      <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={inp} aria-label="Початок періоду" />
      <span style={{ color: 'var(--text-muted)' }}>—</span>
      <input type="date" value={to} onChange={e => setTo(e.target.value)} style={inp} aria-label="Кінець періоду" />
      <button type="button" onClick={() => go(from, to)} disabled={!from || !to || from > to}
        style={{ height: '34px', padding: '0 14px', borderRadius: '8px', border: 'none', background: '#1E3A5F', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
        <RefreshCw size={13} /> Показати
      </button>
      <span style={{ width: '1px', height: '20px', background: 'var(--border)', margin: '0 4px' }} />
      {presets().map(p => (
        <button key={p.label} type="button" onClick={() => go(p.from, p.to)}
          className={'fin-pill' + (p.from === dateFrom && p.to === dateTo ? ' active' : '')}
          style={{ cursor: 'pointer', height: '28px', padding: '0 11px', fontSize: '12px' }}>
          {p.label}
        </button>
      ))}
    </div>
  );
}

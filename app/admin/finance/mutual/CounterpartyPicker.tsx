'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import type { CounterpartyOption } from '../../../api/admin/finance/counterparties/route';

function fmt(n: number) {
  return n.toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Вибір контрагента: пошук по клієнтах і партнерах (ім'я в будь-якому написанні,
 * телефон, компанія), постачальниках і службових дебіторах. Порожнє поле —
 * усі, з ким є ненульове сальдо, найбільші зверху.
 */
export default function CounterpartyPicker({
  value, dateFrom, dateTo,
}: {
  value: { ref: string; label: string } | null;
  dateFrom: string;
  dateTo: string;
}) {
  const router = useRouter();
  const [input, setInput]     = useState(value?.label ?? '');
  const [open, setOpen]       = useState(false);
  const [options, setOptions] = useState<CounterpartyOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const reqId  = useRef(0);

  useEffect(() => { setInput(value?.label ?? ''); }, [value?.ref, value?.label]);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  // Поки поле показує обраного контрагента — шукаємо «все», а не його назву
  const query = value && input === value.label ? '' : input.trim();

  useEffect(() => {
    if (!open) return;
    const id = ++reqId.current;
    const t = setTimeout(() => {
      setLoading(true);
      fetch(`/api/admin/finance/counterparties?q=${encodeURIComponent(query)}`)
        .then(r => r.json())
        .then((d: { options?: CounterpartyOption[]; error?: string }) => {
          if (id !== reqId.current) return; // відповідь на застарілий запит
          setOptions(d.options ?? []);
          setError(d.error ?? null);
        })
        .catch(() => { if (id === reqId.current) setError('Не вдалося завантажити список'); })
        .finally(() => { if (id === reqId.current) setLoading(false); });
    }, query ? 250 : 0);
    return () => clearTimeout(t);
  }, [open, query]);

  function choose(o: CounterpartyOption) {
    setOpen(false);
    setInput(o.label);
    const qs = new URLSearchParams({ cp: o.ref, from: dateFrom, to: dateTo });
    router.push(`/admin/finance/mutual?${qs}`);
  }

  return (
    <div ref={boxRef} className="fin-card" style={{ padding: '10px 16px', position: 'relative' }}>
      <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '6px' }}>
        Контрагент
      </label>
      <div style={{ position: 'relative' }}>
        <Search size={15} style={{ position: 'absolute', left: '11px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
        <input
          value={input}
          onChange={e => { setInput(e.target.value); setOpen(true); }}
          onFocus={e => { setOpen(true); e.currentTarget.select(); }}
          onKeyDown={e => {
            if (e.key === 'Escape') setOpen(false);
            if (e.key === 'Enter' && options[0]) { e.preventDefault(); choose(options[0]); }
          }}
          placeholder="Ім'я, компанія, телефон, постачальник…"
          style={{
            width: '100%', height: '38px', padding: '0 12px 0 34px', boxSizing: 'border-box',
            border: '1.5px solid var(--border)', borderRadius: '8px',
            fontSize: '14px', outline: 'none', color: 'var(--text-primary)', background: 'var(--bg-soft)',
          }}
        />
      </div>

      {open && (
        <div style={{
          position: 'absolute', left: '18px', right: '18px', top: 'calc(100% - 6px)', zIndex: 40,
          maxHeight: '380px', overflowY: 'auto',
          background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '10px',
          boxShadow: '0 10px 30px rgba(15,23,42,0.12)', padding: '4px',
        }}>
          {!query && (
            <div style={{ padding: '6px 10px', fontSize: '11px', color: 'var(--text-muted)' }}>
              З ненульовим сальдо — почніть вводити, щоб знайти будь-кого
            </div>
          )}
          {error && <div style={{ padding: '10px', fontSize: '13px', color: '#DC2626' }}>{error}</div>}
          {!error && !loading && options.length === 0 && (
            <div style={{ padding: '10px', fontSize: '13px', color: 'var(--text-muted)' }}>
              {query.length === 1 ? 'Введіть ще хоча б одну літеру' : 'Нічого не знайдено'}
            </div>
          )}
          {options.map(o => {
            const color = Math.abs(o.balance) < 0.005 ? 'var(--text-muted)' : o.balance > 0 ? '#15803D' : '#B45309';
            return (
              <button key={o.ref} type="button" onClick={() => choose(o)}
                style={{
                  display: 'flex', width: '100%', alignItems: 'center', gap: '12px', textAlign: 'left',
                  padding: '8px 10px', border: 'none', borderRadius: '7px', cursor: 'pointer',
                  background: o.ref === value?.ref ? 'var(--bg-soft)' : 'transparent',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-soft)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = o.ref === value?.ref ? 'var(--bg-soft)' : 'transparent'; }}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.label}</span>
                  {o.sub && <span style={{ display: 'block', fontSize: '11.5px', color: 'var(--text-muted)' }}>{o.sub}</span>}
                </span>
                <span style={{ fontSize: '12.5px', fontWeight: 700, color, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}
                  title={o.balance > 0 ? 'борг контрагента' : o.balance < 0 ? 'наш борг' : 'розрахунки закриті'}>
                  {Math.abs(o.balance) < 0.005 ? '0,00' : `${o.balance > 0 ? '+' : '−'}${fmt(Math.abs(o.balance))}`} ₴
                </span>
              </button>
            );
          })}
          {loading && <div style={{ padding: '8px 10px', fontSize: '12px', color: 'var(--text-muted)' }}>Пошук…</div>}
        </div>
      )}
    </div>
  );
}

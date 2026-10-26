'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { saldoWords } from '../../../../lib/accounting/mutual-settlements';

export type JournalItem = {
  href: string;
  name: string;
  sub: string | null;
  opening: number;
  debit: number;
  credit: number;
  closing: number;
};

function fmt(n: number) {
  return n.toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Сальдо зі знаком; хто кому винен — підказкою (для площадок мінус — «отримано наперед»). */
function Saldo({ v, special }: { v: number; special: boolean }) {
  if (Math.abs(v) < 0.005) return <span style={{ color: 'var(--text-muted)' }}>—</span>;
  return (
    <span style={{ color: v > 0 ? '#15803D' : '#B45309' }} title={saldoWords(v, special).text}>
      {v > 0 ? '' : '−'}{fmt(Math.abs(v))}
    </span>
  );
}

/** Журнал контрагентів групи за період: клік по рядку — розгорнутий рух. */
export default function JournalTable({ items, emptyText, special = false }: { items: JournalItem[]; emptyText: string; special?: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? items.filter(i => `${i.name} ${i.sub ?? ''}`.toLowerCase().includes(s)) : items;
  }, [items, q]);

  const total = shown.reduce(
    (t, i) => ({ opening: t.opening + i.opening, debit: t.debit + i.debit, credit: t.credit + i.credit, closing: t.closing + i.closing }),
    { opening: 0, debit: 0, credit: 0, closing: 0 },
  );

  const th: React.CSSProperties = { padding: '10px 12px', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'right', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border)' };
  const td: React.CSSProperties = { padding: '9px 12px', fontSize: '13px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border-light, var(--border))' };

  return (
    <div className="fin-card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', position: 'relative' }}>
        <Search size={14} style={{ position: 'absolute', left: '25px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Фільтр за назвою чи телефоном…"
          style={{ width: '100%', maxWidth: '360px', height: '34px', padding: '0 10px 0 32px', boxSizing: 'border-box', border: '1.5px solid var(--border)', borderRadius: '8px', fontSize: '13px', outline: 'none', color: 'var(--text-primary)', background: 'var(--bg-soft)' }} />
        <span style={{ marginLeft: '12px', fontSize: '12px', color: 'var(--text-muted)' }}>{shown.length} контрагент.</span>
      </div>
      {shown.length === 0 ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '14px' }}>{emptyText}</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '720px' }}>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: 'left' }}>Контрагент</th>
                <th style={th}>Сальдо на початок</th>
                <th style={th} title="Що ми віддали контрагенту: товар, гроші">Розхід</th>
                <th style={th} title="Що отримали від контрагента: гроші, товар">Прихід</th>
                <th style={th}>Сальдо на кінець</th>
              </tr>
            </thead>
            <tbody>
              {shown.map(i => (
                <tr key={i.href} className="mutual-row" onClick={() => router.push(i.href)} style={{ cursor: 'pointer' }}>
                  <td style={{ ...td, textAlign: 'left', whiteSpace: 'normal' }}>
                    <Link href={i.href} style={{ color: 'var(--text-primary)', fontWeight: 600, textDecoration: 'none' }}>{i.name}</Link>
                    {i.sub && <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>{i.sub}</div>}
                  </td>
                  <td style={td}><Saldo v={i.opening} special={special} /></td>
                  <td style={td}>{i.debit > 0.005 ? fmt(i.debit) : ''}</td>
                  <td style={td}>{i.credit > 0.005 ? fmt(i.credit) : ''}</td>
                  <td style={{ ...td, fontWeight: 700 }}><Saldo v={i.closing} special={special} /></td>
                </tr>
              ))}
              <tr>
                <td style={{ ...td, textAlign: 'left', fontWeight: 700, borderBottom: 'none' }}>Разом</td>
                <td style={{ ...td, fontWeight: 700, borderBottom: 'none' }}><Saldo v={total.opening} special={special} /></td>
                <td style={{ ...td, fontWeight: 700, borderBottom: 'none' }}>{fmt(total.debit)}</td>
                <td style={{ ...td, fontWeight: 700, borderBottom: 'none' }}>{fmt(total.credit)}</td>
                <td style={{ ...td, fontWeight: 700, borderBottom: 'none' }}><Saldo v={total.closing} special={special} /></td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
      <style>{`.mutual-row:hover td { background: var(--bg-soft); }`}</style>
    </div>
  );
}

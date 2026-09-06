'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';

export type MonoRow = {
  id: string; txn_time: string; amount: number; direction: 'in' | 'out';
  comment: string | null; description: string | null; counter_name: string | null;
  status: 'matched' | 'unmatched' | 'acquiring' | 'posted' | 'ignored';
  category: string | null; note: string | null; matched_order_id: string | null;
};
export type SupplierOpt = { id: string; name: string };

const fmt = (n: number) => n.toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dmy = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;

const OUT_CATEGORIES: { value: string; label: string }[] = [
  { value: 'supplier',         label: 'Оплата постачальнику' },
  { value: 'transfer:novapay', label: '→ Переказ на NovaPay' },
  { value: 'transfer:cash',    label: '→ Зняття готівки в касу' },
  { value: 'owner',            label: 'Вилучення власника (не витрата)' },
  { value: 'taxes',            label: 'Податки / ЄСВ' },
  { value: 'logistics',        label: 'Витрата · логістика' },
  { value: 'packaging',        label: 'Витрата · пакування' },
  { value: 'marketing',        label: 'Витрата · маркетинг' },
  { value: 'rent',             label: 'Витрата · оренда' },
  { value: 'salary',           label: 'Витрата · зарплата / підрядники' },
  { value: 'opex',             label: 'Витрата · інше (opex)' },
  { value: 'ignore',           label: 'Ігнорувати (не наш рух)' },
];
const IN_CATEGORIES: { value: string; label: string }[] = [
  { value: 'transfer-in:novapay', label: '← Переказ з NovaPay' },
  { value: 'transfer-in:cash',    label: '← Внесення готівки' },
  { value: 'ignore',              label: 'Ігнорувати (не наш рух)' },
];
const STATUS_LABEL: Record<MonoRow['status'], string> = { matched: 'зараховано', unmatched: 'на категоризацію', acquiring: 'еквайринг', posted: 'проведено', ignored: 'ігнор' };

export default function MonoTxnsClient({ rows, suppliers, ledgerBank, liveBank }: { rows: MonoRow[]; suppliers: SupplierOpt[]; ledgerBank: number; liveBank: number | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [desc, setDesc] = useState<Record<string, string>>({});
  const [supplier, setSupplier] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<'todo' | 'all'>('todo');

  const todo = useMemo(() => rows.filter(r => r.status === 'unmatched'), [rows]);
  const shown = filter === 'todo' ? todo : rows;
  const todoOut = todo.filter(r => r.direction === 'out').reduce((s, r) => s + Number(r.amount), 0);
  const todoIn  = todo.filter(r => r.direction === 'in').reduce((s, r) => s + Number(r.amount), 0);

  async function refresh() {
    setBusy('refresh'); setMsg(null);
    try {
      const res = await fetch('/api/admin/finance/mono', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'refresh' }) });
      const d = await res.json();
      if (!res.ok) { setMsg(`Помилка: ${d.error}`); return; }
      setMsg(`Виписка ${d.from}…${d.to}: ${d.total} операцій — зараховано ${d.matched}, виплат RozetkaPay ${d.payouts}, еквайринг ${d.acquiring}, списань ${d.debits}, на сверку ${d.unmatched}${d.acquiringPosted ? `, проведено покриттів ${d.acquiringPosted}` : ''}`);
      router.refresh();
    } catch { setMsg('Помилка запиту'); } finally { setBusy(null); }
  }

  async function post(row: MonoRow) {
    const category = choice[row.id];
    if (!category) return;
    setBusy(row.id); setMsg(null);
    try {
      const res = await fetch('/api/admin/finance/mono', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: row.id, category, description: desc[row.id], supplierId: supplier[row.id] ?? suppliers[0]?.id }) });
      const d = await res.json();
      if (!res.ok) { setMsg(`Помилка: ${d.error}`); return; }
      router.refresh();
    } catch { setMsg('Помилка запиту'); } finally { setBusy(null); }
  }

  const cell: React.CSSProperties = { fontSize: '12.5px', padding: '8px 10px', borderBottom: '1px solid var(--border-light)', verticalAlign: 'top' };
  const inp: React.CSSProperties = { height: '30px', padding: '0 8px', border: '1.5px solid var(--border)', borderRadius: '6px', fontSize: '12px', background: 'var(--bg-soft)', color: 'var(--text-primary)', outline: 'none' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div className="fin-grid-12">
        <div className="fin-card" style={{ gridColumn: 'span 5' }}>
          <div className="fin-kpi-label">Рахунок Mono</div>
          <div className="fin-money-val">{liveBank !== null ? fmt(liveBank) : fmt(ledgerBank)} ₴</div>
          <div className="fin-money-sub">{liveBank !== null ? `живий · за обліком ${fmt(ledgerBank)} ₴` : 'за обліком'}
            {liveBank !== null && Math.abs(liveBank - ledgerBank) > 0.01 && (
              <div style={{ color: '#B45309', fontWeight: 600, marginTop: '2px' }}>облік ≠ живий на {fmt(ledgerBank - liveBank)} ₴ — на категоризацію: списань {fmt(todoOut)} ₴, надходжень {fmt(todoIn)} ₴</div>
            )}
          </div>
        </div>
        <div className="fin-card" style={{ gridColumn: 'span 7', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div className="fin-kpi-label">Виписка Mono</div>
          <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>
            операцій {rows.length} · на категоризацію <b style={{ color: todo.length ? '#B45309' : '#15803D' }}>{todo.length}</b>
          </div>
          <button onClick={refresh} disabled={busy === 'refresh'}
            style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: '6px', height: '32px', padding: '0 12px', border: '1px solid var(--border)', borderRadius: '7px', background: 'var(--bg-soft)', color: 'var(--text-primary)', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
            <RefreshCw size={12} style={busy === 'refresh' ? { animation: 'spin 1s linear infinite' } : undefined} /> {busy === 'refresh' ? 'Тягнемо…' : 'Оновити виписку (7 днів)'}
          </button>
          <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>Надходження за замовленнями, виплати RozetkaPay і покриття еквайрингу проводяться самі (вебхук + крон). Тут — списання і незіставлені надходження.</div>
        </div>
      </div>

      {msg && <div className="fin-card" style={{ fontSize: '12.5px', color: msg.startsWith('Помилка') ? '#DC2626' : '#15803D' }}>{msg}</div>}

      <div className="fin-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', background: 'var(--bg-soft)' }}>
          <span className="fin-card-title" style={{ margin: 0 }}>Операції Mono</span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }}>
            {(['todo', 'all'] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                style={{ height: '26px', padding: '0 10px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '11.5px', fontWeight: 600, cursor: 'pointer', background: filter === f ? '#1E3A5F' : 'var(--bg-card)', color: filter === f ? '#fff' : 'var(--text-secondary)' }}>
                {f === 'todo' ? `На категоризацію (${todo.length})` : `Усі (${rows.length})`}
              </button>
            ))}
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                <th style={{ ...cell, textAlign: 'left' }}>Дата</th><th style={{ ...cell, textAlign: 'right' }}>Сума</th>
                <th style={{ ...cell, textAlign: 'left' }}>Контрагент · призначення</th><th style={{ ...cell, textAlign: 'left' }}>Облік</th>
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 && <tr><td colSpan={4} style={{ ...cell, textAlign: 'center', color: '#15803D', padding: '24px' }}>✓ Усе рознесено</td></tr>}
              {shown.map(r => (
                <tr key={r.id}>
                  <td style={cell}>{dmy(String(r.txn_time))}</td>
                  <td style={{ ...cell, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: r.direction === 'in' ? '#15803D' : 'var(--text-primary)' }}>{r.direction === 'in' ? '+' : '−'}{fmt(Number(r.amount))}</td>
                  <td style={{ ...cell, maxWidth: '460px' }}>
                    <div style={{ fontWeight: 600 }}>{r.counter_name ?? r.description}</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '11.5px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.comment ?? ''}>{r.comment}</div>
                  </td>
                  <td style={{ ...cell, minWidth: '320px' }}>
                    {r.status !== 'unmatched' && (
                      <span style={{ color: r.status === 'ignored' ? 'var(--text-muted)' : '#15803D', fontSize: '12px' }}>
                        ✓ {STATUS_LABEL[r.status]}{r.category ? ` · ${[...OUT_CATEGORIES, ...IN_CATEGORIES].find(c => c.value === r.category)?.label ?? r.category}` : ''}
                        {r.note && <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{r.note}</div>}
                      </span>
                    )}
                    {r.status === 'unmatched' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <select value={choice[r.id] ?? ''} onChange={e => setChoice(c => ({ ...c, [r.id]: e.target.value }))} style={{ ...inp, cursor: 'pointer' }}>
                          <option value="">{r.direction === 'in' ? 'Звідки гроші…' : 'Куди віднести…'}</option>
                          {(r.direction === 'in' ? IN_CATEGORIES : OUT_CATEGORIES).map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                        </select>
                        {choice[r.id] === 'supplier' && (
                          <select value={supplier[r.id] ?? suppliers[0]?.id ?? ''} onChange={e => setSupplier(s => ({ ...s, [r.id]: e.target.value }))} style={{ ...inp, cursor: 'pointer' }}>
                            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                          </select>
                        )}
                        {choice[r.id] && !choice[r.id].startsWith('transfer') && choice[r.id] !== 'ignore' && choice[r.id] !== 'supplier' && (
                          <input value={desc[r.id] ?? ''} onChange={e => setDesc(d => ({ ...d, [r.id]: e.target.value }))} placeholder="Опис (необов'язково)" style={inp} />
                        )}
                        <button onClick={() => post(r)} disabled={!choice[r.id] || busy === r.id}
                          style={{ alignSelf: 'flex-start', height: '28px', padding: '0 12px', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: choice[r.id] ? 'pointer' : 'not-allowed', background: choice[r.id] ? '#1D4ED8' : 'var(--bg-soft)', color: choice[r.id] ? '#fff' : 'var(--text-muted)' }}>
                          {busy === r.id ? 'Проводимо…' : 'Провести'}
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
    </div>
  );
}

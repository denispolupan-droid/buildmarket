'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw, AlertTriangle } from 'lucide-react';

export type NovapayRow = {
  id: string; txn_date: string; amount: number; direction: 'in' | 'out';
  counterparty: string | null; purpose: string | null; register_no: string | null;
  kind: 'cod_payout' | 'other_in' | 'debit'; status: 'posted' | 'unmatched' | 'ignored';
  category: string | null; note: string | null; posted_at: string | null;
};
type Pending = { order_number: number; total: number; delivered: string };
type Aggregate = { date: string; net: number; register: string | null };

const fmt = (n: number) => n.toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dmy = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;

const CATEGORIES: { value: string; label: string }[] = [
  { value: 'transfer:bank', label: '→ Переказ на Mono' },
  { value: 'transfer:cash', label: '→ Зняття готівки в касу' },
  { value: 'logistics',     label: 'Витрата · логістика' },
  { value: 'packaging',     label: 'Витрата · пакування' },
  { value: 'marketing',     label: 'Витрата · маркетинг' },
  { value: 'rent',          label: 'Витрата · оренда' },
  { value: 'salary',        label: 'Витрата · зарплата / підрядники' },
  { value: 'opex',          label: 'Витрата · інше (opex)' },
  { value: 'ignore',        label: 'Ігнорувати (не наш рух)' },
];

const IN_CATEGORIES: { value: string; label: string }[] = [
  { value: 'transfer-in:bank', label: '← Переказ з Mono' },
  { value: 'transfer-in:cash', label: '← Внесення готівки з каси' },
  { value: 'ignore',           label: 'Ігнорувати (не наш рух)' },
];

const KIND_LABEL: Record<NovapayRow['kind'], string> = { cod_payout: 'Виплата наложки', other_in: 'Зарахування', debit: 'Списання' };

export default function NovapayClient({ rows, ledger, live, npCod, lastRegister, pending, aggregate }: {
  rows: NovapayRow[]; ledger: number; live: { available: number; fetchedAt: string } | null;
  npCod: number; lastRegister: string | null; pending: Pending[]; aggregate: Aggregate[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [desc, setDesc] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<'all' | 'unmatched'>('unmatched');

  const unmatched = useMemo(() => rows.filter(r => r.status === 'unmatched'), [rows]);
  const shown = filter === 'unmatched' ? unmatched : rows;
  const unmatchedSum = unmatched.reduce((s, r) => s + Number(r.amount), 0);
  const pendingSum = pending.reduce((s, p) => s + p.total, 0);
  const diff = live ? Math.round((ledger - live.available) * 100) / 100 : null;

  async function refresh() {
    setBusy('refresh'); setMsg(null);
    try {
      const res = await fetch('/api/admin/finance/novapay', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'refresh' }) });
      const d = await res.json();
      if (!res.ok) { setMsg(`Помилка: ${d.error}`); return; }
      setMsg(`Виписка ${d.ingest.from}…${d.ingest.to}: нових документів ${d.ingest.inserted}; виплат проведено ${d.payouts.processed} (по ЕН ${d.payouts.matched}, сумою ${d.payouts.aggregate}; ${fmt(d.payouts.net)} ₴, ${d.payouts.orders} замовлень)${d.deductions?.posted ? `; утримання НП ${fmt(d.deductions.amount)} ₴` : ''}${d.deductions?.alert ? ` · ⚠ ${d.deductions.alert}` : ''}`);
      router.refresh();
    } catch { setMsg('Помилка запиту'); } finally { setBusy(null); }
  }

  async function post(row: NovapayRow) {
    const category = choice[row.id];
    if (!category) return;
    setBusy(row.id); setMsg(null);
    try {
      const res = await fetch('/api/admin/finance/novapay', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: row.id, category, description: desc[row.id] }) });
      const d = await res.json();
      if (!res.ok) { setMsg(`Помилка: ${d.error}`); return; }
      router.refresh();
    } catch { setMsg('Помилка запиту'); } finally { setBusy(null); }
  }

  const cell: React.CSSProperties = { fontSize: '12.5px', padding: '8px 10px', borderBottom: '1px solid var(--border-light)', verticalAlign: 'top' };
  const inp: React.CSSProperties = { height: '30px', padding: '0 8px', border: '1.5px solid var(--border)', borderRadius: '6px', fontSize: '12px', background: 'var(--bg-soft)', color: 'var(--text-primary)', outline: 'none' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Зведення */}
      <div className="fin-grid-12">
        <div className="fin-card" style={{ gridColumn: 'span 4' }}>
          <div className="fin-kpi-label">Рахунок NovaPay</div>
          <div className="fin-money-val">{live ? fmt(live.available) : fmt(ledger)} ₴</div>
          <div className="fin-money-sub">
            {live ? `живий залишок · за обліком ${fmt(ledger)} ₴` : 'за обліком (живий недоступний)'}
            {diff !== null && Math.abs(diff) > 0.01 && (
              <div style={{ color: '#B45309', fontWeight: 600, marginTop: '2px' }}>
                <AlertTriangle size={11} style={{ verticalAlign: '-1px' }} /> різниця {fmt(diff)} ₴ — {unmatched.length ? `нерознесені списання ${fmt(unmatchedSum)} ₴` : 'перевірте виписку'}
              </div>
            )}
          </div>
        </div>
        <div className="fin-card" style={{ gridColumn: 'span 4' }}>
          <div className="fin-kpi-label">Наложка: НоваПей ще не виплатила</div>
          <div className="fin-money-val" style={{ color: '#B45309' }}>{fmt(Math.max(0, npCod))} ₴</div>
          <div className="fin-money-sub" title="np:cod = брутто вручених наложок без виплати по ЕН − реєстри, чий склад не підібрано (проведені сумою)">
            за обліком (np:cod){lastRegister ? ` · останній реєстр ${dmy(lastRegister)}` : ''}
            {pending.length > 0 && <> · без виплати по ЕН: {pending.length} ({fmt(pendingSum)} ₴)</>}
            {aggregate.length > 0 && <> · реєстрів сумою: {aggregate.length} ({fmt(aggregate.reduce((s, a) => s + a.net, 0))} ₴)</>}
          </div>
        </div>
        <div className="fin-card" style={{ gridColumn: 'span 4', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div className="fin-kpi-label">Виписка</div>
          <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>
            документів {rows.length} · на категоризацію <b style={{ color: unmatched.length ? '#B45309' : '#15803D' }}>{unmatched.length}</b>
            {unmatched.length > 0 && <> ({fmt(unmatchedSum)} ₴)</>}
          </div>
          <button onClick={refresh} disabled={busy === 'refresh'}
            style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: '6px', height: '32px', padding: '0 12px', border: '1px solid var(--border)', borderRadius: '7px', background: 'var(--bg-soft)', color: 'var(--text-primary)', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
            <RefreshCw size={12} style={busy === 'refresh' ? { animation: 'spin 1s linear infinite' } : undefined} /> {busy === 'refresh' ? 'Тягнемо…' : 'Оновити виписку зараз'}
          </button>
          <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>Крон оновлює раз на день. NovaPay відповідає до хвилини.</div>
        </div>
      </div>

      {msg && <div className="fin-card" style={{ fontSize: '12.5px', color: msg.startsWith('Помилка') ? '#DC2626' : '#15803D' }}>{msg}</div>}

      {(pending.length > 0 || aggregate.length > 0) && (
        <div className="fin-card">
          <div className="fin-card-title">Вручено, виплати по ЕН немає <span className="fin-card-sub">· {pending.length} посилок · {fmt(pendingSum)} ₴</span></div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px', fontSize: '12px', color: 'var(--text-secondary)' }}>
            {pending.map(p => <span key={p.order_number}>#{p.order_number} · {dmy(p.delivered)} · <b>{fmt(p.total)}</b></span>)}
          </div>
          {aggregate.length > 0 && (
            <div style={{ marginTop: '10px', fontSize: '12px', color: 'var(--text-secondary)' }}>
              <div style={{ fontWeight: 700, color: '#B45309', marginBottom: '4px' }}>Реєстри, склад яких не підібрано (проведені сумою на np:cod):</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px' }}>
                {aggregate.map(a => <span key={`${a.date}-${a.register}`}>{dmy(a.date)} · реєстр {a.register ?? '—'} · <b>{fmt(a.net)}</b></span>)}
              </div>
              <div style={{ color: 'var(--text-muted)', marginTop: '4px' }}>Свіжі посилки (сьогодні-вчора) — норма: НоваПей платить у день вручення. Старіші без виплати або реєстри без складу — привід звірити з кабінетом НП.</div>
            </div>
          )}
        </div>
      )}

      {/* Документи */}
      <div className="fin-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', background: 'var(--bg-soft)' }}>
          <span className="fin-card-title" style={{ margin: 0 }}>Документи виписки</span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }}>
            {(['unmatched', 'all'] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                style={{ height: '26px', padding: '0 10px', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '11.5px', fontWeight: 600, cursor: 'pointer', background: filter === f ? '#1E3A5F' : 'var(--bg-card)', color: filter === f ? '#fff' : 'var(--text-secondary)' }}>
                {f === 'unmatched' ? `На категоризацію (${unmatched.length})` : `Усі (${rows.length})`}
              </button>
            ))}
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                <th style={{ ...cell, textAlign: 'left' }}>Дата</th><th style={{ ...cell, textAlign: 'left' }}>Тип</th>
                <th style={{ ...cell, textAlign: 'right' }}>Сума</th><th style={{ ...cell, textAlign: 'left' }}>Контрагент · призначення</th>
                <th style={{ ...cell, textAlign: 'left' }}>Облік</th>
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 && <tr><td colSpan={5} style={{ ...cell, textAlign: 'center', color: '#15803D', padding: '24px' }}>✓ Усе рознесено</td></tr>}
              {shown.map(r => (
                <tr key={r.id}>
                  <td style={cell}>{dmy(r.txn_date)}</td>
                  <td style={cell}>{KIND_LABEL[r.kind]}{r.register_no && <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>реєстр {r.register_no}</div>}</td>
                  <td style={{ ...cell, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: r.direction === 'in' ? '#15803D' : 'var(--text-primary)' }}>{r.direction === 'in' ? '+' : '−'}{fmt(Number(r.amount))}</td>
                  <td style={{ ...cell, maxWidth: '420px' }}>
                    <div style={{ fontWeight: 600 }}>{r.counterparty}</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '11.5px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.purpose ?? ''}>{r.purpose}</div>
                  </td>
                  <td style={{ ...cell, minWidth: '300px' }}>
                    {r.status === 'posted' && (
                      <span style={{ color: r.category === 'cod_payout_aggregate' ? '#B45309' : '#15803D', fontSize: '12px' }}>
                        ✓ {r.kind === 'cod_payout' ? (r.category === 'cod_payout_aggregate' ? 'виплата сумою (склад не підібрано)' : 'виплата по ЕН') : [...CATEGORIES, ...IN_CATEGORIES].find(c => c.value === r.category)?.label ?? r.category}
                        {r.note && <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{r.note}</div>}
                      </span>
                    )}
                    {r.status === 'ignored' && <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>ігнор</span>}
                    {r.status === 'unmatched' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <select value={choice[r.id] ?? ''} onChange={e => setChoice(c => ({ ...c, [r.id]: e.target.value }))} style={{ ...inp, cursor: 'pointer' }}>
                          <option value="">{r.direction === 'in' ? 'Звідки гроші…' : 'Куди віднести…'}</option>
                          {(r.direction === 'in' ? IN_CATEGORIES : CATEGORIES).map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                        </select>
                        {choice[r.id] && !choice[r.id].startsWith('transfer') && choice[r.id] !== 'ignore' && (
                          <input value={desc[r.id] ?? ''} onChange={e => setDesc(d => ({ ...d, [r.id]: e.target.value }))} placeholder="Опис витрати (необов'язково)" style={inp} />
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

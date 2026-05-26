'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { ArrowDownLeft, ArrowUpRight, Plus, X, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

export type CashEntry = {
  id:            string;
  txn_id:        string;
  amount:        number;
  description:   string | null;
  business_date: string;
  doc_id:        string | null;
  doc_type:      string | null;
  doc_number:    string | null;
  counterparty:  string | null;
  is_manual:     boolean;
};

const CATEGORIES = [
  { key: 'salary',    label: 'Зарплата' },
  { key: 'rent',      label: 'Оренда' },
  { key: 'logistics', label: 'Доставка' },
  { key: 'marketing', label: 'Маркетинг' },
  { key: 'supplies',  label: 'Канцтовари' },
  { key: 'other',     label: 'Інше' },
];

function fmt(n: number) {
  return Math.abs(n).toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function docHref(e: CashEntry): string | null {
  if (!e.doc_id) return null;
  if (e.doc_type === 'purchase_order' || e.doc_type === 'supplier_payment') return `/admin/procurement/${e.doc_id}`;
  if (e.doc_type === 'receipt' || e.doc_type === 'stock_in') return `/admin/procurement/receipts/${e.doc_id}`;
  if (e.doc_type === 'sale' || e.doc_type === 'payment') return `/admin/accounting/documents/${e.doc_id}`;
  return null;
}

type Props = {
  entries:        CashEntry[];
  openingBalance: number;
  currentBalance: number;
};

export default function CashRegisterClient({ entries, openingBalance, currentBalance }: Props) {
  const router = useRouter();

  const [dir,    setDir]    = useState<'all' | 'in' | 'out'>('all');
  const [search, setSearch] = useState('');

  // Modal state
  const [modal,    setModal]    = useState(false);
  const [mDir,     setMDir]     = useState<'in' | 'out'>('out');
  const [mAmount,  setMAmount]  = useState('');
  const [mDesc,    setMDesc]    = useState('');
  const [mCat,     setMCat]     = useState('other');
  const [mDate,    setMDate]    = useState(new Date().toISOString().slice(0, 10));
  const [saving,   setSaving]   = useState(false);
  const [mError,   setMError]   = useState('');

  function openModal(direction: 'in' | 'out') {
    setMDir(direction);
    setMAmount('');
    setMDesc('');
    setMCat('other');
    setMDate(new Date().toISOString().slice(0, 10));
    setMError('');
    setModal(true);
  }

  async function handleSave() {
    const amount = parseFloat(mAmount.replace(',', '.'));
    if (!amount || amount <= 0) { setMError('Введіть суму'); return; }
    if (!mDesc.trim())          { setMError('Введіть опис'); return; }

    setSaving(true);
    setMError('');
    try {
      const res = await fetch('/api/admin/finance/cash', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          direction:     mDir,
          amount,
          description:   mDesc.trim(),
          category:      mCat,
          business_date: mDate,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setMError(data.error ?? 'Помилка'); return; }
      setModal(false);
      router.refresh();
    } catch {
      setMError('Мережева помилка');
    } finally {
      setSaving(false);
    }
  }

  // Filter
  const filtered = useMemo(() => entries.filter(e => {
    if (dir === 'in'  && e.amount <= 0) return false;
    if (dir === 'out' && e.amount >= 0) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!e.description?.toLowerCase().includes(q) && !e.counterparty?.toLowerCase().includes(q) && !e.doc_number?.toLowerCase().includes(q)) return false;
    }
    return true;
  }), [entries, dir, search]);

  // Running balance (entries are newest-first)
  const withBalance = useMemo(() => {
    const rev = [...filtered].reverse();
    let bal = openingBalance;
    return rev.map(e => { bal += e.amount; return { ...e, balance: bal }; }).reverse();
  }, [filtered, openingBalance]);

  const totalIn  = entries.filter(e => e.amount > 0).reduce((s, e) => s + e.amount, 0);
  const totalOut = entries.filter(e => e.amount < 0).reduce((s, e) => s + e.amount, 0);

  const inp: React.CSSProperties = {
    height: '36px', padding: '0 10px', borderRadius: '8px',
    border: '1px solid var(--border)', background: 'var(--bg-card)',
    fontSize: '13px', color: 'var(--text-primary)', outline: 'none', width: '100%',
  };

  return (
    <>
      {/* ── Summary ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '20px' }}>
        {[
          { label: 'Залишок на початок місяця', value: openingBalance, color: '#1E3A5F' },
          { label: 'Надходження (ПКО)',          value: totalIn,        color: '#15803D' },
          { label: 'Видатки (РКО)',              value: Math.abs(totalOut), color: '#DC2626' },
          { label: 'Поточний залишок',           value: currentBalance, color: currentBalance >= 0 ? '#15803D' : '#DC2626' },
        ].map(c => (
          <div key={c.label} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px 18px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '6px' }}>{c.label}</div>
            <div style={{ fontSize: '22px', fontWeight: 800, color: c.color, fontVariantNumeric: 'tabular-nums' }}>
              {fmt(c.value)} ₴
            </div>
          </div>
        ))}
      </div>

      {/* ── Actions + Filters ── */}
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap' }}>
        {/* ПКО / РКО buttons */}
        <button onClick={() => openModal('in')} style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          height: '36px', padding: '0 16px', borderRadius: '8px', border: 'none',
          background: '#15803D', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer',
        }}>
          <Plus size={14} /> ПКО — Прихід
        </button>
        <button onClick={() => openModal('out')} style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          height: '36px', padding: '0 16px', borderRadius: '8px', border: 'none',
          background: '#DC2626', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer',
        }}>
          <Plus size={14} /> РКО — Видаток
        </button>

        {/* Direction filter */}
        <div style={{ display: 'flex', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border)', marginLeft: '8px' }}>
          {([
            { key: 'all', label: 'Всі' },
            { key: 'in',  label: '↓ ПКО' },
            { key: 'out', label: '↑ РКО' },
          ] as const).map((d, i) => (
            <button key={d.key} onClick={() => setDir(d.key)} style={{
              height: '36px', padding: '0 14px', fontSize: '12px', fontWeight: 600,
              cursor: 'pointer', border: 'none',
              borderLeft: i > 0 ? '1px solid var(--border)' : 'none',
              background: dir === d.key ? '#1E3A5F' : 'var(--bg-soft)',
              color:      dir === d.key ? '#fff'    : 'var(--text-secondary)',
            }}>{d.label}</button>
          ))}
        </div>

        <input type="text" placeholder="Пошук…" value={search} onChange={e => setSearch(e.target.value)}
          style={{ height: '36px', padding: '0 10px', borderRadius: '8px', border: '1px solid var(--border)',
            background: 'var(--bg-card)', fontSize: '13px', color: 'var(--text-primary)', outline: 'none',
            width: '200px', marginLeft: 'auto' }} />
      </div>

      {/* ── Table ── */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
        <div style={{
          display: 'grid', gridTemplateColumns: '100px 60px 1fr 150px 120px 130px',
          padding: '8px 16px', background: 'var(--bg-soft)', borderBottom: '1px solid var(--border)',
          fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase',
        }}>
          <span>Дата</span><span>Тип</span><span>Опис</span>
          <span>Контрагент / Документ</span>
          <span style={{ textAlign: 'right' }}>Сума</span>
          <span style={{ textAlign: 'right' }}>Залишок</span>
        </div>

        {withBalance.length === 0 && (
          <div style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
            Операцій не знайдено
          </div>
        )}

        {withBalance.map((e, idx) => {
          const isIn  = e.amount > 0;
          const href  = docHref(e);
          const isLast = idx === withBalance.length - 1;

          return (
            <div key={e.id} style={{
              display: 'grid', gridTemplateColumns: '100px 60px 1fr 150px 120px 130px',
              padding: '10px 16px', alignItems: 'center',
              borderBottom: isLast ? 'none' : '1px solid var(--border-light)',
              background: idx % 2 === 0 ? 'transparent' : 'var(--bg-soft)',
            }}>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                {new Date(e.business_date).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: '2-digit' })}
              </span>

              <span style={{
                fontSize: '10px', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', width: 'fit-content',
                color:      isIn ? '#15803D' : '#DC2626',
                background: isIn ? '#F0FDF4' : '#FEF2F2',
              }}>
                {isIn ? 'ПКО' : 'РКО'}
              </span>

              <span style={{ fontSize: '13px', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {e.description ?? '—'}
              </span>

              <div style={{ minWidth: 0 }}>
                {e.counterparty && (
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {e.counterparty}
                  </div>
                )}
                {href && e.doc_number && (
                  <Link href={href} style={{ fontSize: '11px', color: '#1D4ED8', textDecoration: 'none', fontWeight: 600 }}>
                    {e.doc_number}
                  </Link>
                )}
                {!e.counterparty && !e.doc_number && <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>—</span>}
              </div>

              <div style={{ textAlign: 'right', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                {isIn ? <ArrowDownLeft size={13} color="#15803D" /> : <ArrowUpRight size={13} color="#DC2626" />}
                <span style={{ fontSize: '14px', fontWeight: 700, color: isIn ? '#15803D' : '#DC2626', fontVariantNumeric: 'tabular-nums' }}>
                  {isIn ? '+' : '−'}{fmt(e.amount)} ₴
                </span>
              </div>

              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: e.balance >= 0 ? 'var(--text-primary)' : '#DC2626', fontVariantNumeric: 'tabular-nums' }}>
                  {e.balance.toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₴
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: '10px', fontSize: '12px', color: 'var(--text-muted)', textAlign: 'right' }}>
        {filtered.length} операцій · поточний місяць
      </div>

      {/* ── Modal ── */}
      {modal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }} onClick={e => { if (e.target === e.currentTarget) setModal(false); }}>
          <div style={{
            background: 'var(--bg-card)', borderRadius: '16px', padding: '28px',
            width: '420px', boxShadow: '0 24px 80px rgba(0,0,0,0.3)',
            display: 'flex', flexDirection: 'column', gap: '16px',
          }}>
            {/* Modal header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)' }}>
                  {mDir === 'in' ? '📥 ПКО — Прихід готівки' : '📤 РКО — Видаток готівки'}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>Ручне введення без документа</div>
              </div>
              <button onClick={() => setModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '4px' }}>
                <X size={18} />
              </button>
            </div>

            {/* Direction toggle */}
            <div style={{ display: 'flex', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border)' }}>
              {(['in', 'out'] as const).map((d, i) => (
                <button key={d} onClick={() => setMDir(d)} style={{
                  flex: 1, height: '36px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', border: 'none',
                  borderLeft: i > 0 ? '1px solid var(--border)' : 'none',
                  background: mDir === d ? (d === 'in' ? '#15803D' : '#DC2626') : 'var(--bg-soft)',
                  color: mDir === d ? '#fff' : 'var(--text-secondary)',
                }}>
                  {d === 'in' ? '↓ Прихід (ПКО)' : '↑ Видаток (РКО)'}
                </button>
              ))}
            </div>

            {/* Amount */}
            <div>
              <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>Сума, ₴</label>
              <input
                type="number" min="0.01" step="0.01" placeholder="0.00"
                value={mAmount} onChange={e => setMAmount(e.target.value)}
                style={{ ...inp, fontSize: '20px', fontWeight: 700, height: '44px' }}
                autoFocus
              />
            </div>

            {/* Description */}
            <div>
              <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>Опис</label>
              <input
                type="text" placeholder="Наприклад: Оренда офісу за травень"
                value={mDesc} onChange={e => setMDesc(e.target.value)}
                style={inp}
              />
            </div>

            {/* Category (only for out) */}
            {mDir === 'out' && (
              <div>
                <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>Категорія</label>
                <select value={mCat} onChange={e => setMCat(e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
                  {CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                </select>
              </div>
            )}

            {/* Date */}
            <div>
              <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>Дата операції</label>
              <input type="date" value={mDate} onChange={e => setMDate(e.target.value)} style={inp} />
            </div>

            {mError && (
              <div style={{ padding: '8px 12px', background: '#FEF2F2', borderRadius: '8px', fontSize: '13px', color: '#DC2626' }}>
                {mError}
              </div>
            )}

            {/* Buttons */}
            <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
              <button onClick={() => setModal(false)} style={{
                flex: 1, height: '40px', borderRadius: '8px', border: '1.5px solid var(--border)',
                background: 'none', fontSize: '13px', fontWeight: 600, cursor: 'pointer', color: 'var(--text-secondary)',
              }}>
                Скасувати
              </button>
              <button onClick={handleSave} disabled={saving} style={{
                flex: 2, height: '40px', borderRadius: '8px', border: 'none',
                background: mDir === 'in' ? '#15803D' : '#DC2626',
                color: '#fff', fontSize: '13px', fontWeight: 700, cursor: saving ? 'default' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px',
                opacity: saving ? 0.7 : 1,
              }}>
                {saving ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : null}
                {mDir === 'in' ? 'Провести ПКО' : 'Провести РКО'}
              </button>
            </div>
          </div>
          <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
        </div>
      )}
    </>
  );
}

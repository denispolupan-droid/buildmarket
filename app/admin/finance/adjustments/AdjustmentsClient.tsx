'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Plus, Trash2, Check, X, ChevronDown, ChevronRight, RefreshCw, AlertCircle } from 'lucide-react';
import {
  OP_LABEL, validateLine, sideKey, legsFor,
  type AdjustmentLineInput, type AdjustmentOp, type DebtSide, type SideState, type DebtAccount,
} from '../../../../lib/accounting/debt-adjustment-rules';
import type { OpenItem, DebtAdjustmentView } from '../../../../lib/accounting/debt-adjustment';

type PartyOption = { id: string; label: string; sub: string | null; balance: number };
type SideValue = { account: DebtAccount; party: PartyOption | null; orderId: string | null; state?: SideState; items?: OpenItem[] };
type LineDraft = { line: AdjustmentLineInput; text: string };

const fmt = (n: number) => n.toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const today = () => new Date().toISOString().slice(0, 10);
const emptySide = (account: DebtAccount): SideValue => ({ account, party: null, orderId: null });

const inputStyle: React.CSSProperties = {
  height: '36px', padding: '0 10px', border: '1.5px solid var(--border)', borderRadius: '8px', fontSize: '13px',
  outline: 'none', color: 'var(--text-primary)', background: 'var(--bg-soft)', width: '100%', boxSizing: 'border-box',
};
const btnPrimary: React.CSSProperties = { height: '36px', padding: '0 16px', borderRadius: '9px', border: 'none', background: '#1E3A5F', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px' };
const btnGhost: React.CSSProperties = { height: '32px', padding: '0 12px', borderRadius: '8px', border: '1.5px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-secondary)', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px' };

/** Сальдо словами: клієнт «+» = винен нам; постачальник «−» = ми винні. */
function balanceText(account: DebtAccount, b: number): { text: string; color: string } {
  if (Math.abs(b) < 0.005) return { text: 'сальдо 0', color: 'var(--text-muted)' };
  if (account === 'customer') return b > 0 ? { text: `винен нам ${fmt(b)} ₴`, color: '#DC2626' } : { text: `аванс ${fmt(-b)} ₴`, color: '#15803D' };
  return b < 0 ? { text: `ми винні ${fmt(-b)} ₴`, color: '#DC2626' } : { text: `переплата ${fmt(b)} ₴`, color: '#15803D' };
}

// ── Вибір сторони: тип → контрагент (пошук) → замовлення (для клієнтів) ──────
function SidePicker({ title, hint, value, onChange, lockAccount }: {
  title: string; hint: string; value: SideValue; onChange: (v: SideValue) => void; lockAccount?: DebtAccount;
}) {
  const [q, setQ] = useState('');
  const [options, setOptions] = useState<PartyOption[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // Пошук контрагента з невеликою затримкою, щоб не смикати базу на кожну літеру
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/admin/finance/debt-adjustments/parties?account=${value.account}&q=${encodeURIComponent(q)}`);
        const d = await res.json();
        setOptions(d.options ?? []);
      } finally { setLoading(false); }
    }, 250);
    return () => clearTimeout(t);
  }, [q, open, value.account]);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  // Стан сторони і список її замовлень — після вибору контрагента / замовлення
  const loadState = useCallback(async (v: SideValue) => {
    if (!v.party) return;
    const p = new URLSearchParams({ account: v.account, party: v.party.id });
    if (v.orderId) p.set('order_id', v.orderId);
    const res = await fetch(`/api/admin/finance/debt-adjustments/side?${p}`);
    const d = await res.json();
    if (res.ok) onChange({ ...v, state: d.state, items: v.orderId ? v.items : d.items });
  }, [onChange]);

  const pick = (o: PartyOption) => {
    const v: SideValue = { account: value.account, party: o, orderId: null };
    onChange(v); setOpen(false); setQ('');
    void loadState(v);
  };
  const pickOrder = (orderId: string | null) => {
    const v: SideValue = { ...value, orderId, state: undefined };
    onChange(v);
    void loadState(v);
  };

  const b = value.state ? balanceText(value.account, value.state.balance) : null;
  const item = value.orderId ? value.items?.find(i => i.order_id === value.orderId) : null;

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: '12px', padding: '12px 14px', background: 'var(--bg-card)', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '8px', marginBottom: '8px' }}>
        <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{title}</div>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{hint}</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: lockAccount ? '1fr' : '150px 1fr', gap: '8px' }}>
        {!lockAccount && (
          <select value={value.account} onChange={e => onChange(emptySide(e.target.value as DebtAccount))} style={inputStyle}>
            <option value="customer">Клієнт / службовий</option>
            <option value="supplier">Постачальник</option>
          </select>
        )}
        <div ref={boxRef} style={{ position: 'relative' }}>
          <input
            value={open ? q : (value.party?.label ?? '')}
            placeholder={value.account === 'supplier' ? 'постачальник…' : 'клієнт, np:cod, mp:prom…'}
            onFocus={() => { setOpen(true); setQ(''); }}
            onChange={e => setQ(e.target.value)}
            style={inputStyle}
          />
          {open && (
            <div style={{ position: 'absolute', zIndex: 20, top: '38px', left: 0, right: 0, maxHeight: '260px', overflowY: 'auto', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '10px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)' }}>
              {loading && <div style={{ padding: '10px 12px', fontSize: '12px', color: 'var(--text-muted)' }}>Шукаю…</div>}
              {!loading && options.length === 0 && <div style={{ padding: '10px 12px', fontSize: '12px', color: 'var(--text-muted)' }}>Нічого не знайдено</div>}
              {options.map(o => {
                const bt = balanceText(value.account, o.balance);
                return (
                  <button key={o.id} type="button" onMouseDown={() => pick(o)}
                    style={{ display: 'flex', width: '100%', justifyContent: 'space-between', gap: '10px', alignItems: 'center', padding: '8px 12px', border: 'none', borderTop: '1px solid var(--border-light)', background: 'transparent', cursor: 'pointer', textAlign: 'left' }}>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.label}</span>
                      {o.sub && <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)' }}>{o.sub}</span>}
                    </span>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: bt.color, whiteSpace: 'nowrap' }}>{bt.text}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {value.party && (
        <div style={{ marginTop: '8px', fontSize: '12.5px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Сальдо:</span>
            {b ? <strong style={{ color: b.color }}>{b.text}</strong> : <span style={{ color: 'var(--text-muted)' }}>…</span>}
          </div>
          {value.account === 'customer' && (
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Замовлення:</span>
              <select value={value.orderId ?? ''} onChange={e => pickOrder(e.target.value || null)} style={{ ...inputStyle, height: '32px', width: 'auto', minWidth: '260px', flex: '1 1 260px' }}>
                <option value="">— без замовлення (по контрагенту) —</option>
                {(value.items ?? []).map(i => (
                  <option key={i.order_id} value={i.order_id}>
                    #{i.order_number ?? '—'} · {i.created_at?.slice(0, 10) ?? ''} · продаж {fmt(i.sale)} / отримано {fmt(i.received)} / відкрито {fmt(i.open)}
                  </option>
                ))}
              </select>
            </div>
          )}
          {item && (
            <div style={{ color: 'var(--text-secondary)' }}>
              По замовленню #{item.order_number}: продаж <strong>{fmt(item.sale)}</strong>, отримано <strong style={{ color: '#15803D' }}>{fmt(item.received)}</strong>, відкрито <strong style={{ color: item.open > 0.005 ? '#DC2626' : 'var(--text-primary)' }}>{fmt(item.open)}</strong> ₴
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Форма + журнал ───────────────────────────────────────────────────────────
export default function AdjustmentsClient() {
  const searchParams = useSearchParams();
  const focusId = searchParams.get('id');

  const [op, setOp] = useState<AdjustmentOp>('transfer');
  const [date, setDate] = useState(today());
  const [notes, setNotes] = useState('');
  const [amount, setAmount] = useState('');
  const [lineNote, setLineNote] = useState('');
  const [kind, setKind] = useState<'forgive' | 'income'>('forgive');
  const [a, setA] = useState<SideValue>(emptySide('customer'));
  const [b, setB] = useState<SideValue>(emptySide('customer'));
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [docs, setDocs] = useState<DebtAdjustmentView[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set(focusId ? [focusId] : []));
  const [cancelling, setCancelling] = useState<string | null>(null);

  const loadDocs = useCallback(async () => {
    setLoadingDocs(true);
    try {
      const res = await fetch('/api/admin/finance/debt-adjustments?limit=150');
      const d = await res.json();
      setDocs(d.documents ?? []);
    } finally { setLoadingDocs(false); }
  }, []);
  useEffect(() => { void loadDocs(); }, [loadDocs]);

  // Зміна операції — сторони під неї (взаємозалік: клієнт + постачальник)
  const switchOp = (next: AdjustmentOp) => {
    setOp(next); setError(null);
    if (next === 'offset') { setA(emptySide('customer')); setB(emptySide('supplier')); }
    else { setA(emptySide('customer')); setB(emptySide('customer')); }
  };

  const toSide = (v: SideValue): DebtSide | null => v.party ? { account: v.account, party: v.party.id, orderId: v.orderId } : null;
  const label = useCallback((s: DebtSide) => {
    const v = [a, b].find(x => x.party && sideKey({ account: x.account, party: x.party.id, orderId: x.orderId }) === sideKey(s));
    const who = v?.party?.label ?? s.party;
    const ord = s.orderId ? ` (#${v?.items?.find(i => i.order_id === s.orderId)?.order_number ?? '…'})` : '';
    return `${who}${ord}`;
  }, [a, b]);

  const draftLine = useMemo((): AdjustmentLineInput | null => {
    const amt = Number(String(amount).replace(',', '.'));
    const sa = toSide(a), sb = toSide(b);
    const note = lineNote.trim() || null;
    if (op === 'transfer')  return sa && sb ? { op, from: sa, to: sb, amount: amt, note } : null;
    if (op === 'offset')    return sa && sb ? { op, customer: sa, supplier: sb, amount: amt, note } : null;
    return sa ? { op: 'write_off', side: sa, kind, amount: amt, note } : null;
  }, [op, a, b, amount, lineNote, kind]);

  // Та сама перевірка, що й на сервері, лише на вже завантажених станах
  const draftError = useMemo(() => {
    if (!draftLine) return 'Виберіть сторони';
    const states = new Map<string, SideState | undefined>();
    for (const v of [a, b]) if (v.party) states.set(sideKey({ account: v.account, party: v.party.id, orderId: v.orderId }), v.state);
    return validateLine(draftLine, { stateOf: s => states.get(sideKey(s)), label });
  }, [draftLine, a, b, label]);

  const addLine = () => {
    if (!draftLine || draftError) { setError(draftError); return; }
    const { debit, credit } = legsFor(draftLine);
    const dl = debit.account === 'correction' ? 'Коригування' : label(debit as DebtSide);
    const cl = credit.account === 'correction' ? 'Коригування' : label(credit as DebtSide);
    setLines(prev => [...prev, { line: draftLine, text: `${OP_LABEL[draftLine.op]}: Дт ${dl} → Кт ${cl}` }]);
    setAmount(''); setLineNote(''); setError(null);
  };

  const post = async () => {
    if (!lines.length) { setError('Додайте хоча б один рядок'); return; }
    setPosting(true); setError(null);
    try {
      const res = await fetch('/api/admin/finance/debt-adjustments', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_date: date, notes, lines: lines.map(l => l.line) }),
      });
      const d = await res.json();
      if (!res.ok) { setError(d.error ?? 'Помилка'); return; }
      setToast(`Проведено ${d.doc_number} на ${fmt(d.total)} ₴`);
      setLines([]); setNotes(''); setA(emptySide(a.account)); setB(emptySide(b.account));
      setExpanded(new Set([d.id]));
      await loadDocs();
    } finally { setPosting(false); }
  };

  const cancelDoc = async (doc: DebtAdjustmentView) => {
    const reason = window.prompt(`Скасувати ${doc.doc_number}? Проводки по всіх рядках буде обернено сьогоднішньою датою.\n\nПричина (необов'язково):`);
    if (reason === null) return;
    setCancelling(doc.id);
    try {
      const res = await fetch(`/api/admin/finance/debt-adjustments/${doc.id}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }) });
      const d = await res.json();
      if (!res.ok) { setError(d.error ?? 'Помилка скасування'); return; }
      setToast(`${doc.doc_number} скасовано`);
      await loadDocs();
    } finally { setCancelling(null); }
  };

  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 5000); return () => clearTimeout(t); }, [toast]);

  const total = lines.reduce((s, l) => s + Number(l.line.amount), 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* ── Новий документ ─────────────────────────────────────────────── */}
      <div className="fin-card" style={{ padding: '18px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', marginBottom: '14px' }}>
          <div className="fin-card-title">Новий документ</div>
          <div style={{ display: 'flex', gap: '6px' }}>
            {(Object.keys(OP_LABEL) as AdjustmentOp[]).map(k => (
              <button key={k} type="button" onClick={() => switchOp(k)} className={'fin-pill' + (op === k ? ' active' : '')}>{OP_LABEL[k]}</button>
            ))}
          </div>
        </div>

        <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginBottom: '12px', lineHeight: 1.5 }}>
          {op === 'transfer' && <>Проводка <strong>Дт «звідки» / Кт «куди»</strong>. Щоб перенести оплату із загубленого замовлення на його копію: «звідки» — старе замовлення (його борг відновиться), «куди» — нове (борг закриється). Зняти можна не більше, ніж отримано по замовленню; на замовлення покласти не більше відкритого боргу.</>}
          {op === 'offset' && <>Проводка <strong>Дт постачальник / Кт клієнт</strong>: борг клієнта гаситься нашим боргом перед постачальником. Межі — борг клієнта і наш борг постачальнику.</>}
          {op === 'write_off' && <>«Прощення боргу» — <strong>Дт коригування / Кт сторона</strong> (не більше боргу). «Переплата в дохід» — <strong>Дт сторона / Кт коригування</strong> (не більше авансу чи отриманого по замовленню).</>}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: op === 'write_off' ? '1fr' : '1fr 1fr', gap: '12px' }}>
          {op === 'transfer' && <>
            <SidePicker title="Звідки" hint="борг цієї сторони зросте" value={a} onChange={setA} />
            <SidePicker title="Куди" hint="борг цієї сторони зменшиться" value={b} onChange={setB} />
          </>}
          {op === 'offset' && <>
            <SidePicker title="Клієнт" hint="його борг зменшиться" value={a} onChange={setA} lockAccount="customer" />
            <SidePicker title="Постачальник" hint="наш борг йому зменшиться" value={b} onChange={setB} lockAccount="supplier" />
          </>}
          {op === 'write_off' && (
            <SidePicker title="Сторона" hint={kind === 'forgive' ? 'борг списується' : 'переплата стає доходом'} value={a} onChange={setA} />
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: op === 'write_off' ? '200px 160px 1fr auto' : '160px 1fr auto', gap: '10px', alignItems: 'end', marginTop: '12px' }}>
          {op === 'write_off' && (
            <label style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Вид
              <select value={kind} onChange={e => setKind(e.target.value as 'forgive' | 'income')} style={{ ...inputStyle, marginTop: '4px' }}>
                <option value="forgive">Прощення боргу</option>
                <option value="income">Переплата в дохід</option>
              </select>
            </label>
          )}
          <label style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Сума, ₴
            <input value={amount} onChange={e => setAmount(e.target.value)} inputMode="decimal" placeholder="0,00" style={{ ...inputStyle, marginTop: '4px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }} />
          </label>
          <label style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Примітка до рядка
            <input value={lineNote} onChange={e => setLineNote(e.target.value)} placeholder="напр. посилка загубилась, відправлено повторно" style={{ ...inputStyle, marginTop: '4px' }} />
          </label>
          <button type="button" onClick={addLine} disabled={!draftLine || !!draftError} title={draftError ?? 'Додати рядок'}
            style={{ ...btnPrimary, opacity: !draftLine || draftError ? 0.45 : 1, cursor: !draftLine || draftError ? 'default' : 'pointer' }}>
            <Plus size={14} /> Додати рядок
          </button>
        </div>
        {draftLine && draftError && (
          <div style={{ marginTop: '8px', fontSize: '12px', color: '#B45309', display: 'flex', alignItems: 'center', gap: '6px' }}><AlertCircle size={13} /> {draftError}</div>
        )}

        {lines.length > 0 && (
          <div style={{ marginTop: '14px', border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden' }}>
            {lines.map((l, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '28px 1fr 120px 32px', gap: '10px', alignItems: 'center', padding: '8px 12px', borderTop: i ? '1px solid var(--border-light)' : 'none', fontSize: '12.5px' }}>
                <span style={{ color: 'var(--text-muted)' }}>{i + 1}</span>
                <span style={{ color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.text}{l.line.note ? <span style={{ color: 'var(--text-muted)' }}> — {l.line.note}</span> : null}</span>
                <span style={{ textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmt(Number(l.line.amount))} ₴</span>
                <button type="button" onClick={() => setLines(prev => prev.filter((_, j) => j !== i))} style={{ border: 'none', background: 'transparent', color: '#DC2626', cursor: 'pointer' }}><Trash2 size={14} /></button>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', borderTop: '1px solid var(--border)', background: 'var(--bg-soft)', fontSize: '12.5px', fontWeight: 700 }}>
              <span>Разом</span><span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(total)} ₴</span>
            </div>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr auto', gap: '10px', alignItems: 'end', marginTop: '14px' }}>
          <label style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Дата проводок
            <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ ...inputStyle, marginTop: '4px' }} />
          </label>
          <label style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Підстава / коментар до документа
            <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="напр. лист покупця, № претензії" style={{ ...inputStyle, marginTop: '4px' }} />
          </label>
          <button type="button" onClick={post} disabled={posting || !lines.length} style={{ ...btnPrimary, background: '#15803D', opacity: posting || !lines.length ? 0.5 : 1 }}>
            <Check size={14} /> {posting ? 'Проводимо…' : 'Провести'}
          </button>
        </div>
        {error && <div style={{ marginTop: '10px', fontSize: '12.5px', color: '#DC2626', display: 'flex', alignItems: 'center', gap: '6px' }}><AlertCircle size={14} /> {error}</div>}
        {toast && <div style={{ marginTop: '10px', fontSize: '12.5px', color: '#15803D', fontWeight: 600 }}>{toast}</div>}
      </div>

      {/* ── Журнал ─────────────────────────────────────────────────────── */}
      <div className="fin-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
          <div className="fin-card-title">Документи</div>
          <button type="button" onClick={loadDocs} style={btnGhost}><RefreshCw size={13} /> Оновити</button>
        </div>
        {loadingDocs && docs.length === 0 && <div style={{ padding: '24px', fontSize: '13px', color: 'var(--text-muted)' }}>Завантаження…</div>}
        {!loadingDocs && docs.length === 0 && <div style={{ padding: '24px', fontSize: '13px', color: 'var(--text-muted)' }}>Коригувань ще не було</div>}
        {docs.map(d => {
          const isOpen = expanded.has(d.id);
          const cancelled = d.status === 'cancelled';
          return (
            <div key={d.id} style={{ borderTop: '1px solid var(--border-light)', background: focusId === d.id ? 'var(--bg-soft)' : undefined }}>
              <div onClick={() => setExpanded(prev => { const n = new Set(prev); if (n.has(d.id)) n.delete(d.id); else n.add(d.id); return n; })}
                style={{ display: 'grid', gridTemplateColumns: '20px 150px 100px 1fr 130px 110px', gap: '10px', alignItems: 'center', padding: '10px 18px', cursor: 'pointer', fontSize: '13px' }}>
                <span style={{ color: 'var(--text-muted)' }}>{isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>
                <span style={{ fontWeight: 800, color: 'var(--text-primary)', textDecoration: cancelled ? 'line-through' : 'none' }}>{d.doc_number}</span>
                <span style={{ color: 'var(--text-secondary)' }}>{d.doc_date?.slice(0, 10)}</span>
                <span style={{ color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {[...new Set(d.lines.map(l => OP_LABEL[l.op as AdjustmentOp] ?? l.op))].join(', ')}{d.notes ? ` — ${d.notes}` : ''}
                </span>
                <span style={{ textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmt(d.total_amount)} ₴</span>
                <span style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '6px', background: cancelled ? '#FEF2F2' : '#F0FDF4', color: cancelled ? '#DC2626' : '#15803D' }}>
                    {cancelled ? 'Скасовано' : 'Проведено'}
                  </span>
                </span>
              </div>
              {isOpen && (
                <div style={{ padding: '4px 18px 14px 48px', fontSize: '12.5px' }}>
                  <div style={{ border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden' }}>
                    {d.lines.map(l => (
                      <div key={l.line_no} style={{ display: 'grid', gridTemplateColumns: '24px 1fr 120px', gap: '10px', padding: '8px 12px', borderTop: l.line_no > 1 ? '1px solid var(--border-light)' : 'none', alignItems: 'center' }}>
                        <span style={{ color: 'var(--text-muted)' }}>{l.line_no}</span>
                        <span>
                          <span style={{ color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em', marginRight: '6px' }}>{OP_LABEL[l.op as AdjustmentOp] ?? l.op}</span>
                          <span style={{ color: '#1E3A5F', fontWeight: 700 }}>Дт</span> {l.debit.order_id ? <Link href={`/admin/orders/${l.debit.order_id}`} style={{ color: 'inherit' }}>{l.debit.label}</Link> : l.debit.label}
                          <span style={{ color: 'var(--text-muted)' }}> → </span>
                          <span style={{ color: '#B45309', fontWeight: 700 }}>Кт</span> {l.credit.order_id ? <Link href={`/admin/orders/${l.credit.order_id}`} style={{ color: 'inherit' }}>{l.credit.label}</Link> : l.credit.label}
                          {l.note && <span style={{ color: 'var(--text-muted)' }}> — {l.note}</span>}
                          {!l.posted && <span style={{ color: '#DC2626', marginLeft: '6px' }}>(не проведено)</span>}
                          {l.reversed && <span style={{ color: '#DC2626', marginLeft: '6px' }}>(обернено)</span>}
                        </span>
                        <span style={{ textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmt(l.amount)} ₴</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px', color: 'var(--text-muted)', fontSize: '12px' }}>
                    <span>Створив: {d.created_by ?? '—'}{cancelled ? ` · скасував: ${d.cancelled_by ?? '—'}${d.cancel_reason ? ` (${d.cancel_reason})` : ''}` : ''}</span>
                    {!cancelled && (
                      <button type="button" onClick={() => cancelDoc(d)} disabled={cancelling === d.id}
                        style={{ ...btnGhost, color: '#DC2626', borderColor: '#FECACA' }}>
                        <X size={13} /> {cancelling === d.id ? 'Скасовуємо…' : 'Скасувати документ'}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

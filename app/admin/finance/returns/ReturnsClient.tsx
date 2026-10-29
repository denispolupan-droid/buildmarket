'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  ChevronDown, ChevronRight, RefreshCw, AlertCircle, Check, X, PackageCheck, Truck, FileText, Undo2, Search,
} from 'lucide-react';
import {
  REASON_LABEL, STAGE_LABEL, KIND_LABEL,
  type ReturnKind, type ReturnStage, type ReturnReason, type RefundMethod,
} from '../../../../lib/accounting/returns-rules';
import type { ReturnRow, ReturnsKpi, ReturnCard } from '../../../../lib/accounting/returns';

const fmt = (n: number) => n.toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const today = () => new Date().toISOString().slice(0, 10);
const dateShort = (iso: string | null | undefined) => iso ? new Date(iso).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
const dateTime = (iso: string | null | undefined) => iso ? new Date(iso).toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

const inputStyle: React.CSSProperties = {
  height: '34px', padding: '0 10px', border: '1.5px solid var(--border)', borderRadius: '8px', fontSize: '13px',
  outline: 'none', color: 'var(--text-primary)', background: 'var(--bg-soft)', boxSizing: 'border-box',
};
const labelStyle: React.CSSProperties = { fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '4px' };

const ACCOUNT: Record<string, string> = {
  revenue: 'Виручка', customer: 'Покупець', cogs: 'Собівартість', inventory_asset: 'Товари на складі',
  inventory_transit: 'Товар у дорозі', supplier: 'Постачальник', marketplace_fee: 'Комісія маркетплейсу',
  marketplace_balance: 'Баланс маркетплейсу', bank: 'Банк', cash: 'Каса', partner: 'Партнер', correction: 'Коригування',
};
const accountLabel = (a: string, party: string | null) => `${ACCOUNT[a] ?? a}${party ? ` (${party})` : ''}`;

/** Стадія — точкою біля підпису, як у решті фінансів (не кольоровою рамкою). */
function StageBadge({ stage, status }: { stage: ReturnStage; status: string }) {
  if (status === 'cancelled') return <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}><span className="fin-dot red" />Скасовано</span>;
  const dot = stage === 'awaiting' || stage === 'sent' ? 'orange' : 'green';
  return <span style={{ fontSize: '12px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}><span className={`fin-dot ${dot}`} />{STAGE_LABEL[stage]}</span>;
}

function KindBadge({ kind }: { kind: ReturnKind }) {
  return (
    <span style={{ fontSize: '10.5px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', padding: '2px 7px', borderRadius: '6px',
      background: kind === 'customer' ? '#FFFBEB' : '#EFF6FF', color: kind === 'customer' ? '#B45309' : '#1E3A5F', whiteSpace: 'nowrap', alignSelf: 'flex-start' }}>
      {kind === 'customer' ? 'ПВ · від покупця' : 'ПП · постачальнику'}
    </span>
  );
}

type KindFilter = 'all' | ReturnKind;
type StageFilter = 'all' | ReturnStage | 'cancelled';

export default function ReturnsClient() {
  const focusId = useSearchParams().get('id');
  const [rows, setRows] = useState<ReturnRow[]>([]);
  const [kpi, setKpi] = useState<ReturnsKpi | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [kind, setKind] = useState<KindFilter>('all');
  const [stage, setStage] = useState<StageFilter>('all');
  const [q, setQ] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set(focusId ? [focusId] : []));
  const [cards, setCards] = useState<Record<string, ReturnCard | undefined>>({});

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const p = new URLSearchParams({ limit: '300' });
      if (from) p.set('from', from);
      if (to) p.set('to', to);
      const res = await fetch(`/api/admin/finance/returns?${p}`);
      const d = await res.json();
      if (!res.ok) { setError(d.error ?? 'Помилка завантаження'); return; }
      setRows(d.rows ?? []); setKpi(d.kpi ?? null);
    } catch { setError('Мережева помилка'); }
    finally { setLoading(false); }
  }, [from, to]);
  useEffect(() => { void load(); }, [load]);

  const loadCard = useCallback(async (id: string) => {
    const res = await fetch(`/api/admin/finance/returns/${id}`);
    const d = await res.json();
    if (res.ok) setCards(prev => ({ ...prev, [id]: d }));
    else setError(d.error ?? 'Не вдалося відкрити документ');
  }, []);

  useEffect(() => {
    for (const id of expanded) if (!cards[id]) void loadCard(id);
  }, [expanded, cards, loadCard]);

  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 6000); return () => clearTimeout(t); }, [toast]);

  const toggle = (id: string) => setExpanded(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  /** Після дії — перечитати і список, і відкриті картки (стадії міняються в обох). */
  const refreshAll = useCallback(async (ids: string[]) => {
    await load();
    await Promise.all([...new Set(ids)].map(id => loadCard(id)));
  }, [load, loadCard]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter(r =>
      (kind === 'all' || r.kind === kind)
      && (stage === 'all' || (stage === 'cancelled' ? r.status === 'cancelled' : (r.stage === stage && r.status !== 'cancelled')))
      && (!needle || [r.doc_number, r.counterparty, r.order_number ? `#${r.order_number}` : '', r.ttn ?? '', r.reason_text ?? '', ...r.children.map(c => c.doc_number), r.parent?.doc_number ?? '']
        .some(s => s.toLowerCase().includes(needle))),
    );
  }, [rows, kind, stage, q]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* ── Показники ───────────────────────────────────────────────── */}
      <div className="fin-kpi-row cols-3">
        <div className="fin-card fin-kpi">
          <div className="fin-kpi-label"><span className={`fin-dot ${kpi?.awaiting.count ? 'orange' : 'green'}`} />Очікуємо від покупців</div>
          <div className="fin-kpi-value">{kpi ? fmt(kpi.awaiting.total) : '—'} ₴</div>
          <div className="fin-kpi-foot"><span className="fin-kpi-cmp" title="Товар ще не отримано — проводок немає">{kpi?.awaiting.count ?? 0} заяв(ок) · товар ще не отримано</span></div>
        </div>
        <div className="fin-card fin-kpi">
          <div className="fin-kpi-label"><span className={`fin-dot ${kpi?.in_transit.count ? 'orange' : 'green'}`} />В дорозі до постачальника</div>
          <div className="fin-kpi-value">{kpi ? fmt(kpi.in_transit.total) : '—'} ₴</div>
          <div className="fin-kpi-foot"><span className="fin-kpi-cmp" title="Відправлено постачальнику, ще не прийнято — сума за собівартістю">{kpi?.in_transit.count ?? 0} відправлено · ще не прийнято</span></div>
        </div>
        <div className="fin-card fin-kpi">
          <div className="fin-kpi-label">Цього місяця</div>
          <div className="fin-kpi-value">{kpi?.month.count ?? 0}</div>
          <div className="fin-kpi-foot"><span className="fin-kpi-cmp">від покупців {kpi ? fmt(kpi.month.customer_total) : '—'} ₴ · постачальникам {kpi ? fmt(kpi.month.supplier_total) : '—'} ₴</span></div>
        </div>
      </div>

      {/* ── Журнал ──────────────────────────────────────────────────── */}
      <div className="fin-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <div className="fin-card-title" style={{ marginRight: '8px' }}>Документи</div>
            {(['all', 'customer', 'supplier'] as KindFilter[]).map(k => (
              <button key={k} type="button" onClick={() => setKind(k)} className={'fin-pill' + (kind === k ? ' active' : '')}>
                {k === 'all' ? 'Усі' : KIND_LABEL[k]}
              </button>
            ))}
            <span style={{ width: '1px', height: '22px', background: 'var(--border)', margin: '0 4px' }} />
            {(['all', 'awaiting', 'received', 'sent', 'accepted', 'cancelled'] as StageFilter[]).map(s => (
              <button key={s} type="button" onClick={() => setStage(s)} className={'fin-pill' + (stage === s ? ' active' : '')}>
                {s === 'all' ? 'Будь-яка стадія' : s === 'cancelled' ? 'Скасовані' : STAGE_LABEL[s]}
              </button>
            ))}
            <button type="button" onClick={load} className="proc-btn sm" style={{ marginLeft: 'auto' }}><RefreshCw size={13} /> Оновити</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 150px 150px', gap: '10px' }}>
            <div style={{ position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--text-muted)' }} />
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="номер документа, контрагент, №замовлення, ТТН…" style={{ ...inputStyle, width: '100%', paddingLeft: '30px' }} />
            </div>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={inputStyle} title="Дата з" />
            <input type="date" value={to} onChange={e => setTo(e.target.value)} style={inputStyle} title="Дата по" />
          </div>
        </div>

        {error && <div style={{ padding: '10px 18px', fontSize: '12.5px', color: '#DC2626', display: 'flex', alignItems: 'center', gap: '6px' }}><AlertCircle size={14} /> {error}</div>}
        {toast && <div style={{ padding: '10px 18px', fontSize: '12.5px', color: '#15803D', fontWeight: 600 }}>{toast}</div>}
        {loading && rows.length === 0 && <div style={{ padding: '24px', fontSize: '13px', color: 'var(--text-muted)' }}>Завантаження…</div>}
        {!loading && filtered.length === 0 && <div style={{ padding: '24px', fontSize: '13px', color: 'var(--text-muted)' }}>Повернень не знайдено</div>}

        {filtered.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: '20px 190px 90px 1fr 170px 160px 110px', gap: '10px', padding: '8px 18px', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-light)' }}>
            <span /><span>Документ</span><span>Дата</span><span>Контрагент · підстава</span><span>Причина</span><span>Стадія</span><span style={{ textAlign: 'right' }}>Сума</span>
          </div>
        )}

        {filtered.map(r => {
          const isOpen = expanded.has(r.id);
          const cancelled = r.status === 'cancelled';
          return (
            <div key={r.id} style={{ borderTop: '1px solid var(--border-light)', background: focusId === r.id ? 'var(--bg-soft)' : undefined }}>
              <div onClick={() => toggle(r.id)}
                style={{ display: 'grid', gridTemplateColumns: '20px 190px 90px 1fr 170px 160px 110px', gap: '10px', alignItems: 'center', padding: '10px 18px', cursor: 'pointer', fontSize: '13px', opacity: cancelled ? 0.65 : 1 }}>
                <span style={{ color: 'var(--text-muted)' }}>{isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>
                <span style={{ display: 'flex', flexDirection: 'column', gap: '3px', minWidth: 0 }}>
                  <span style={{ fontWeight: 800, color: 'var(--text-primary)', textDecoration: cancelled ? 'line-through' : 'none' }}>{r.doc_number}</span>
                  <KindBadge kind={r.kind} />
                </span>
                <span style={{ color: 'var(--text-secondary)' }}>{dateShort(r.doc_date)}</span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>{r.counterparty}</span>
                  <span style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                    {r.order_number ? <>замовлення #{r.order_number}</> : null}
                    {r.parent ? <>{r.order_number ? ' · ' : ''}на підставі {r.parent.doc_number}</> : null}
                    {r.children.length ? <> · ПП: {r.children.map(c => c.doc_number).join(', ')}</> : null}
                    {r.ttn ? <> · ТТН {r.ttn}</> : null}
                  </span>
                </span>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.reason_text ?? undefined}>
                  {r.reason ? REASON_LABEL[r.reason] : '—'}{r.reason_text ? ` — ${r.reason_text}` : ''}
                </span>
                <StageBadge stage={r.stage} status={r.status} />
                <span style={{ textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmt(r.total)} ₴</span>
              </div>
              {isOpen && (
                <div style={{ padding: '4px 18px 16px 48px' }}>
                  {cards[r.id]
                    ? <Card card={cards[r.id]!} onChanged={ids => refreshAll([r.id, ...ids])} onToast={setToast} onError={setError} />
                    : <div style={{ fontSize: '12.5px', color: 'var(--text-muted)', padding: '8px 0' }}>Завантаження…</div>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Картка документа ────────────────────────────────────────────────────────

function Card({ card, onChanged, onToast, onError }: {
  card: ReturnCard;
  onChanged: (ids: string[]) => Promise<void>;
  onToast: (s: string) => void;
  onError: (s: string | null) => void;
}) {
  const [mode, setMode] = useState<'none' | 'receive' | 'supplier' | 'accept' | 'ttn'>('none');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // «Товар отримано»
  const [receivedAt, setReceivedAt] = useState(today());
  const [refund, setRefund] = useState<'none' | RefundMethod>(card.refund?.method ?? 'none');
  // «Повернути постачальнику»
  const [supplierId, setSupplierId] = useState<number | ''>(card.suppliers[0]?.id ?? '');
  const [qtys, setQtys] = useState<Record<string, number>>(() => Object.fromEntries(card.lines.map(l => [l.sku, l.supplier_returnable ?? 0])));
  const [ppTtn, setPpTtn] = useState('');
  const [ppReason, setPpReason] = useState<ReturnReason>(card.reason ?? 'surplus');
  const [ppText, setPpText] = useState('');
  // «Прийнято»
  const [acceptedAt, setAcceptedAt] = useState(today());
  // ТТН / коментар
  const [ttn, setTtn] = useState(card.ttn ?? '');
  const [reasonText, setReasonText] = useState(card.reason_text ?? '');

  const isMp = !!card.channel_code && ['prom', 'rozetka', 'epicentr'].includes(card.channel_code);
  const cancelled = card.status === 'cancelled';

  async function call(url: string, init: RequestInit, done: string, extraIds: string[] = []) {
    setBusy(true); setErr(null); onError(null);
    try {
      const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...init });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(d.error ?? 'Помилка'); return null; }
      onToast(done.replace('{n}', d.doc_number ?? card.doc_number));
      setMode('none');
      await onChanged([...extraIds, ...(d.id ? [d.id] : [])]);
      return d;
    } catch { setErr('Мережева помилка'); return null; }
    finally { setBusy(false); }
  }

  const receive = () => call(`/api/admin/finance/returns/${card.id}/receive`, {
    method: 'POST', body: JSON.stringify({ received_at: receivedAt, refund: refund === 'none' ? null : { method: refund } }),
  }, 'Проведено {n}: товар на складі, виручка сторнована');

  const supplierReturn = () => {
    const lines = Object.entries(qtys).filter(([, q]) => q > 0).map(([sku, qty]) => ({ sku, qty }));
    if (!lines.length) { setErr('Вкажіть кількість'); return; }
    return call(`/api/admin/finance/returns/${card.id}/supplier-return`, {
      method: 'POST', body: JSON.stringify({ supplier_id: supplierId, lines, ttn: ppTtn, reason: ppReason, reason_text: ppText }),
    }, 'Створено й проведено {n}: товар списано, борг постачальнику зменшено');
  };

  const accept = () => call(`/api/admin/finance/returns/${card.id}/accept`, {
    method: 'POST', body: JSON.stringify({ accepted_at: acceptedAt }),
  }, '{n}: прийнято постачальником');

  const saveDetails = () => call(`/api/admin/finance/returns/${card.id}`, {
    method: 'PATCH', body: JSON.stringify({ ttn, reason_text: reasonText }),
  }, '{n}: реквізити збережено');

  const cancel = async () => {
    const reason = window.prompt(
      card.status === 'confirmed'
        ? `Скасувати ${card.doc_number}? Буде створено сторно: склад і проводки повернуться назад сьогоднішньою датою.\n\nПричина (необов'язково):`
        : `Скасувати заявку ${card.doc_number}?\n\nПричина (необов'язково):`,
    );
    if (reason === null) return;
    await call(`/api/admin/finance/returns/${card.id}`, { method: 'DELETE', body: JSON.stringify({ reason }) }, '{n} скасовано', card.parent ? [card.parent.id] : []);
  };

  const Chip = ({ id, number, kind, current, href }: { id: string; number: string; kind: string; current?: boolean; href?: string }) => (
    <Link key={id} href={href ?? `/admin/finance/returns?id=${id}`}
      style={{ fontSize: '12px', fontWeight: current ? 800 : 600, padding: '4px 10px', borderRadius: '999px', textDecoration: 'none',
        border: `1.5px solid ${current ? '#1E3A5F' : 'var(--border)'}`, background: current ? '#1E3A5F' : 'var(--bg-card)', color: current ? '#fff' : 'var(--text-secondary)' }}>
      {kind} {number}
    </Link>
  );
  const arrow = <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>→</span>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', fontSize: '12.5px' }}>
      {/* Ланцюжок документів */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)', marginRight: '4px' }}>Ланцюжок</span>
        {card.chain.sales.map(s => <span key={s.id} style={{ display: 'contents' }}><Chip id={s.id} number={s.doc_number} kind="РН" href={`/admin/accounting/documents/${s.id}`} />{arrow}</span>)}
        {card.kind === 'supplier' && card.parent && <><Chip id={card.parent.id} number={card.parent.doc_number} kind={card.parent.doc_type === 'return_in' ? 'ПВ' : 'ПН'} href={card.parent.doc_type === 'return_in' ? undefined : `/admin/accounting/documents/${card.parent.id}`} />{arrow}</>}
        <Chip id={card.id} number={card.doc_number} kind={card.kind === 'customer' ? 'ПВ' : 'ПП'} current />
        {card.kind === 'customer' && card.chain.children.map(c => <span key={c.id} style={{ display: 'contents' }}>{arrow}<Chip id={c.id} number={c.doc_number} kind="ПП" /></span>)}
        {card.kind === 'customer' && card.chain.children.length === 0 && card.status !== 'cancelled' && (
          <span style={{ color: 'var(--text-muted)' }}>{arrow} <span style={{ fontStyle: 'italic' }}>ПП ще не створено</span></span>
        )}
      </div>

      {/* Реквізити */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 24px', padding: '12px 14px', background: 'var(--bg-soft)', borderRadius: '10px' }}>
        <Field k="Контрагент" v={card.counterparty} />
        <Field k="Створив" v={`${card.created_by ?? '—'} · ${dateTime(card.created_at)}`} />
        <Field k="Замовлення" v={card.order_number ? <Link href={`/admin/orders/${card.order_id}`} style={{ color: '#1E3A5F', fontWeight: 700 }}>#{card.order_number}</Link> : '—'} />
        <Field k={card.kind === 'customer' ? 'Проведено' : 'Відправлено'} v={card.kind === 'customer' ? dateTime(card.received_at ?? card.confirmed_at) : dateTime(card.sent_at ?? card.confirmed_at)} />
        <Field k="Причина" v={`${card.reason ? REASON_LABEL[card.reason] : '—'}${card.reason_text ? ` — ${card.reason_text}` : ''}`} />
        {card.kind === 'customer'
          ? <Field k="Маркетплейс" v={isMp ? (card.mp_unaware ? 'не знає про повернення — комісія не сторнується, кошти повертаємо самі' : `${card.channel_code}: комісія сторнується пропорційно, кошти покупцю повертає площадка`) : 'не маркетплейс'} />
          : <Field k="Прийнято" v={dateTime(card.accepted_at)} />}
        <Field k="ТТН" v={card.ttn ?? '—'} />
        {card.kind === 'customer' && <Field k="Кошти покупцю" v={card.refunded > 0 ? `повернуто ${fmt(card.refunded)} ₴ (${card.refund?.method === 'cash' ? 'готівка' : 'банк'})` : card.refund ? `повернути при отриманні (${card.refund.method === 'cash' ? 'готівка' : 'банк'})` : 'не повертаємо з каси/банку'} />}
        {card.kind === 'customer' && card.commission_reversed > 0 && <Field k="Сторно комісії" v={`${fmt(card.commission_reversed)} ₴`} />}
        {cancelled && <Field k="Скасовано" v={`${card.cancelled_by ?? '—'}${card.cancel_reason ? ` — ${card.cancel_reason}` : ''}`} />}
      </div>

      {/* Рядки */}
      <table className="fin-table" style={{ marginTop: 0 }}>
        <thead>
          <tr style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)' }}>
            <td style={{ width: '24px' }}>№</td><td style={{ width: '110px' }}>Артикул</td><td>Товар</td>
            <td className="num">К-сть</td><td className="num">{card.kind === 'customer' ? 'Ціна' : 'Собівартість'}</td><td className="num">Сума</td>
            {card.kind === 'customer' && <td style={{ width: '200px' }}>Постачальник · до ПП</td>}
          </tr>
        </thead>
        <tbody>
          {card.lines.map((l, i) => (
            <tr key={l.sku}>
              <td className="muted">{i + 1}</td>
              <td style={{ fontFamily: 'monospace', fontSize: '12px' }}>{l.sku}</td>
              <td className="name" title={l.name}>{l.name}{l.origin_fulfillment === 'dropship' && <span style={{ fontSize: '10.5px', color: 'var(--text-muted)', marginLeft: '6px' }}>дропшип → наш склад</span>}</td>
              <td className="num">{l.qty}</td>
              <td className="num">{fmt(card.kind === 'customer' ? l.price : l.cost_price)}</td>
              <td className="num">{fmt(l.amount)}</td>
              {card.kind === 'customer' && (
                <td className="muted" style={{ fontSize: '12px' }}>
                  {l.supplier_name ?? '—'}{card.status === 'confirmed' ? ` · ще ${l.supplier_returnable ?? 0} шт` : ''}
                </td>
              )}
            </tr>
          ))}
          <tr>
            <td colSpan={5} style={{ textAlign: 'right', fontWeight: 700 }}>Разом</td>
            <td className="num" style={{ fontWeight: 800 }}>{fmt(card.total)} ₴</td>
            {card.kind === 'customer' && <td />}
          </tr>
        </tbody>
      </table>

      {/* Проводки + хронологія */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 260px', gap: '16px' }}>
        <div>
          <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)', marginBottom: '6px' }}>Проводки</div>
          {card.entries.length === 0
            ? <div style={{ color: 'var(--text-muted)' }}>{card.status === 'draft' ? 'Ще немає — з\'являться, коли товар отримано' : 'Немає'}</div>
            : (
              <div style={{ border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden' }}>
                {card.entries.map((e, i) => (
                  <div key={e.txn_id} style={{ display: 'grid', gridTemplateColumns: '80px 1fr 110px', gap: '10px', padding: '7px 12px', borderTop: i ? '1px solid var(--border-light)' : 'none', alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{dateShort(e.business_date)}</span>
                    <span>
                      <span style={{ color: '#1E3A5F', fontWeight: 700 }}>Дт</span> {accountLabel(e.debit.account, e.debit.party)}
                      <span style={{ color: 'var(--text-muted)' }}> → </span>
                      <span style={{ color: '#B45309', fontWeight: 700 }}>Кт</span> {accountLabel(e.credit.account, e.credit.party)}
                      {e.description && <span style={{ color: 'var(--text-muted)' }}> — {e.description}</span>}
                    </span>
                    <span style={{ textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmt(e.amount)} ₴</span>
                  </div>
                ))}
              </div>
            )}
        </div>
        <div>
          <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-muted)', marginBottom: '6px' }}>Хронологія</div>
          {card.timeline.map(t => (
            <div key={t.key} style={{ display: 'flex', gap: '8px', padding: '4px 0', color: t.done ? 'var(--text-primary)' : 'var(--text-muted)' }}>
              <span className={`fin-dot big ${t.key === 'cancelled' ? 'red' : t.done ? 'green' : 'orange'}`} />
              <span><div style={{ fontWeight: t.done ? 600 : 500 }}>{t.label}</div><div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>{t.done ? dateTime(t.at) : 'очікується'}</div></span>
            </div>
          ))}
        </div>
      </div>

      {/* Дії */}
      {!cancelled && (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          {card.actions.receive && <button type="button" className="proc-btn primary" onClick={() => setMode(mode === 'receive' ? 'none' : 'receive')}><PackageCheck size={14} /> Товар отримано</button>}
          {card.actions.supplierReturn && <button type="button" className="proc-btn accent" onClick={() => setMode(mode === 'supplier' ? 'none' : 'supplier')}><Truck size={14} /> Повернути постачальнику</button>}
          {card.actions.accept && <button type="button" className="proc-btn primary" onClick={() => setMode(mode === 'accept' ? 'none' : 'accept')}><Check size={14} /> Прийнято постачальником</button>}
          {card.actions.editTtn && <button type="button" className="proc-btn" onClick={() => setMode(mode === 'ttn' ? 'none' : 'ttn')}>ТТН / коментар</button>}
          <a className="proc-btn" href={`/api/admin/finance/returns/${card.id}/pdf?form=nakladna&inline=1`} target="_blank" rel="noopener noreferrer"><FileText size={14} /> Накладна на повернення</a>
          {card.kind === 'customer' && <a className="proc-btn" href={`/api/admin/finance/returns/${card.id}/pdf?form=akt&inline=1`} target="_blank" rel="noopener noreferrer"><FileText size={14} /> Акт повернення</a>}
          {card.actions.cancel && <button type="button" className="proc-btn danger" style={{ marginLeft: 'auto' }} disabled={busy} onClick={cancel}><X size={14} /> Скасувати</button>}
        </div>
      )}
      {!cancelled && !card.actions.cancel && card.kind === 'customer' && (
        <div style={{ color: 'var(--text-muted)' }}>Скасувати не можна, поки є проведені повернення постачальнику на підставі цього документа.</div>
      )}

      {mode === 'receive' && (
        <div style={{ padding: '14px', border: '1px solid var(--border)', borderRadius: '10px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            Проведення датою отримання: товар стане на склад за собівартістю з РН{card.lines.some(l => l.origin_fulfillment === 'dropship') ? ' (дропшиповий теж — на наш склад, борг постачальнику зменшиться лише ПП)' : ''},
            виручка {fmt(card.total)} ₴ сторнується{isMp ? (card.mp_unaware ? '; комісію площадки НЕ сторнуємо' : '; комісія площадки сторнується пропорційно') : ''}.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '160px 260px auto', gap: '10px', alignItems: 'end' }}>
            <label style={labelStyle}>Дата отримання<input type="date" value={receivedAt} onChange={e => setReceivedAt(e.target.value)} style={inputStyle} /></label>
            <label style={labelStyle}>Кошти покупцю
              <select value={refund} onChange={e => setRefund(e.target.value as 'none' | RefundMethod)} style={inputStyle}>
                <option value="none">{isMp && !card.mp_unaware ? 'Повертає маркетплейс' : 'Не повертаємо зараз (борг на покупцеві)'}</option>
                <option value="bank">Повернути з банку</option>
                <option value="cash">Повернути готівкою</option>
              </select>
            </label>
            <button type="button" className="proc-btn primary" disabled={busy} onClick={receive}><Check size={14} /> {busy ? 'Проводимо…' : 'Провести'}</button>
          </div>
        </div>
      )}

      {mode === 'supplier' && (
        <div style={{ padding: '14px', border: '1px solid var(--border)', borderRadius: '10px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            Документ ПП проводиться одразу: товар списується зі складу, борг постачальнику зменшується на собівартість. Дата прийняття постачальником ставиться окремо.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px', gap: '10px' }}>
            <label style={labelStyle}>Постачальник
              <select value={supplierId} onChange={e => setSupplierId(Number(e.target.value))} style={inputStyle}>
                {card.suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <label style={labelStyle}>ТТН<input value={ppTtn} onChange={e => setPpTtn(e.target.value)} placeholder="необов'язково" style={inputStyle} /></label>
          </div>
          <div style={{ border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
            {card.lines.map((l, i) => (
              <div key={l.sku} style={{ display: 'grid', gridTemplateColumns: '1fr 120px 90px', gap: '10px', alignItems: 'center', padding: '6px 10px', borderTop: i ? '1px solid var(--border-light)' : 'none' }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.name} <span style={{ color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: '11px' }}>{l.sku}</span></span>
                <span style={{ color: 'var(--text-muted)', fontSize: '12px', textAlign: 'right' }}>можна {l.supplier_returnable ?? 0} шт</span>
                <input type="number" min={0} max={l.supplier_returnable ?? 0} step={1} value={qtys[l.sku] ?? 0}
                  onChange={e => setQtys(prev => ({ ...prev, [l.sku]: Math.max(0, Math.min(l.supplier_returnable ?? 0, Math.floor(Number(e.target.value) || 0))) }))}
                  style={{ ...inputStyle, textAlign: 'center', fontWeight: 700 }} />
              </div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr auto', gap: '10px', alignItems: 'end' }}>
            <label style={labelStyle}>Причина
              <select value={ppReason} onChange={e => setPpReason(e.target.value as ReturnReason)} style={inputStyle}>
                {(Object.keys(REASON_LABEL) as ReturnReason[]).map(k => <option key={k} value={k}>{REASON_LABEL[k]}</option>)}
              </select>
            </label>
            <label style={labelStyle}>Коментар<input value={ppText} onChange={e => setPpText(e.target.value)} placeholder="напр. узгоджено з менеджером постачальника" style={inputStyle} /></label>
            <button type="button" className="proc-btn primary" disabled={busy || !supplierId} onClick={supplierReturn}><Truck size={14} /> {busy ? 'Проводимо…' : 'Провести ПП'}</button>
          </div>
        </div>
      )}

      {mode === 'accept' && (
        <div style={{ padding: '14px', border: '1px solid var(--border)', borderRadius: '10px', display: 'grid', gridTemplateColumns: '160px auto', gap: '10px', alignItems: 'end' }}>
          <label style={labelStyle}>Дата прийняття<input type="date" value={acceptedAt} onChange={e => setAcceptedAt(e.target.value)} style={inputStyle} /></label>
          <button type="button" className="proc-btn primary" disabled={busy} onClick={accept}><Check size={14} /> Зафіксувати</button>
        </div>
      )}

      {mode === 'ttn' && (
        <div style={{ padding: '14px', border: '1px solid var(--border)', borderRadius: '10px', display: 'grid', gridTemplateColumns: '200px 1fr auto', gap: '10px', alignItems: 'end' }}>
          <label style={labelStyle}>ТТН<input value={ttn} onChange={e => setTtn(e.target.value)} style={inputStyle} /></label>
          <label style={labelStyle}>Коментар до причини<input value={reasonText} onChange={e => setReasonText(e.target.value)} style={inputStyle} /></label>
          <button type="button" className="proc-btn primary" disabled={busy} onClick={saveDetails}><Check size={14} /> Зберегти</button>
        </div>
      )}

      {err && <div style={{ color: '#DC2626', display: 'flex', alignItems: 'center', gap: '6px' }}><AlertCircle size={14} /> {err}</div>}
      {card.kind === 'customer' && card.status === 'draft' && (
        <div style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}><Undo2 size={13} /> Заявка без проводок: кількість по замовленню вже заброньована під повернення, повторно оформити ці позиції не вийде.</div>
      )}
    </div>
  );
}

function Field({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr', gap: '8px', alignItems: 'baseline' }}>
      <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{k}</span>
      <span style={{ color: 'var(--text-primary)' }}>{v}</span>
    </div>
  );
}

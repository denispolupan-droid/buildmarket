'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Printer, RefreshCw } from 'lucide-react';

export type ActRow = {
  date: string;
  description: string;
  debit: number;
  credit: number;
  docHref: string | null;
  docLabel: string | null;
  /** Замовлення-джерело: у дропшипі борг виникає саме по ньому */
  orderNumber?: number | null;
};

type Props = {
  backHref: string;
  counterpartyName: string;
  counterpartyLegalName?: string | null;
  counterpartyTaxId?: string | null;
  counterpartyAddress?: string | null;
  dateFrom: string;
  dateTo: string;
  opening: number;
  rows: ActRow[];
  companyName: string;
  mode: 'supplier' | 'customer';
};

function fmt(n: number) {
  return n.toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function fmtDateLong(d: string) {
  return new Date(d).toLocaleDateString('uk-UA', { day: '2-digit', month: 'long', year: 'numeric' });
}

export default function ActClient({
  backHref, counterpartyName, counterpartyLegalName, counterpartyTaxId, counterpartyAddress,
  dateFrom, dateTo, opening, rows, companyName, mode,
}: Props) {
  const router = useRouter();
  const [from, setFrom] = useState(dateFrom);
  const [to,   setTo]   = useState(dateTo);

  function applyDates() {
    const u = new URL(window.location.href);
    u.searchParams.set('from', from);
    u.searchParams.set('to',   to);
    router.push(u.pathname + '?' + u.searchParams.toString());
  }

  const totalDebit  = rows.reduce((s, r) => s + r.debit,  0);
  const totalCredit = rows.reduce((s, r) => s + r.credit, 0);

  // opening in ledger terms:
  //   supplier: negative = we owe them, positive = they owe us
  //   customer: positive = they owe us,  negative = we owe them
  const openingDebit = mode === 'supplier'
    ? (opening < 0 ? Math.abs(opening) : 0)
    : (opening > 0 ? opening : 0);
  const openingCredit = mode === 'supplier'
    ? (opening > 0 ? opening : 0)
    : (opening < 0 ? Math.abs(opening) : 0);

  const rawClosing = opening + (totalCredit - totalDebit);
  const closingDebit = mode === 'supplier'
    ? (rawClosing < 0 ? Math.abs(rawClosing) : 0)
    : (rawClosing > 0 ? rawClosing : 0);
  const closingCredit = mode === 'supplier'
    ? (rawClosing > 0 ? rawClosing : 0)
    : (rawClosing < 0 ? Math.abs(rawClosing) : 0);

  const COLS = '28px 88px 1fr 130px 130px';

  const inp: React.CSSProperties = {
    height: '34px', padding: '0 10px',
    border: '1.5px solid var(--border)', borderRadius: '8px',
    fontSize: '13px', outline: 'none',
    color: 'var(--text-primary)', background: 'var(--bg-soft)',
  };

  const modeLabel = mode === 'supplier' ? 'постачальника' : 'покупця';
  const debitLabel  = mode === 'supplier' ? 'Куплено (нам постачили)' : 'Відвантажено (відпущено)';
  const creditLabel = mode === 'supplier' ? 'Оплачено нами'           : 'Оплачено покупцем';

  return (
    <>
      {/* ── Screen-only controls ──────────────────────────────────────────── */}
      <div className="act-no-print" style={{ padding: '20px 32px', maxWidth: '1100px' }}>
        {/* Toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
          <Link href={backHref} style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)', textDecoration: 'none', fontSize: '13px' }}>
            <ArrowLeft size={16} /> Назад
          </Link>
          <div style={{ width: '1px', height: '20px', background: 'var(--border)' }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)' }}>
              Акт звірки взаємних розрахунків
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
              {counterpartyName}{counterpartyLegalName ? ` / ${counterpartyLegalName}` : ''}
            </div>
          </div>
          <button
            onClick={() => window.print()}
            style={{
              display: 'flex', alignItems: 'center', gap: '7px',
              height: '36px', padding: '0 18px', borderRadius: '8px',
              border: 'none', background: '#1E3A5F', color: '#fff',
              fontSize: '13px', fontWeight: 700, cursor: 'pointer',
            }}>
            <Printer size={14} /> Друкувати акт
          </button>
        </div>

        {/* Date filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '14px 18px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '10px', marginBottom: '24px' }}>
          <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Період</span>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={inp} />
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>—</span>
          <input type="date" value={to} onChange={e => setTo(e.target.value)} style={inp} />
          <button onClick={applyDates}
            style={{ height: '34px', padding: '0 16px', borderRadius: '8px', border: 'none', background: '#1E3A5F', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <RefreshCw size={13} /> Оновити
          </button>
        </div>
      </div>

      {/* ── Printable act ─────────────────────────────────────────────────── */}
      <div className="act-print-area" style={{ maxWidth: '900px', margin: '0 auto', padding: '0 32px 64px' }}>

        {/* Act header */}
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <div style={{ fontSize: '18px', fontWeight: 800, color: '#1E293B', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            АКТ ЗВІРКИ ВЗАЄМНИХ РОЗРАХУНКІВ
          </div>
          <div style={{ fontSize: '13px', color: '#475569', marginTop: '4px' }}>
            за період з {fmtDateLong(dateFrom)} по {fmtDateLong(dateTo)}
          </div>
          <div style={{ fontSize: '12px', color: '#64748B', marginTop: '2px' }}>
            складений {fmtDateLong(new Date().toISOString().slice(0, 10))}
          </div>
        </div>

        {/* Parties */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
          {[
            { label: 'Сторона 1', name: companyName, taxId: null, role: 'Ми' },
            { label: 'Сторона 2', name: counterpartyName, sub: counterpartyLegalName, taxId: counterpartyTaxId, address: counterpartyAddress, role: modeLabel.charAt(0).toUpperCase() + modeLabel.slice(1) },
          ].map((party, i) => (
            <div key={i} style={{ padding: '14px 16px', border: '1px solid #CBD5E1', borderRadius: '8px', background: '#F8FAFC' }}>
              <div style={{ fontSize: '10px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>{party.label}</div>
              <div style={{ fontSize: '14px', fontWeight: 800, color: '#1E293B' }}>{party.name}</div>
              {party.sub && <div style={{ fontSize: '12px', color: '#475569', marginTop: '1px' }}>{party.sub}</div>}
              {party.taxId && <div style={{ fontSize: '12px', color: '#475569', marginTop: '2px' }}>ЄДРПОУ / ІПН: {party.taxId}</div>}
              {party.address && <div style={{ fontSize: '12px', color: '#475569', marginTop: '1px' }}>{party.address}</div>}
            </div>
          ))}
        </div>

        {/* Table */}
        <div style={{ border: '1px solid #CBD5E1', borderRadius: '8px', overflow: 'hidden', fontSize: '12px' }}>
          {/* Header */}
          <div style={{ display: 'grid', gridTemplateColumns: COLS, padding: '8px 12px', background: '#1E3A5F', color: '#CBD5E1', fontWeight: 700, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em', gap: '8px' }}>
            <span style={{ textAlign: 'center' }}>№</span>
            <span>Дата</span>
            <span>Зміст операції</span>
            <span style={{ textAlign: 'right' }}>{debitLabel.split(' ')[0]}</span>
            <span style={{ textAlign: 'right' }}>{creditLabel.split(' ')[0]}</span>
          </div>

          {/* Column sub-labels */}
          <div style={{ display: 'grid', gridTemplateColumns: COLS, padding: '4px 12px', background: '#F1F5F9', borderBottom: '1px solid #CBD5E1', gap: '8px' }}>
            <span /><span />
            <span style={{ fontSize: '10px', color: '#64748B' }}></span>
            <span style={{ fontSize: '10px', color: '#64748B', textAlign: 'right' }}>{debitLabel}</span>
            <span style={{ fontSize: '10px', color: '#64748B', textAlign: 'right' }}>{creditLabel}</span>
          </div>

          {/* Opening balance */}
          <div style={{ display: 'grid', gridTemplateColumns: COLS, padding: '8px 12px', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', gap: '8px', fontStyle: 'italic', alignItems: 'center' }}>
            <span />
            <span style={{ color: '#64748B', fontSize: '11px' }}>{fmtDate(dateFrom)}</span>
            <span style={{ fontWeight: 600, color: '#475569' }}>Сальдо на початок</span>
            <span style={{ textAlign: 'right', fontWeight: 700, color: openingDebit > 0 ? '#DC2626' : '#94A3B8', fontFamily: 'monospace' }}>
              {openingDebit > 0.005 ? `${fmt(openingDebit)} ₴` : '—'}
            </span>
            <span style={{ textAlign: 'right', fontWeight: 700, color: openingCredit > 0 ? '#15803D' : '#94A3B8', fontFamily: 'monospace' }}>
              {openingCredit > 0.005 ? `${fmt(openingCredit)} ₴` : '—'}
            </span>
          </div>

          {/* Transaction rows */}
          {rows.length === 0 ? (
            <div style={{ padding: '32px', textAlign: 'center', color: '#94A3B8', fontSize: '13px' }}>
              Операцій за обраний період немає
            </div>
          ) : rows.map((row, idx) => (
            <div key={idx} style={{
              display: 'grid', gridTemplateColumns: COLS, padding: '8px 12px', gap: '8px', alignItems: 'center',
              borderBottom: idx < rows.length - 1 ? '1px solid #F1F5F9' : 'none',
              background: idx % 2 === 0 ? '#fff' : '#FAFBFC',
            }}>
              <span style={{ textAlign: 'center', color: '#94A3B8', fontSize: '11px' }}>{idx + 1}</span>
              <span style={{ color: '#64748B', fontSize: '11px', whiteSpace: 'nowrap' }}>{fmtDate(row.date)}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                {row.docLabel && row.docHref ? (
                  <Link href={row.docHref} className="act-no-print" style={{ fontWeight: 700, color: '#1D4ED8', textDecoration: 'none', fontFamily: 'monospace', fontSize: '12px', flexShrink: 0 }}>
                    {row.docLabel}
                  </Link>
                ) : row.docLabel ? (
                  <span style={{ fontFamily: 'monospace', fontSize: '12px', fontWeight: 700, color: '#475569', flexShrink: 0 }}>{row.docLabel}</span>
                ) : null}
                {row.docLabel && <span style={{ color: '#94A3B8', fontSize: '11px' }}>—</span>}
                <span style={{ color: '#1E293B', fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.description}</span>
                {row.orderNumber != null && (
                  <a href={`/admin?status=&q=${row.orderNumber}`} title="Відкрити замовлення"
                    style={{ color: '#1D4ED8', fontSize: '12px', fontWeight: 700, textDecoration: 'none', flexShrink: 0 }}>
                    #{row.orderNumber}
                  </a>
                )}
              </div>
              <span style={{ textAlign: 'right', fontWeight: row.debit > 0 ? 700 : 400, color: row.debit > 0 ? '#DC2626' : '#94A3B8', fontFamily: 'monospace' }}>
                {row.debit > 0.005 ? `${fmt(row.debit)} ₴` : ''}
              </span>
              <span style={{ textAlign: 'right', fontWeight: row.credit > 0 ? 700 : 400, color: row.credit > 0 ? '#15803D' : '#94A3B8', fontFamily: 'monospace' }}>
                {row.credit > 0.005 ? `${fmt(row.credit)} ₴` : ''}
              </span>
            </div>
          ))}

          {/* Turnover totals */}
          <div style={{ display: 'grid', gridTemplateColumns: COLS, padding: '9px 12px', gap: '8px', background: '#F1F5F9', borderTop: '2px solid #CBD5E1', fontWeight: 700, alignItems: 'center' }}>
            <span />
            <span />
            <span style={{ fontSize: '12px', color: '#475569', fontStyle: 'italic' }}>Обороти за період</span>
            <span style={{ textAlign: 'right', color: '#DC2626', fontFamily: 'monospace' }}>{totalDebit > 0 ? `${fmt(totalDebit)} ₴` : '—'}</span>
            <span style={{ textAlign: 'right', color: '#15803D', fontFamily: 'monospace' }}>{totalCredit > 0 ? `${fmt(totalCredit)} ₴` : '—'}</span>
          </div>

          {/* Closing balance */}
          <div style={{ display: 'grid', gridTemplateColumns: COLS, padding: '9px 12px', gap: '8px', background: '#EEF2F7', borderTop: '1px solid #CBD5E1', fontWeight: 700, alignItems: 'center' }}>
            <span />
            <span style={{ color: '#64748B', fontSize: '11px' }}>{fmtDate(dateTo)}</span>
            <span style={{ fontSize: '12px', color: '#1E293B', fontStyle: 'italic' }}>Сальдо на кінець</span>
            <span style={{ textAlign: 'right', fontFamily: 'monospace', color: closingDebit > 0.005 ? '#DC2626' : '#94A3B8' }}>
              {closingDebit > 0.005 ? `${fmt(closingDebit)} ₴` : '—'}
            </span>
            <span style={{ textAlign: 'right', fontFamily: 'monospace', color: closingCredit > 0.005 ? '#15803D' : '#94A3B8' }}>
              {closingCredit > 0.005 ? `${fmt(closingCredit)} ₴` : '—'}
            </span>
          </div>
        </div>

        {/* Signatures */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '40px', marginTop: '40px' }}>
          {['Від Сторони 1', 'Від Сторони 2'].map((label, i) => (
            <div key={i}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#1E293B', marginBottom: '8px' }}>{label}</div>
              <div style={{ fontSize: '11px', color: '#475569', marginBottom: '4px' }}>
                {i === 0 ? companyName : counterpartyName}
              </div>
              <div style={{ marginTop: '32px', borderTop: '1px solid #1E293B', paddingTop: '4px', fontSize: '11px', color: '#475569' }}>
                підпис, П.І.Б.
              </div>
              <div style={{ marginTop: '24px', borderTop: '1px solid #1E293B', paddingTop: '4px', fontSize: '11px', color: '#475569' }}>
                М.П.
              </div>
            </div>
          ))}
        </div>

        {/* Confirmation text */}
        <div style={{ marginTop: '24px', padding: '12px 16px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '6px', fontSize: '11px', color: '#64748B', lineHeight: '1.5' }}>
          Сторони підтверджують, що взаємна заборгованість за вказаний період відповідає даним бухгалтерського обліку кожної із сторін.
          Розбіжностей немає / Розбіжності вказані на зворотній стороні.
        </div>
      </div>

      <style>{`
        @media print {
          .act-no-print { display: none !important; }
          .act-print-area { padding: 0 !important; max-width: 100% !important; margin: 0 !important; }
          @page { size: A4 portrait; margin: 15mm 20mm; }
          body { font-size: 12px; }
        }
        @media screen {
          .act-print-area { border: 1px solid var(--border); border-radius: 12px; background: var(--bg-card); }
          .act-print-area > * { padding-left: 32px; padding-right: 32px; }
        }
      `}</style>
    </>
  );
}

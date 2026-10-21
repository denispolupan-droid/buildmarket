'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Printer, RefreshCw } from 'lucide-react';

/**
 * Акт звірки взаємних розрахунків — у формі, як його друкують постачальники з 1С:
 * дві половини «За даними нас / За даними контрагента» з колонками
 * Дата · Документ · Дебет · Кредит, сальдо початкове/кінцеве, обороти, фраза
 * «заборгованість на користь …» і підписи. Права половина порожня — її заповнює
 * контрагент. Так акт кладеться поруч з актом постачальника рядок у рядок.
 *
 * Дебет/кредит — з НАШОГО боку, за правилами обліку: у звірці з постачальником
 * поставки йдуть у кредит (наш борг), оплати й повернення — у дебет; у звірці з
 * покупцем відвантаження — дебет, оплати — кредит. Сторінки передають рядки вже
 * так; сальдо = початкове + дебет − кредит (плюс — на нашу користь).
 */
export type ActRow = {
  date: string;
  /** Колонка «Документ»: «Отримано (РН-2026-0612, #26101127)» */
  docText: string;
  /** Повний опис проводки — підказкою на екрані */
  description?: string;
  debit: number;
  credit: number;
  docHref: string | null;
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
  /** Сальдо на початок: плюс — на нашу користь (нам винні), мінус — винні ми */
  opening: number;
  rows: ActRow[];
  /** Наша сторона: назва ФОП і ПІБ підписанта (lib/company.ts) */
  ourName: string;
  ourSigner: string;
  mode: 'supplier' | 'customer';
};

function fmt(n: number) {
  return n.toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** 2026-10-21 → 21.10.2026 (без часових поясів: дата обліку — це вже дата) */
function fmtDate(d: string) {
  const [y, m, day] = d.slice(0, 10).split('-');
  return `${day}.${m}.${y}`;
}

const shortDate = (d: string) => fmtDate(d).replace(/\.(\d{2})(\d{2})$/, '.$2');

/** «Полупан Денис Олександрович» → «Полупан Д. О.» */
function initials(full: string) {
  const [last, ...rest] = full.trim().split(/\s+/);
  return [last, ...rest.map(p => `${p[0]}.`)].join(' ');
}

export default function ActClient({
  backHref, counterpartyName, counterpartyLegalName, counterpartyTaxId, counterpartyAddress,
  dateFrom, dateTo, opening, rows, ourName, ourSigner,
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
  const closing = Math.round((opening + totalDebit - totalCredit) * 100) / 100;
  const them = counterpartyLegalName?.trim() || counterpartyName;

  const bal = (v: number) => ({ debit: v > 0.005 ? fmt(v) : '', credit: v < -0.005 ? fmt(-v) : '' });
  const openingCells = bal(opening);
  const closingCells = bal(closing);

  // Плюс — на нашу користь, мінус — на користь контрагента
  const verdict = Math.abs(closing) < 0.005
    ? `на ${fmtDate(dateTo)} заборгованість відсутня`
    : `на ${fmtDate(dateTo)} заборгованість на користь ${closing > 0 ? ourName : them} ${fmt(Math.abs(closing))} грн`;

  const inp: React.CSSProperties = {
    height: '34px', padding: '0 10px',
    border: '1.5px solid var(--border)', borderRadius: '8px',
    fontSize: '13px', outline: 'none',
    color: 'var(--text-primary)', background: 'var(--bg-soft)',
  };

  const cell: React.CSSProperties = { border: '1px solid #000', padding: '3px 5px', verticalAlign: 'top' };
  const num: React.CSSProperties = { ...cell, textAlign: 'right', whiteSpace: 'nowrap' };
  const bold: React.CSSProperties = { fontWeight: 700 };

  return (
    <>
      {/* ── Screen-only controls ──────────────────────────────────────────── */}
      <div className="act-no-print" style={{ padding: '20px 32px', maxWidth: '1100px' }}>
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
              {counterpartyTaxId ? ` · ${counterpartyTaxId}` : ''}{counterpartyAddress ? ` · ${counterpartyAddress}` : ''}
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

      {/* ── Printable act (форма 1С) ─────────────────────────────────────── */}
      <div className="act-print-area" style={{ maxWidth: '980px', margin: '0 auto', padding: '24px 32px 48px', color: '#000', fontFamily: 'Arial, sans-serif', fontSize: '11px', lineHeight: 1.35 }}>
        <div style={{ textAlign: 'center', marginBottom: '10px' }}>
          <div style={{ fontSize: '15px', fontWeight: 700 }}>Акт звірки</div>
          <div style={{ fontSize: '12px', fontWeight: 700 }}>
            взаємних розрахунків станом за період: {fmtDate(dateFrom)} - {fmtDate(dateTo)}
          </div>
          <div style={{ fontSize: '12px', fontWeight: 700 }}>між {ourName}</div>
          <div style={{ fontSize: '12px', fontWeight: 700 }}>і {them}</div>
        </div>

        <p style={{ margin: '0 0 10px', textAlign: 'justify' }}>
          Ми, що нижче підписалися, _______________________ {ourName} {initials(ourSigner)}, з одного боку,
          і _______________________ {them} _______________________, з другого боку, склали цей акт звірки
          про те, що стан взаємних розрахунків за даними обліку такий:
        </p>

        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: '9%' }} /><col style={{ width: '21%' }} /><col style={{ width: '10%' }} /><col style={{ width: '10%' }} />
            <col style={{ width: '9%' }} /><col style={{ width: '21%' }} /><col style={{ width: '10%' }} /><col style={{ width: '10%' }} />
          </colgroup>
          <thead>
            <tr>
              <th colSpan={4} style={{ ...cell, textAlign: 'left', fontWeight: 400 }}>За даними {ourName}, грн</th>
              <th colSpan={4} style={{ ...cell, textAlign: 'left', fontWeight: 400 }}>За даними {them}, грн</th>
            </tr>
            <tr>
              {['Дата', 'Документ', 'Дебет', 'Кредит', 'Дата', 'Документ', 'Дебет', 'Кредит'].map((h, i) => (
                <th key={i} style={{ ...cell, ...bold, textAlign: 'center' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={2} style={{ ...cell, ...bold }}>Сальдо початкове</td>
              <td style={{ ...num, ...bold }}>{openingCells.debit}</td>
              <td style={{ ...num, ...bold }}>{openingCells.credit}</td>
              <td colSpan={2} style={{ ...cell, ...bold }}>Сальдо початкове</td>
              <td style={num} /><td style={num} />
            </tr>
            {rows.map((r, i) => (
              <tr key={i}>
                <td style={cell}>{shortDate(r.date)}</td>
                <td style={cell} title={r.description}>
                  {r.docText}
                  {r.orderNumber != null && (
                    <a href={`/admin?status=&q=${r.orderNumber}`} className="act-no-print"
                      style={{ marginLeft: '4px', color: '#1D4ED8', textDecoration: 'none', fontWeight: 700 }}>↗</a>
                  )}
                </td>
                <td style={num}>{r.debit > 0.005 ? fmt(r.debit) : ''}</td>
                <td style={num}>{r.credit > 0.005 ? fmt(r.credit) : ''}</td>
                <td style={cell} /><td style={cell} /><td style={num} /><td style={num} />
              </tr>
            ))}
            <tr>
              <td colSpan={2} style={{ ...cell, ...bold }}>Обороти за період</td>
              <td style={{ ...num, ...bold }}>{totalDebit > 0.005 ? fmt(totalDebit) : ''}</td>
              <td style={{ ...num, ...bold }}>{totalCredit > 0.005 ? fmt(totalCredit) : ''}</td>
              <td colSpan={2} style={{ ...cell, ...bold }}>Обороти за період</td>
              <td style={num} /><td style={num} />
            </tr>
            <tr>
              <td colSpan={2} style={{ ...cell, ...bold }}>Сальдо кінцеве</td>
              <td style={{ ...num, ...bold }}>{closingCells.debit}</td>
              <td style={{ ...num, ...bold }}>{closingCells.credit}</td>
              <td colSpan={2} style={{ ...cell, ...bold }}>Сальдо кінцеве</td>
              <td style={num} /><td style={num} />
            </tr>
          </tbody>
        </table>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginTop: '12px' }}>
          <div>
            <div>За даними {ourName}</div>
            <div style={bold}>{verdict}</div>
          </div>
          <div>За даними {them}</div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginTop: '28px' }}>
          {[{ who: ourName, signer: `(${initials(ourSigner)})` }, { who: them, signer: '(_______________________)' }].map((p, i) => (
            <div key={i}>
              <div>Від {p.who}</div>
              <div style={{ marginTop: '22px' }}>________________</div>
              <div style={{ marginTop: '2px' }}>{p.signer}</div>
              <div style={{ marginTop: '14px' }}>М.П.</div>
            </div>
          ))}
        </div>

        {rows.length === 0 && (
          <div className="act-no-print" style={{ marginTop: '16px', color: '#64748B' }}>Операцій за обраний період немає</div>
        )}
      </div>

      <style>{`
        @media print {
          .act-no-print { display: none !important; }
          .act-print-area { padding: 0 !important; max-width: 100% !important; margin: 0 !important; }
          @page { size: A4 portrait; margin: 12mm 12mm; }
        }
        @media screen {
          .act-print-area { border: 1px solid var(--border); border-radius: 12px; background: #fff; }
        }
      `}</style>
    </>
  );
}

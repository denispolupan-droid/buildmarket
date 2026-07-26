'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';

export type PLData = {
  revenue:        number;
  cogs:           number;
  gross_profit:   number;
  landed_costs:   number;
  gross_after_lc: number;
  op_expenses:    number;
  marketplace_commission: number;
  np_delivery:    number;
  op_profit:      number;
  by_channel:     { channel: string; revenue: number; cogs: number; commission: number }[];
  by_expense:     { type: string; amount: number }[];
};

export type CFData = {
  opening:   number;
  closing:   number;
  inflows:   { key: string; amount: number }[];
  outflows:  { key: string; amount: number }[];
  by_account: { account: string; in: number; out: number }[];
  balances:  { monobank: number; novapay: number; cash: number };
};

const CF_INFLOW_LABELS: Record<string, string> = {
  customers: 'Оплати клієнтів', cod: 'Накладені платежі (НоваПей)',
  cash_in: 'Внесення готівки', other_in: 'Інші надходження',
};
const CF_OUTFLOW_LABELS: Record<string, string> = {
  suppliers: 'Оплата постачальникам', mp_topup: 'Поповнення маркетплейсів',
  np_payout: 'Виплата НоваПей → банк', expenses: 'Операційні витрати',
  other_out: 'Інші видатки',
};

const CHANNEL_LABELS: Record<string, string> = {
  website: 'Сайт', prom: 'Prom.ua', rozetka: 'Rozetka',
  b2b: 'Опт (B2B)', phone: 'Телефон', retail: 'Роздріб', dropship: 'Дроп',
};

const EXPENSE_LABELS: Record<string, string> = {
  logistics: 'Доставка', loading: 'Навантаження', customs: 'Мито/брокер',
  packaging: 'Пакування', acquiring_fee: 'Комісія еквайрингу',
  marketplace_fee: 'Комісія маркетплейсу', np_delivery: 'Доставка НП (наш рахунок)', rent: 'Оренда',
  salary: 'Зарплата', marketing: 'Маркетинг', opex: 'Інші витрати',
  other: 'Інше (каса)',
};

const ACCOUNT_LABELS: Record<string, string> = {
  monobank: 'Монобанк', novapay: 'НоваПей (COD)', cash: 'Каса',
  bank: 'Банк', acquiring: 'Еквайринг',
};

function fmt(n: number, digits = 0) {
  return Math.abs(n).toLocaleString('uk-UA', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function pct(part: number, total: number) {
  if (!total) return '—';
  return `${Math.round(Math.abs(part) / Math.abs(total) * 100)}%`;
}

type Props = {
  pl:        PLData;
  cf:        CFData;
  dateFrom:  string;
  dateTo:    string;
};

const PRESETS = [
  { label: 'Цей місяць',     key: 'cur_month' },
  { label: 'Минулий місяць', key: 'prev_month' },
  { label: 'Цей квартал',    key: 'cur_quarter' },
  { label: 'З початку року', key: 'ytd' },
];

export default function ReportsClient({ pl, cf, dateFrom, dateTo }: Props) {
  const router      = useRouter();
  const searchParams = useSearchParams();
  const [from, setFrom] = useState(dateFrom);
  const [to,   setTo]   = useState(dateTo);
  const [tab,  setTab]  = useState<'pl' | 'cf'>('pl');

  function applyPeriod(from: string, to: string) {
    const p = new URLSearchParams(searchParams.toString());
    p.set('from', from); p.set('to', to);
    router.push(`/admin/finance/reports?${p}`);
  }

  function applyPreset(key: string) {
    const now = new Date();
    let f: Date, t: Date = now;
    if (key === 'cur_month') {
      f = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (key === 'prev_month') {
      f = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      t = new Date(now.getFullYear(), now.getMonth(), 0);
    } else if (key === 'cur_quarter') {
      const q = Math.floor(now.getMonth() / 3);
      f = new Date(now.getFullYear(), q * 3, 1);
    } else { // ytd
      f = new Date(now.getFullYear(), 0, 1);
    }
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    setFrom(fmt(f)); setTo(fmt(t));
    applyPeriod(fmt(f), fmt(t));
  }

  const inp: React.CSSProperties = {
    height: '34px', padding: '0 10px', borderRadius: '8px',
    border: '1px solid var(--border)', background: 'var(--bg-card)',
    fontSize: '13px', color: 'var(--text-primary)', outline: 'none',
  };

  // ── P&L rows ────────────────────────────────────────────────────────────────
  const plRows = [
    { label: 'Виручка',                     value: pl.revenue,        bold: true,  color: '#1E3A5F',             pctOf: null },
    { label: 'Собівартість (FIFO)',          value: -pl.cogs,          bold: false, color: '#DC2626',             pctOf: pl.revenue },
    { label: 'Валовий прибуток',            value: pl.gross_profit,   bold: true,  color: pl.gross_profit >= 0 ? '#15803D' : '#DC2626', pctOf: pl.revenue, sep: true },
    { label: 'Landed Costs (доп. витрати)', value: -pl.landed_costs,  bold: false, color: '#7C3AED',             pctOf: pl.revenue },
    { label: 'Прибуток після LC',           value: pl.gross_after_lc, bold: true,  color: pl.gross_after_lc >= 0 ? '#15803D' : '#DC2626', pctOf: pl.revenue, sep: true },
    { label: 'Операційні витрати',          value: -pl.op_expenses,   bold: false, color: '#B45309',             pctOf: pl.revenue },
    { label: 'Комісія маркетплейсів',       value: -pl.marketplace_commission, bold: false, color: '#B45309',    pctOf: pl.revenue },
    { label: 'Доставка НП (за наш рахунок)', value: -pl.np_delivery,  bold: false, color: '#B45309',             pctOf: pl.revenue },
    { label: 'Операційний прибуток',        value: pl.op_profit,      bold: true,  color: pl.op_profit >= 0 ? '#15803D' : '#DC2626', pctOf: pl.revenue, sep: true, big: true },
  ];

  return (
    <div>
      {/* ── Period controls ── */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '14px 18px', marginBottom: '20px', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
        {PRESETS.map(p => (
          <button key={p.key} onClick={() => applyPreset(p.key)} style={{
            height: '34px', padding: '0 14px', borderRadius: '8px', border: '1px solid var(--border)',
            background: 'var(--bg-soft)', fontSize: '12px', fontWeight: 600,
            color: 'var(--text-secondary)', cursor: 'pointer',
          }}>{p.label}</button>
        ))}
        <div style={{ width: '1px', height: '24px', background: 'var(--border)', margin: '0 4px' }} />
        <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={{ ...inp, width: '138px' }} />
        <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>—</span>
        <input type="date" value={to}   onChange={e => setTo(e.target.value)}   style={{ ...inp, width: '138px' }} />
        <button onClick={() => applyPeriod(from, to)} style={{
          height: '34px', padding: '0 16px', borderRadius: '8px', border: 'none',
          background: '#1E3A5F', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer',
        }}>Показати</button>
      </div>

      {/* ── Tabs ── */}
      <div style={{ display: 'flex', gap: '0', marginBottom: '16px', borderBottom: '2px solid var(--border)' }}>
        {([
          { key: 'pl', label: '📊 Звіт про прибутки та збитки (P&L)' },
          { key: 'cf', label: '💵 Рух грошових коштів (Cash Flow)' },
        ] as const).map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: '10px 20px', fontSize: '13px', fontWeight: 700, cursor: 'pointer',
            border: 'none', borderBottom: tab === t.key ? '2px solid #1E3A5F' : '2px solid transparent',
            marginBottom: '-2px', background: 'none',
            color: tab === t.key ? '#1E3A5F' : 'var(--text-muted)',
          }}>{t.label}</button>
        ))}
      </div>

      {/* ══ P&L ══════════════════════════════════════════════════════════════════ */}
      {tab === 'pl' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '20px' }}>

          {/* Main P&L */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
              Звіт про прибутки та збитки
            </div>
            {plRows.map((row, i) => (
              <div key={i}>
                {row.sep && i > 0 && <div style={{ height: '1px', background: 'var(--border)' }} />}
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: row.big ? '14px 20px' : '10px 20px',
                  background: row.big ? 'var(--bg-soft)' : 'transparent',
                  borderTop: row.sep ? '1px solid var(--border)' : 'none',
                }}>
                  <span style={{ fontSize: row.big ? '14px' : '13px', fontWeight: row.bold ? 700 : 400, color: 'var(--text-primary)' }}>
                    {row.label}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    {row.pctOf !== null && (
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)', minWidth: '36px', textAlign: 'right' }}>
                        {pct(row.value, row.pctOf)}
                      </span>
                    )}
                    <span style={{
                      fontSize: row.big ? '18px' : '14px',
                      fontWeight: row.bold ? 800 : 500,
                      color: row.color,
                      fontVariantNumeric: 'tabular-nums',
                      minWidth: '140px', textAlign: 'right',
                    }}>
                      {row.value >= 0 ? '' : '−'}{fmt(row.value, 2)} ₴
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Side panels */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

            {/* By channel */}
            {pl.by_channel.length > 0 && (
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  По каналах
                </div>
                {pl.by_channel.map(ch => {
                  const margin = ch.revenue - ch.cogs - ch.commission;
                  const pctVal = pl.revenue > 0 ? Math.round(ch.revenue / pl.revenue * 100) : 0;
                  return (
                    <div key={ch.channel} style={{ padding: '9px 16px', borderTop: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>
                          {CHANNEL_LABELS[ch.channel] ?? ch.channel}
                          <span style={{ fontSize: '10px', color: 'var(--text-muted)', marginLeft: '6px' }}>{pctVal}%</span>
                        </div>
                        <div style={{ fontSize: '11px', color: margin >= 0 ? '#15803D' : '#DC2626', marginTop: '1px' }}>
                          прибуток: {fmt(margin, 0)} ₴
                        </div>
                      </div>
                      <span style={{ fontSize: '13px', fontWeight: 700, color: '#1E3A5F' }}>{fmt(ch.revenue, 0)} ₴</span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* By expense type */}
            {pl.by_expense.length > 0 && (
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                  Витрати по категоріях
                </div>
                {pl.by_expense.map(e => (
                  <div key={e.type} style={{ padding: '8px 16px', borderTop: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-primary)' }}>{EXPENSE_LABELS[e.type] ?? e.type}</span>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#B45309' }}>{fmt(e.amount, 2)} ₴</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══ Cash Flow ═══════════════════════════════════════════════════════════ */}
      {tab === 'cf' && (
        <>
        {/* Стан рахунків — поточні залишки (усього, не за період) */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '20px' }}>
          {([
            { key: 'monobank', label: 'Монобанк',      hint: 'сайт-картка + рахунок', value: cf.balances.monobank },
            { key: 'novapay',  label: 'НоваПей (COD)', hint: 'наложені платежі',      value: cf.balances.novapay },
            { key: 'cash',     label: 'Каса',          hint: 'готівка',               value: cf.balances.cash },
          ]).map(a => (
            <div key={a.key} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '14px 18px' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.03em' }}>{a.label}</div>
              <div style={{ fontSize: '22px', fontWeight: 800, color: a.value >= 0 ? '#15803D' : '#DC2626', marginTop: '4px', fontVariantNumeric: 'tabular-nums' }}>
                {fmt(a.value, 2)} ₴
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{a.hint}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '20px' }}>

          {/* Main CF statement */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
              Рух грошових коштів
            </div>
            {[
              { label: 'Залишок на початок', value: cf.opening, bold: true, color: '#1E3A5F', indent: false, sep: false, big: false },
              ...cf.inflows.map(f  => ({ label: `+ ${CF_INFLOW_LABELS[f.key]  ?? f.key}`, value: f.amount, bold: false, color: '#15803D', indent: true, sep: false, big: false })),
              ...cf.outflows.map(f => ({ label: `− ${CF_OUTFLOW_LABELS[f.key] ?? f.key}`, value: f.amount, bold: false, color: '#DC2626', indent: true, sep: false, big: false })),
              { label: 'Залишок на кінець', value: cf.closing, bold: true, color: cf.closing >= 0 ? '#15803D' : '#DC2626', indent: false, sep: true, big: true },
            ].map((row, i) => (
              <div key={i} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: row.big ? '14px 20px' : '10px 20px',
                paddingLeft: row.indent ? '32px' : '20px',
                background: row.big ? 'var(--bg-soft)' : 'transparent',
                borderTop: row.sep ? '2px solid var(--border)' : i > 0 ? '1px solid var(--border-light)' : 'none',
              }}>
                <span style={{ fontSize: row.big ? '14px' : '13px', fontWeight: row.bold ? 700 : 400, color: 'var(--text-primary)' }}>
                  {row.label}
                </span>
                <span style={{
                  fontSize: row.big ? '18px' : '14px', fontWeight: row.bold ? 800 : 500,
                  color: row.value === 0 ? 'var(--text-muted)' : row.color,
                  fontVariantNumeric: 'tabular-nums', minWidth: '140px', textAlign: 'right',
                }}>
                  {row.value === 0 ? '—' : `${fmt(row.value, 2)} ₴`}
                </span>
              </div>
            ))}
          </div>

          {/* By account */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              По рахунках
            </div>
            {cf.by_account.map(a => (
              <div key={a.account} style={{ padding: '12px 16px', borderTop: '1px solid var(--border-light)' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>
                  {ACCOUNT_LABELS[a.account] ?? a.account}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
                  <span style={{ color: '#15803D' }}>↓ Надійшло</span>
                  <span style={{ fontWeight: 600, color: '#15803D' }}>{fmt(a.in, 2)} ₴</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '6px' }}>
                  <span style={{ color: '#DC2626' }}>↑ Вибуло</span>
                  <span style={{ fontWeight: 600, color: '#DC2626' }}>{fmt(a.out, 2)} ₴</span>
                </div>
                <div style={{ height: '1px', background: 'var(--border-light)', margin: '6px 0' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Нетто</span>
                  <span style={{
                    fontWeight: 700,
                    color: (a.in - a.out) >= 0 ? '#15803D' : '#DC2626',
                  }}>{fmt(a.in - a.out, 2)} ₴</span>
                </div>
              </div>
            ))}
          </div>
        </div>
        </>
      )}
    </div>
  );
}

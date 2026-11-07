import type React from 'react';
import type { ProfitBridge, BridgeLine } from '../../../lib/accounting/profit-bridge-rules';
import { fmtInt, fmtMoney } from '../../../lib/format';

/**
 * «Від замовлень до обліку» — той самий блок на «Огляді» й «Аналітиці»
 * (lib/accounting/profit-bridge): виручка й прибуток по замовленнях періоду
 * розкладені по рядках до факту обліку; кожен рядок розгортається в
 * розшифровку (замовлення або види зборів із сумами). Рядок «нерозкладено»
 * з'являється лише якщо сума рядків не зійшлась — це баг, а не нюанс.
 */
export type BridgeWithNet = ProfitBridge & { opex: number; opexBy?: Record<string, number>; taxes: number; net: number };

const OPEX_UA: Record<string, string> = {
  logistics: 'логістика (закупівлі, компенсації НП)', loading: 'вантажні роботи', customs: 'митниця', packaging: 'пакування',
  rent: 'оренда', salary: 'зарплата', marketing: 'реклама', opex: 'інші операційні', bad_debt: 'списані борги / компенсації клієнтам',
  other: 'видачі з каси (РКО)',
};

const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${fmtInt(Math.abs(n))} ₴`;
const signedExact = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${fmtMoney(Math.abs(n))} ₴`;
const colorOf = (n: number) => (n < 0 ? '#C2410C' : 'var(--color-success)');

const rowStyle: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: '12px', padding: '7px 0', borderBottom: '1px solid var(--border-light, var(--border))', fontSize: '13px' };
const numStyle: React.CSSProperties = { fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', fontWeight: 600 };

function Line({ l }: { l: BridgeLine }) {
  const head = (
    <>
      <span style={{ color: 'var(--text-secondary)', minWidth: 0 }}>
        {l.label}{l.details?.length ? <span className="fin-hint-toggle" style={{ marginLeft: 6 }}>розшифровка</span> : null}
      </span>
      <span style={{ ...numStyle, color: colorOf(l.amount) }}>{signed(l.amount)}</span>
    </>
  );
  if (!l.details?.length) return <div style={rowStyle} title={l.hint}>{head}</div>;
  return (
    <details style={{ borderBottom: '1px solid var(--border-light, var(--border))' }}>
      <summary style={{ ...rowStyle, borderBottom: 'none', cursor: 'pointer', listStyle: 'none' }} title={l.hint}>{head}</summary>
      <div style={{ padding: '2px 0 10px 12px' }}>
        {l.hint && <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', margin: '0 0 6px' }}>{l.hint}</div>}
        {l.details.map((d, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', padding: '3px 0', fontSize: '12px' }}>
            <span style={{ minWidth: 0 }}>
              <span style={{ color: 'var(--text-primary)' }}>{d.label}</span>
              {d.sub && <span style={{ display: 'block', color: 'var(--text-muted)', fontSize: '11px', overflowWrap: 'anywhere' }}>{d.sub}</span>}
            </span>
            <span style={{ ...numStyle, fontWeight: 500, color: colorOf(d.amount) }}>{signedExact(d.amount)}</span>
          </div>
        ))}
      </div>
    </details>
  );
}

function Block({ title, startLabel, b, factLabel, tail }: { title: string; startLabel: string; b: ProfitBridge['revenue']; factLabel: string; tail?: React.ReactNode }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div className="fin-card-title" style={{ fontSize: '13px' }}>{title}</div>
      <div style={{ ...rowStyle, fontWeight: 600 }}>
        <span>{startLabel}</span><span style={{ ...numStyle, fontWeight: 700 }}>{fmtInt(b.start)} ₴</span>
      </div>
      {b.lines.map(l => <Line key={l.key} l={l} />)}
      {Math.abs(b.unexplained) >= 0.5 && (
        <div style={{ ...rowStyle, color: 'var(--color-danger)', fontWeight: 600 }}>
          <span>нерозкладено (помилка звірки)</span><span style={numStyle}>{signed(b.unexplained)}</span>
        </div>
      )}
      <div style={{ ...rowStyle, fontWeight: 700, borderBottom: tail ? rowStyle.borderBottom : 'none' }}>
        <span>{factLabel}</span><span style={{ ...numStyle, fontWeight: 800 }}>{fmtInt(b.fact)} ₴</span>
      </div>
      {tail}
    </div>
  );
}

export default function ProfitBridgeCard({ bridge, periodLabel }: { bridge: BridgeWithNet; periodLabel: string }) {
  // Чистий факт — продовження валового: ті самі проводки, мінус операційні витрати й податки
  const netRows = (
    <>
      <Line l={{
        key: 'opex', label: 'операційні витрати і компенсації', amount: Math.round(-bridge.opex * 100) / 100,
        hint: 'Компенсації (напр. НП за пошкоджену посилку) зменшують витрати — тому сума буває зі знаком «+».',
        details: Object.entries(bridge.opexBy ?? {}).filter(([, v]) => Math.abs(v) >= 0.01).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
          .map(([k, v]) => ({ label: OPEX_UA[k] ?? k, amount: Math.round(-v * 100) / 100 })),
      }} />
      <div style={rowStyle}>
        <span style={{ color: 'var(--text-secondary)' }}>податки</span>
        <span style={{ ...numStyle, color: colorOf(-bridge.taxes) }}>{signed(-bridge.taxes)}</span>
      </div>
      <div style={{ ...rowStyle, fontWeight: 700, borderBottom: 'none' }}>
        <span>Чистий прибуток · факт обліку</span>
        <span style={{ ...numStyle, fontWeight: 800, color: bridge.net >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>{fmtInt(bridge.net)} ₴</span>
      </div>
    </>
  );
  return (
    <div className="fin-card" style={{ marginBottom: '16px' }}>
      <div className="fin-card-title">
        Від замовлень до обліку · {periodLabel}
        <span className="fin-card-sub"> · чому сума замовлень і прибуток по них не дорівнюють факту з бухгалтерських проводок — по рядках; кожен рядок розгортається до замовлень і видів зборів</span>
      </div>
      <div className="fin-two-col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginTop: '6px' }}>
        <Block title="Виручка" startLabel="Замовлення · сума (створені за період)" b={bridge.revenue} factLabel="Виручка · факт обліку" />
        <Block title="Прибуток" startLabel="Прибуток вручених замовлень періоду" b={bridge.profit} factLabel="Валовий прибуток · факт обліку" tail={netRows} />
      </div>
    </div>
  );
}

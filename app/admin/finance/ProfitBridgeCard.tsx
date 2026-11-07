import type React from 'react';
import type { ProfitBridge, BridgeLine } from '../../../lib/accounting/profit-bridge-rules';
import { fmtInt, fmtMoney } from '../../../lib/format';

/**
 * «Розбір: від замовлень до виручки і прибутку» — лише в «Аналітиці» (рішення
 * власника 07.11.2026: «Огляд» — поточний стан коротко, «Аналітика» — детально).
 * Згорнутий за замовчуванням (рішення власника 07.11.2026), «розгорнути»: ліворуч шлях «сума замовлень → виручка», праворуч «з вручених
 * замовлень → валовий → операційні витрати за статтями → податки → чистий».
 * Кожен рядок розгортається до замовлень і видів зборів. Усе з одного читання
 * леджера (lib/accounting/profit-bridge); чистий = валовий цього ж читання −
 * опер. витрати − податки. Рядок «нерозкладено» з'являється лише якщо сума рядків
 * не зійшлась — це баг, а не нюанс.
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
const r2 = (n: number) => Math.round(n * 100) / 100;

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

function Plain({ label, value, bold, color }: { label: React.ReactNode; value: string; bold?: boolean; color?: string }) {
  return (
    <div style={{ ...rowStyle, fontWeight: bold ? 700 : 400 }}>
      <span style={{ color: bold ? 'var(--text-primary)' : 'var(--text-secondary)', minWidth: 0 }}>{label}</span>
      <span style={{ ...numStyle, fontWeight: bold ? 800 : 600, color }}>{value}</span>
    </div>
  );
}

export default function ProfitBridgeCard({ bridge, periodLabel }: { bridge: BridgeWithNet; periodLabel: string }) {
  const b = bridge;
  const unexpl = (n: number) => Math.abs(n) >= 0.5 && (
    <Plain label={<span style={{ color: 'var(--color-danger)' }}>нерозкладено (помилка звірки)</span>} value={signed(n)} color="var(--color-danger)" />
  );
  return (
    <details className="fin-card fin-collapse" style={{ marginBottom: '6px' }}>
      <summary>
        <span className="fin-card-title" style={{ margin: 0 }}>
          Розбір: від замовлень до виручки і прибутку · {periodLabel}
          <span className="fin-card-sub"> · з бухгалтерських проводок; кожен рядок розгортається до замовлень і видів зборів</span>
        </span>
        <span className="fin-collapse-toggle"><span className="when-closed">розгорнути ▾</span><span className="when-open">згорнути ▴</span></span>
      </summary>
      <div className="fin-two-col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '28px', marginTop: '8px', alignItems: 'start' }}>
        <div style={{ minWidth: 0 }}>
          <div className="fin-card-title" style={{ fontSize: '12.5px' }}>Виручка</div>
          <Plain label="замовлення за період (створені, без нових і скасованих)" value={`${fmtInt(b.revenue.start)} ₴`} />
          {b.revenue.lines.map(l => <Line key={l.key} l={l} />)}
          {unexpl(b.revenue.unexplained)}
          <Plain label="= виручка · факт обліку" value={`${fmtInt(b.revenue.fact)} ₴`} bold />
        </div>
        <div style={{ minWidth: 0 }}>
          <div className="fin-card-title" style={{ fontSize: '12.5px' }}>Прибуток</div>
          <Plain label="з вручених замовлень періоду" value={`${fmtInt(b.profit.start)} ₴`} />
          {b.profit.lines.map(l => <Line key={l.key} l={l} />)}
          {unexpl(b.profit.unexplained)}
          <Plain label="= валовий прибуток" value={`${fmtInt(b.profit.fact)} ₴`} bold />
          <Line l={{
            key: 'opex', label: 'операційні витрати і компенсації', amount: r2(-b.opex),
            hint: 'Компенсації (напр. НП за пошкоджену посилку) зменшують витрати — тому сума буває зі знаком «+».',
            details: Object.entries(b.opexBy ?? {}).filter(([, v]) => Math.abs(v) >= 0.01).sort((x, y) => Math.abs(y[1]) - Math.abs(x[1]))
              .map(([k, v]) => ({ label: OPEX_UA[k] ?? k, amount: r2(-v) })),
          }} />
          <Plain label="податки" value={signed(-b.taxes)} color={colorOf(-b.taxes)} />
          <Plain label="= чистий прибуток" value={`${fmtInt(b.net)} ₴`} bold color={b.net >= 0 ? 'var(--color-success)' : 'var(--color-danger)'} />
        </div>
      </div>
    </details>
  );
}

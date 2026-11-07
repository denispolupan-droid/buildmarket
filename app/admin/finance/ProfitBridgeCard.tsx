import type React from 'react';
import { Info } from 'lucide-react';
import type { ProfitBridge, BridgeLine } from '../../../lib/accounting/profit-bridge-rules';
import { fmtInt, fmtMoney } from '../../../lib/format';
import { TrendBadge } from './overview-charts';

/**
 * Дві картки ФАКТУ обліку — «Виручка» і «Прибуток» — на «Огляді» й «Аналітиці»
 * (рішення власника 07.11.2026: замість 4 KPI-карток + окремого блоку, які
 * дублювали одне одного). Усі цифри — з ОДНОГО читання леджера
 * (lib/accounting/profit-bridge): виручка, валовий і чистий не можуть розійтися
 * (07.11 картки й блок прочитали облік у різні моменти — різниця 1 210 ₴).
 *
 * Виручка: шлях від суми замовлень періоду до проведеної виручки (кожен рядок
 * розгортається до замовлень). Прибуток: валовий і чистий, маржа, прогноз по
 * замовленнях у дорозі; «показати розрахунок» — склад валового (з вручених
 * замовлень − збори по скасованих − витрати без замовлення …) і далі до чистого.
 * Рядок «нерозкладено» з'являється лише якщо сума рядків не зійшлась — це баг.
 */
export type BridgeWithNet = ProfitBridge & { opex: number; opexBy?: Record<string, number>; taxes: number; net: number };

export type FactExtras = {
  revenuePrev?: number | null;
  grossPrev?: number | null;
  netPrev?: number | null;
  orders?: number;
  avgCheck?: number | null;
  /** прогноз валового по замовленнях у роботі й у дорозі */
  forecastProfit?: number;
};

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

function Plain({ label, value, bold, color, muted }: { label: React.ReactNode; value: string; bold?: boolean; color?: string; muted?: boolean }) {
  return (
    <div style={{ ...rowStyle, fontWeight: bold ? 700 : 400 }}>
      <span style={{ color: muted ? 'var(--text-muted)' : bold ? 'var(--text-primary)' : 'var(--text-secondary)', minWidth: 0 }}>{label}</span>
      <span style={{ ...numStyle, fontWeight: bold ? 800 : 600, color }}>{value}</span>
    </div>
  );
}

function Head({ label, hint }: { label: string; hint: string }) {
  return (
    <div className="fin-stat-head">
      <span className="fin-stat-label">{label}</span>
      <span className="fin-stat-tag fact">факт</span>
      <span className="fin-stat-info" title={hint} aria-label={hint}><Info size={14} strokeWidth={2} aria-hidden /></span>
    </div>
  );
}

/** showNet=false — лише валовий («Огляд»); чистий з операційними витратами розбирається в «Аналітиці» (рішення власника 07.11.2026). */
export default function ProfitBridgeCard({ bridge, periodLabel, extras = {}, showNet = true }: { bridge: BridgeWithNet; periodLabel: string; extras?: FactExtras; showNet?: boolean }) {
  const b = bridge;
  const gross = b.profit.fact;
  const net = b.net;
  const margin = b.revenue.fact > 0 ? Math.round(gross / b.revenue.fact * 1000) / 10 : null;
  const unexpl = (n: number) => Math.abs(n) >= 0.5 && (
    <Plain label={<span style={{ color: 'var(--color-danger)' }}>нерозкладено (помилка звірки)</span>} value={signed(n)} color="var(--color-danger)" />
  );

  return (
    <div className="fin-two-col fin-fact-cards">
      {/* ── Виручка ── */}
      <div className="fin-card fin-stat">
        <Head label={`Виручка · ${periodLabel}`}
          hint="Проведені продажі з обліку (продаж фіксується в день вручення). Нижче — як до неї доходить сума замовлень періоду; кожен рядок розгортається до замовлень." />
        <div className="fin-stat-value">{fmtInt(b.revenue.fact)} ₴</div>
        <div className="fin-stat-delta">
          {extras.revenuePrev !== undefined && <TrendBadge cur={b.revenue.fact} prev={extras.revenuePrev ?? null} />}
          <span className="fin-kpi-cmp">до попереднього періоду</span>
        </div>
        <div style={{ marginTop: '12px' }}>
          <Plain label={`замовлення за період${extras.orders ? ` · ${fmtInt(extras.orders)}${extras.avgCheck ? ` · чек ${fmtInt(extras.avgCheck)} ₴` : ''}` : ''}`} value={`${fmtInt(b.revenue.start)} ₴`} />
          {b.revenue.lines.map(l => <Line key={l.key} l={l} />)}
          {unexpl(b.revenue.unexplained)}
          <Plain label="= виручка · факт обліку" value={`${fmtInt(b.revenue.fact)} ₴`} bold />
        </div>
      </div>

      {/* ── Прибуток ── */}
      <div className="fin-card fin-stat">
        <Head label={`${showNet ? 'Прибуток' : 'Валовий прибуток'} · ${periodLabel}`}
          hint={`Валовий — виручка мінус собівартість FIFO і всі прямі витрати на продажі (комісії площадок, НП, RozetkaPay, еквайринг, збори по скасованих, абонплата, Smart). ${showNet ? 'Чистий — ще мінус операційні витрати й податки. ' : 'Чистий прибуток (після операційних витрат і податків) — в «Аналітиці». '}Усе з бухгалтерських проводок.`} />
        <div style={{ display: 'flex', gap: '28px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <div className="fin-stat-value" style={{ color: gross >= 0 ? '#15803D' : '#DC2626' }}>{fmtInt(gross)} ₴</div>
            <div className="fin-stat-delta">
              <span className="fin-kpi-cmp">валовий</span>
              {extras.grossPrev !== undefined && <TrendBadge cur={gross} prev={extras.grossPrev ?? null} />}
            </div>
          </div>
          {showNet && <div>
            <div className="fin-stat-value" style={{ fontSize: '22px', color: net >= 0 ? '#15803D' : '#DC2626' }}>{fmtInt(net)} ₴</div>
            <div className="fin-stat-delta">
              <span className="fin-kpi-cmp">чистий</span>
              {extras.netPrev !== undefined && <TrendBadge cur={net} prev={extras.netPrev ?? null} />}
            </div>
          </div>}
        </div>
        <div style={{ marginTop: '12px' }}>
          <Plain label="маржа валового від виручки" value={margin === null ? '—' : `${margin}%`} />
          {extras.forecastProfit !== undefined && (
            <Plain label="очікується з доставок (прогноз, у факт ще не входить)" value={`+${fmtInt(extras.forecastProfit)} ₴`} muted />
          )}
          <details className="fin-bridge-block">
            <summary className="fin-bridge-sum">
              <span className="fin-bridge-toggle"><span className="when-closed">показати розрахунок ▾</span><span className="when-open">згорнути розрахунок ▴</span></span>
            </summary>
            <Plain label="з вручених замовлень періоду (до витрат без замовлення)" value={`${fmtInt(b.profit.start)} ₴`} />
            {b.profit.lines.map(l => <Line key={l.key} l={l} />)}
            {unexpl(b.profit.unexplained)}
            <Plain label="= валовий прибуток" value={`${fmtInt(gross)} ₴`} bold />
            {showNet && <>
            <Line l={{
              key: 'opex', label: 'операційні витрати і компенсації', amount: r2(-b.opex),
              hint: 'Компенсації (напр. НП за пошкоджену посилку) зменшують витрати — тому сума буває зі знаком «+».',
              details: Object.entries(b.opexBy ?? {}).filter(([, v]) => Math.abs(v) >= 0.01).sort((x, y) => Math.abs(y[1]) - Math.abs(x[1]))
                .map(([k, v]) => ({ label: OPEX_UA[k] ?? k, amount: r2(-v) })),
            }} />
            <Plain label="податки" value={signed(-b.taxes)} color={colorOf(-b.taxes)} />
            <Plain label="= чистий прибуток" value={`${fmtInt(net)} ₴`} bold color={net >= 0 ? 'var(--color-success)' : 'var(--color-danger)'} />
            </>}
          </details>
        </div>
      </div>
    </div>
  );
}

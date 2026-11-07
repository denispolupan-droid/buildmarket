import Link from 'next/link';
import { Info } from 'lucide-react';
import { TrendBadge } from './overview-charts';

/**
 * «Підсумок» на «Огляді» — поточний стан за секунди (рішення власника 07.11.2026):
 * одна панель, дві половини (виручка | валовий прибуток). У кожній: цифра з
 * динамікою, чотири ключові показники і смуга структури (звідки виручка за
 * каналами / куди йде кожна гривня виручки). Детальний розбір і чистий
 * прибуток — в «Аналітиці» (посилання в заголовку).
 */
/** info — значок ⓘ біля підпису з підказкою (напр. «прогноз: …»): підпис лишається в один рядок */
export type SummaryMetric = { label: string; value: string; muted?: boolean; hint?: string; info?: string };
export type SummarySegment = { label: string; amount: number; color: string };
export type SummaryPart = {
  label: string; hint: string; value: string; valueColor?: string;
  /** forecast — прогноз (жовта позначка), за замовчуванням факт; deltaText — замість динаміки, коли порівнювати нема з чим */
  kind?: 'fact' | 'forecast'; deltaText?: string;
  cur?: number | null; prev?: number | null; metrics: SummaryMetric[];
  bar?: { title: string; segments: SummarySegment[] };
};

function Bar({ title, segments }: { title: string; segments: SummarySegment[] }) {
  const total = segments.reduce((s, x) => s + Math.max(0, x.amount), 0);
  if (!(total > 0)) return null;
  const segs = segments.filter(x => x.amount > 0).map(x => ({ ...x, pct: x.amount / total * 100 }));
  return (
    <div className="fin-sum-bar">
      <div className="fin-sum-bar-title">{title}</div>
      <div className="fin-sum-bar-track">
        {segs.map(x => <span key={x.label} style={{ width: `${x.pct}%`, background: x.color }} title={`${x.label}: ${Math.round(x.pct * 10) / 10}%`} />)}
      </div>
      <div className="fin-sum-legend">
        {segs.map(x => (
          <span key={x.label}><i style={{ background: x.color }} />{x.label} <b>{x.pct < 1 ? '<1' : Math.round(x.pct)}%</b></span>
        ))}
      </div>
    </div>
  );
}

export default function OverviewSummary({ title, parts, detailsHref, prevLabel, metricCols = 4 }: {
  title: string; parts: SummaryPart[]; detailsHref?: string; prevLabel: string;
  /** скільки показників у рядку під цифрою (4 — «Огляд», 2 — компактні 4 блоки «Аналітики») */
  metricCols?: number;
}) {
  return (
    <div className="fin-card fin-sum">
      <div className="fin-sum-top">
        <span className="fin-sum-title">{title}</span>
        {detailsHref && <Link href={detailsHref} className="fin-sum-link">Детально й чистий прибуток — в «Аналітиці» →</Link>}
      </div>
      <div className="fin-sum-grid" style={{ gridTemplateColumns: `repeat(${parts.length}, minmax(0, 1fr))` }}>
        {parts.map(p => (
          <div key={p.label} className="fin-sum-part">
            <div className="fin-stat-head">
              <span className="fin-stat-label">{p.label}</span>
              {p.kind === 'forecast' ? <span className="fin-stat-tag">прогноз</span> : <span className="fin-stat-tag fact">факт</span>}
              <span className="fin-stat-info" title={p.hint} aria-label={p.hint}><Info size={14} strokeWidth={2} aria-hidden /></span>
            </div>
            <div className="fin-sum-valrow">
              <span className="fin-sum-value" style={p.valueColor ? { color: p.valueColor } : undefined}>{p.value}</span>
              {p.deltaText ? <span className="fin-kpi-cmp">{p.deltaText}</span> : <>
                <TrendBadge cur={p.cur ?? null} prev={p.prev ?? null} />
                <span className="fin-kpi-cmp">{prevLabel}</span>
              </>}
            </div>
            <div className="fin-sum-metrics" style={{ gridTemplateColumns: `repeat(${metricCols}, minmax(0, 1fr))` }}>
              {p.metrics.map(m => (
                <div key={m.label} className="fin-sum-metric" title={m.hint}>
                  <span className="fin-sum-mlabel">
                    <span className="fin-sum-mlabel-text">{m.label}</span>
                    {m.info && <span className="fin-sum-minfo" title={m.info} aria-label={m.info}><Info size={11} strokeWidth={2.2} aria-hidden /></span>}
                  </span>
                  <span className={`fin-sum-mvalue${m.muted ? ' muted' : ''}`}>{m.value}</span>
                </div>
              ))}
            </div>
            {p.bar && <Bar title={p.bar.title} segments={p.bar.segments} />}
          </div>
        ))}
      </div>
    </div>
  );
}

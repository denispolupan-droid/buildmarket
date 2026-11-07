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
export type SummaryMetric = { label: string; value: string; muted?: boolean; hint?: string };
export type SummarySegment = { label: string; amount: number; color: string };
export type SummaryPart = {
  label: string; hint: string; value: string; valueColor?: string;
  cur: number | null; prev: number | null; metrics: SummaryMetric[];
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

export default function OverviewSummary({ title, parts, detailsHref, prevLabel }: {
  title: string; parts: SummaryPart[]; detailsHref?: string; prevLabel: string;
}) {
  return (
    <div className="fin-card fin-sum">
      <div className="fin-sum-top">
        <span className="fin-sum-title">{title}</span>
        {detailsHref && <Link href={detailsHref} className="fin-sum-link">Детально й чистий прибуток — в «Аналітиці» →</Link>}
      </div>
      <div className="fin-sum-grid">
        {parts.map(p => (
          <div key={p.label} className="fin-sum-part">
            <div className="fin-stat-head">
              <span className="fin-stat-label">{p.label}</span>
              <span className="fin-stat-tag fact">факт</span>
              <span className="fin-stat-info" title={p.hint} aria-label={p.hint}><Info size={14} strokeWidth={2} aria-hidden /></span>
            </div>
            <div className="fin-sum-valrow">
              <span className="fin-sum-value" style={p.valueColor ? { color: p.valueColor } : undefined}>{p.value}</span>
              <TrendBadge cur={p.cur} prev={p.prev} />
              <span className="fin-kpi-cmp">{prevLabel}</span>
            </div>
            <div className="fin-sum-metrics">
              {p.metrics.map(m => (
                <div key={m.label} className="fin-sum-metric" title={m.hint}>
                  <span className="fin-sum-mlabel">{m.label}</span>
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

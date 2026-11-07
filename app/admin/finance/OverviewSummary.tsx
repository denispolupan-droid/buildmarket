import Link from 'next/link';
import { Info } from 'lucide-react';
import { TrendBadge } from './overview-charts';

/**
 * «Підсумок» на «Огляді» — поточний стан за секунди (рішення власника 07.11.2026):
 * одна компактна панель, дві половини (виручка | валовий прибуток), цифра з
 * динамікою в один рядок і по два показники поруч. Детальний розбір і чистий
 * прибуток — в «Аналітиці» (посилання в заголовку).
 */
export type SummaryMetric = { label: string; value: string; muted?: boolean };
export type SummaryPart = {
  label: string; hint: string; value: string; valueColor?: string;
  cur: number | null; prev: number | null; metrics: SummaryMetric[];
};

export default function OverviewSummary({ title, parts, detailsHref, prevLabel }: {
  title: string; parts: SummaryPart[]; detailsHref: string; prevLabel: string;
}) {
  return (
    <div className="fin-card fin-sum">
      <div className="fin-sum-top">
        <span className="fin-sum-title">{title}</span>
        <Link href={detailsHref} className="fin-sum-link">Детально й чистий прибуток — в «Аналітиці» →</Link>
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
                <div key={m.label} className="fin-sum-metric">
                  <span className="fin-sum-mlabel">{m.label}</span>
                  <span className={`fin-sum-mvalue${m.muted ? ' muted' : ''}`}>{m.value}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

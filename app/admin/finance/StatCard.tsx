import { TrendBadge } from './overview-charts';

/**
 * Картка показника для «Огляду» й «Аналітики» — одна сітка для всіх карток ряду
 * (стилі .fin-stat у globals.css): підпис, позначка «факт»/«прогноз», цифра,
 * динаміка до попереднього періоду, дві строки розшифровки внизу. Пояснення —
 * у підказці ⓘ, а не абзацом: абзаци різної довжини перекошували ряд.
 */
export type StatRow = { label: string; value: string; color?: string };

export default function StatCard(props: {
  label: string;
  kind?: 'fact' | 'forecast';
  value: string;
  valueColor?: string;
  cur?: number | null; prev?: number | null; pp?: boolean;
  deltaLabel?: string;
  rows: StatRow[];
  hint: string;
}) {
  const { label, kind, value, valueColor, cur, prev, pp, deltaLabel, rows, hint } = props;
  return (
    <div className="fin-card fin-stat">
      <div className="fin-stat-head">
        <span className="fin-stat-label" title={label}>{label}</span>
        {kind && <span className={`fin-stat-tag${kind === 'fact' ? ' fact' : ''}`}>{kind === 'fact' ? 'факт' : 'прогноз'}</span>}
        <span className="fin-stat-info" title={hint} aria-label={hint}>ⓘ</span>
      </div>
      <div className="fin-stat-value" style={valueColor ? { color: valueColor } : undefined}>{value}</div>
      <div className="fin-stat-delta">
        {cur !== undefined && prev !== undefined && <TrendBadge cur={cur} prev={prev} pp={pp} />}
        {deltaLabel && <span className="fin-kpi-cmp" title={deltaLabel}>{deltaLabel}</span>}
      </div>
      <div className="fin-stat-rows">
        {rows.map(r => (
          <div key={r.label} className="fin-stat-row">
            <span title={r.label}>{r.label}</span>
            <span style={r.color ? { color: r.color } : undefined}>{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

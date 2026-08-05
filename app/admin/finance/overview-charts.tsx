// Легкі SVG-графіки для «Огляду» фінансів: спарклайни в KPI-картках і
// великий графік динаміки. Без бібліотек — серверний рендер, нуль JS
// на клієнті; стиль BI-систем (тонкі лінії, без декору).

function scale(data: number[], w: number, h: number, pad = 2): string {
  if (data.length === 0) return '';
  const min = Math.min(0, ...data);
  const max = Math.max(...data, min + 1);
  const span = max - min || 1;
  const step = data.length > 1 ? (w - pad * 2) / (data.length - 1) : 0;
  return data
    .map((v, i) => `${(pad + i * step).toFixed(1)},${(h - pad - ((v - min) / span) * (h - pad * 2)).toFixed(1)}`)
    .join(' ');
}

export function Sparkline({ data, color = 'var(--brand-blue)', id }: { data: number[]; color?: string; id: string }) {
  const w = 130, h = 38;
  if (data.length < 2 || data.every(v => v === 0)) {
    return <svg width={w} height={h} aria-hidden="true"><line x1="2" y1={h - 6} x2={w - 2} y2={h - 6} stroke="var(--border)" strokeWidth="1.5" /></svg>;
  }
  const pts = scale(data, w, h);
  const first = pts.split(' ')[0];
  const last = pts.split(' ').pop();
  return (
    <svg width={w} height={h} aria-hidden="true">
      <defs>
        <linearGradient id={`sp-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`${first!.split(',')[0]},${h} ${pts} ${last!.split(',')[0]},${h}`} fill={`url(#sp-${id})`} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function TrendBadge({ cur, prev, suffix = '%', pp = false }: { cur: number | null; prev: number | null; suffix?: string; pp?: boolean }) {
  if (cur === null || prev === null || (!pp && prev === 0)) {
    return <span className="fin-trend muted">— {suffix === '%' ? '' : suffix}</span>;
  }
  // pp: різниця у відсоткових пунктах (для маржі), інакше — відносна дельта
  const delta = pp ? Math.round((cur - prev) * 10) / 10 : Math.round(((cur - prev) / Math.abs(prev)) * 100);
  if (delta === 0) return <span className="fin-trend muted">без змін</span>;
  const up = delta > 0;
  return (
    <span className={'fin-trend ' + (up ? 'up' : 'down')}>
      {up ? '↑' : '↓'} {up ? '+' : ''}{delta}{pp ? ' п.п.' : '%'}
    </span>
  );
}

export function DualLineChart({ a, b, labels, aLabel, bLabel }: {
  a: number[]; b: number[]; labels: string[]; aLabel: string; bLabel: string;
}) {
  const w = 760, h = 230, padL = 46, padB = 22, padT = 12, padR = 8;
  const all = [...a, ...b];
  const max = Math.max(...all, 1);
  const min = Math.min(0, ...all);
  const span = max - min || 1;
  const iw = w - padL - padR, ih = h - padT - padB;
  const x = (i: number) => padL + (a.length > 1 ? (i / (a.length - 1)) * iw : iw / 2);
  const y = (v: number) => padT + ih - ((v - min) / span) * ih;
  const line = (data: number[]) => data.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  // 4 горизонтальні лінії сітки з підписами
  const gridVals = [0, 1, 2, 3].map(i => min + (span * i) / 3);
  const fmtAxis = (v: number) => v >= 1000 ? `${Math.round(v / 1000)}k` : String(Math.round(v));
  const labelEvery = Math.max(1, Math.ceil(labels.length / 10));
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 'auto' }} role="img" aria-label={`${aLabel} і ${bLabel} за період`}>
      {gridVals.map((v, i) => (
        <g key={i}>
          <line x1={padL} y1={y(v)} x2={w - padR} y2={y(v)} stroke="var(--border-light, var(--border))" strokeWidth="1" strokeDasharray={i === 0 ? undefined : '3 4'} />
          <text x={padL - 8} y={y(v) + 3.5} textAnchor="end" fontSize="10.5" fill="var(--text-muted)">{fmtAxis(v)}</text>
        </g>
      ))}
      {labels.map((l, i) => (i % labelEvery === 0 ? (
        <text key={i} x={x(i)} y={h - 6} textAnchor="middle" fontSize="10.5" fill="var(--text-muted)">{l}</text>
      ) : null))}
      <polyline points={line(a)} fill="none" stroke="var(--brand-blue)" strokeWidth="2" strokeLinejoin="round" />
      <polyline points={line(b)} fill="none" stroke="#15803D" strokeWidth="2" strokeLinejoin="round" />
      {a.map((v, i) => <circle key={`a${i}`} cx={x(i)} cy={y(v)} r="2.1" fill="var(--brand-blue)" />)}
      {b.map((v, i) => <circle key={`b${i}`} cx={x(i)} cy={y(v)} r="2.1" fill="#15803D" />)}
    </svg>
  );
}

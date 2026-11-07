import { fmtInt as fmt } from '../../../lib/format';

/**
 * Графіки «Аналітики» (07.11.2026, щоб сторінка не була суцільними цифрами):
 * власний SVG без бібліотек, як решта графіків фінансів; рендер на сервері.
 *   MonthFactChart — стовпчики виручки по місяцях + лінія маржі валового (факт обліку)
 *   Sparkline      — тонка лінія тренду за 6 місяців біля цифри в блоці
 *   Donut          — кільце часток (нові / повторні клієнти)
 */

const fmtK = (v: number) => (Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : fmt(v));

export function MonthFactChart({ months }: {
  months: { label: string; revenue: number; gross: number; net: number; delivered: number; pct: number | null }[];
}) {
  const W = 640, H = 210, padL = 8, padR = 8, padT = 26, padB = 22;
  const n = months.length || 1;
  const slot = (W - padL - padR) / n;
  const barW = Math.min(46, slot * 0.55);
  const maxRev = Math.max(1, ...months.map(m => m.revenue));
  const maxPct = Math.max(1, ...months.map(m => m.pct ?? 0));
  const chartH = H - padT - padB;
  const xC = (i: number) => padL + slot * i + slot / 2;
  const yRev = (v: number) => padT + chartH - (Math.max(0, v) / maxRev) * chartH;
  // маржа — у верхній третині, своя шкала (0…макс %)
  const yPct = (v: number) => padT + 4 + (1 - v / maxPct) * (chartH * 0.42);
  const pts = months.map((m, i) => (m.pct == null ? null : `${xC(i)},${yPct(m.pct)}`)).filter(Boolean).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }} role="img" aria-label="Виручка і маржа по місяцях">
      <line x1={padL} x2={W - padR} y1={padT + chartH} y2={padT + chartH} stroke="var(--border)" strokeWidth="1" />
      {months.map((m, i) => (
        <g key={m.label}>
          <title>{`${m.label}: виручка ${fmt(m.revenue)} ₴ · валовий ${fmt(m.gross)} ₴ · маржа ${m.pct ?? '—'}% · чистий ${fmt(m.net)} ₴ · вручено ${m.delivered}`}</title>
          <rect x={xC(i) - barW / 2} y={yRev(m.revenue)} width={barW} height={Math.max(0, padT + chartH - yRev(m.revenue))} rx="3"
            fill="var(--brand-blue)" opacity={i === n - 1 ? 1 : 0.55} />
          {/* прибуток — темніша частина стовпчика знизу */}
          <rect x={xC(i) - barW / 2} y={yRev(Math.max(0, m.gross))} width={barW} height={Math.max(0, padT + chartH - yRev(Math.max(0, m.gross)))} rx="3" fill="#16A34A" opacity="0.85" />
          {m.revenue > 0 && <text x={xC(i)} y={yRev(m.revenue) - 5} textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--text-primary)">{fmtK(m.revenue)}</text>}
          <text x={xC(i)} y={H - 6} textAnchor="middle" fontSize="11" fill="var(--text-muted)">{m.label}</text>
        </g>
      ))}
      {pts && <polyline points={pts} fill="none" stroke="#EA8A00" strokeWidth="2" strokeLinejoin="round" />}
      {months.map((m, i) => m.pct == null ? null : (
        <g key={`p${m.label}`}>
          <circle cx={xC(i)} cy={yPct(m.pct)} r="3.2" fill="#fff" stroke="#EA8A00" strokeWidth="2" />
          <text x={xC(i) + 6} y={yPct(m.pct) - 6} fontSize="10.5" fontWeight="700" fill="#C2410C">{m.pct}%</text>
        </g>
      ))}
    </svg>
  );
}

export function Sparkline({ values, color = 'var(--brand-blue)', title }: { values: number[]; color?: string; title?: string }) {
  const vals = values.filter(v => Number.isFinite(v));
  if (vals.length < 2) return null;
  const W = 72, H = 24, pad = 2;
  const min = Math.min(...vals), max = Math.max(...vals);
  const span = max - min || 1;
  const x = (i: number) => pad + (i / (vals.length - 1)) * (W - pad * 2);
  const y = (v: number) => pad + (1 - (v - min) / span) * (H - pad * 2);
  const pts = vals.map((v, i) => `${x(i)},${y(v)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} style={{ flexShrink: 0, marginLeft: 'auto', alignSelf: 'center' }} aria-hidden>
      {title && <title>{title}</title>}
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(vals.length - 1)} cy={y(vals[vals.length - 1])} r="2.2" fill={color} />
    </svg>
  );
}

export function Donut({ parts, size = 96, center }: { parts: { label: string; value: number; color: string }[]; size?: number; center?: string }) {
  const total = parts.reduce((s, p) => s + Math.max(0, p.value), 0);
  const r = size / 2 - 8, c = size / 2, circ = 2 * Math.PI * r;
  let acc = 0;
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} style={{ flexShrink: 0 }} role="img" aria-label={parts.map(p => `${p.label} ${p.value}`).join(', ')}>
      <circle cx={c} cy={c} r={r} fill="none" stroke="var(--bg-soft)" strokeWidth="12" />
      {total > 0 && parts.map(p => {
        const len = Math.max(0, p.value) / total * circ;
        const el = (
          <circle key={p.label} cx={c} cy={c} r={r} fill="none" stroke={p.color} strokeWidth="12"
            strokeDasharray={`${len} ${circ - len}`} strokeDashoffset={-acc} transform={`rotate(-90 ${c} ${c})`}>
            <title>{`${p.label}: ${p.value}`}</title>
          </circle>
        );
        acc += len;
        return el;
      })}
      {center && <text x={c} y={c + 5} textAnchor="middle" fontSize="15" fontWeight="800" fill="var(--text-primary)">{center}</text>}
    </svg>
  );
}

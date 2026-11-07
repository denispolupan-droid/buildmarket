/**
 * Графіки «Аналітики» (07.11.2026, щоб сторінка не була суцільними цифрами):
 * власний SVG без бібліотек, як решта графіків фінансів; рендер на сервері.
 *   Sparkline      — тонка лінія тренду за 6 місяців біля цифри в блоці
 *   Donut          — кільце часток (нові / повторні клієнти)
 */

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

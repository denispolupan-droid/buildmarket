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

/**
 * Спарклайн-накопичення: кольорова лінія — накопичений підсумок поточного
 * періоду, сірий пунктир-«привид» — накопичення попереднього періоду тієї ж
 * довжини. Одна шкала і спільна вісь днів: одразу видно темп проти минулого
 * періоду і де ми зараз (крапка на кінці). Щоденні «пилки» тут нечитабельні —
 * тому саме накопичення (рішення власника: «графіки в картках неінформативні»).
 */
export function Sparkline({ data, prevData = [], color = 'var(--brand-blue)', id }: { data: number[]; prevData?: number[]; color?: string; id: string }) {
  const w = 150, h = 44, pad = 3;
  const cum = (arr: number[]) => { let s = 0; return arr.map(v => (s += v)); };
  const a = cum(data);
  const b = cum(prevData);
  const aTotal = a.length ? a[a.length - 1] : 0;
  const bTotal = b.length ? b[b.length - 1] : 0;
  if ((a.length < 2 || aTotal === 0) && (b.length < 2 || bTotal === 0)) {
    return <svg width={w} height={h} aria-hidden="true"><line x1="2" y1={h - 6} x2={w - 2} y2={h - 6} stroke="var(--border)" strokeWidth="1.5" /></svg>;
  }
  // Спільна вісь X (довжина періодів) і спільна шкала Y
  const n = Math.max(a.length, b.length, 2);
  const max = Math.max(aTotal, bTotal, 1);
  const min = Math.min(0, ...a, ...b);
  const span = max - min || 1;
  const x = (i: number) => pad + (i / (n - 1)) * (w - pad * 2);
  const y = (v: number) => h - pad - ((v - min) / span) * (h - pad * 2);
  const line = (arr: number[]) => arr.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const lastX = a.length ? x(a.length - 1) : pad;
  const lastY = a.length ? y(a[a.length - 1]) : h - pad;
  return (
    <svg width={w} height={h} aria-hidden="true">
      <defs>
        <linearGradient id={`sp-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.16" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {b.length > 1 && (
        <polyline points={line(b)} fill="none" stroke="var(--border)" strokeWidth="1.6" strokeDasharray="3 3" strokeLinejoin="round" />
      )}
      {a.length > 1 && (
        <>
          <polygon points={`${x(0)},${h - pad} ${line(a)} ${lastX},${h - pad}`} fill={`url(#sp-${id})`} />
          <polyline points={line(a)} fill="none" stroke={color} strokeWidth="1.9" strokeLinejoin="round" strokeLinecap="round" />
          <circle cx={lastX} cy={lastY} r="2.6" fill={color} />
        </>
      )}
    </svg>
  );
}

/**
 * Bullet-бар для KPI-картки: заливка — поточне значення, темна риска —
 * попередній період. Обидва в одній шкалі (максимум з двох). Компактніше
 * і читабельніше за мініграфік; однаковий елемент в усіх картках.
 */
export function BulletBar({ cur, prev, prevLabel, color = 'var(--brand-blue)' }: {
  cur: number | null; prev: number | null; prevLabel?: string; color?: string;
}) {
  if (cur === null && prev === null) return null;
  const base = Math.max(cur ?? 0, prev ?? 0);
  if (base <= 0) return null;
  const curPct  = Math.max(0, Math.min(100, ((cur ?? 0) / base) * 100));
  const prevPct = prev !== null && prev > 0 ? Math.max(0, Math.min(100, (prev / base) * 100)) : null;
  return (
    <div>
      <div className="fin-bullet">
        <div className="fin-bullet-fill" style={{ width: `${curPct}%`, background: color }} />
        {prevPct !== null && <div className="fin-bullet-tick" style={{ left: `${prevPct}%` }} />}
      </div>
      {prevLabel && <div className="fin-bullet-cap">минулий період: {prevLabel}</div>}
    </div>
  );
}

/**
 * Стовпчики останніх 6 місяців для KPI-картки (вибір власника, варіант B):
 * минулі місяці — сірі, поточний — кольоровий; підписи місяців знизу.
 * null (немає даних, напр. маржа без виручки) — місяць без стовпчика.
 */
export function MonthBars({ values, labels, color = 'var(--brand-blue)', format }: {
  values: (number | null)[]; labels: string[]; color?: string; format?: (v: number) => string;
}) {
  const nums = values.filter((v): v is number => v !== null);
  if (nums.length === 0 || nums.every(v => v === 0)) {
    return <div style={{ height: 52, display: 'flex', alignItems: 'center', fontSize: 11, color: 'var(--text-muted)' }}>немає даних</div>;
  }
  const max = Math.max(...nums, 1);
  const w = 168, hBar = 40, hLbl = 12, gap = 5;
  const n = values.length;
  const barW = (w - gap * (n - 1)) / n;
  return (
    <svg width={w} height={hBar + hLbl + 2} aria-hidden="true">
      {values.map((v, i) => {
        const x = i * (barW + gap);
        const isCur = i === n - 1;
        const hh = v === null || v <= 0 ? 0 : Math.max(2, (v / max) * hBar);
        return (
          <g key={i}>
            {hh > 0 && (
              <rect x={x} y={hBar - hh} width={barW} height={hh} rx="2"
                fill={isCur ? color : 'var(--border)'} opacity={isCur ? 0.95 : 1}>
                {format && v !== null && <title>{`${labels[i]}: ${format(v)}`}</title>}
              </rect>
            )}
            <text x={x + barW / 2} y={hBar + hLbl} textAnchor="middle" fontSize="8.5"
              fill={isCur ? 'var(--text-primary)' : 'var(--text-muted)'} fontWeight={isCur ? 700 : 400}>
              {labels[i]}
            </text>
          </g>
        );
      })}
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

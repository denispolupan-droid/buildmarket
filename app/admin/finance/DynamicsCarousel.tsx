'use client';

import { useState } from 'react';

// Карусель «Динаміка» на «Огляді»: три погляди в одному вікні.
//   Дні     — щоденні стовпчики виручки/прибутку + тренд (ковзне середнє)
//   Джерела — кругова + таблиця деталей по каналах (кольори — як у журналі)
//   План    — накопичення ПРОДАЖІВ місяця (створені, вкл. в дорозі) проти
//             рівномірного темпу плану
// Все — власний SVG, без бібліотек.

type Dynamics = {
  daily: { labels: string[]; revenue: (number | null)[]; profit: (number | null)[] };
  sources: { code: string; count: number; revenue: number; share: number; avgCheck: number; profit: number; margin: number | null; prevRevenue: number }[];
  planCum: { labels: string[]; fact: (number | null)[]; plan: number[] | null; monthLabel: string };
};

// Ті самі кольори каналів, що в журналі замовлень (упізнаваність важливіша
// за палітру: Prom скрізь теракотовий, Rozetka скрізь зелений)
const SOURCE_META: Record<string, { label: string; color: string }> = {
  website:  { label: 'Магазин',  color: '#1E5AA8' },
  b2b:      { label: 'Опт',      color: '#6B21A8' },
  dropship: { label: 'Дроп',     color: '#0E7490' },
  retail:   { label: 'Роздріб',  color: '#B45309' },
  phone:    { label: 'Телефон',  color: '#334155' },
  prom:     { label: 'Prom',     color: '#C2410C' },
  rozetka:  { label: 'Rozetka',  color: '#15803D' },
  other:    { label: 'Інше',     color: '#94A3B8' },
};

function fmt(n: number) {
  return n.toLocaleString('uk-UA', { maximumFractionDigits: 0 });
}

/* ── Дні: дві панелі зі своїми шкалами (виручка ↑ / прибуток ↓) ───────────
   Одна шкала ховала прибуток біля нуля поруч із виручкою; окрема нижня
   панель робить його рельєф видимим. Стовпчики щоденні (картка широка);
   пунктирний тренд для довгих вікон — 7-денне ковзне середнє, інакше
   з'єднання вершин знову давало б «пилку». */
function DayBars({ d }: { d: Dynamics['daily'] }) {
  // W ≈ реальній ширині картки (span 8) → масштаб ~1:1, шрифти і стовпчики не міліють
  const W = 900, H = 258, padL = 44, padR = 6;
  const iw = W - padL - padR;
  const n = Math.max(d.labels.length, 1);
  // Крок щільний (кап 34px) — дні стоять поруч, місяць влазить цілком
  const groupW = Math.min(34, iw / n);
  const blockX = padL + (iw - groupW * n) / 2;
  const barW = Math.max(2.5, Math.min(24, groupW * 0.66));
  const cx = (i: number) => blockX + groupW * i + groupW / 2;
  const fmtAxis = (v: number) => (Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : String(Math.round(v)));
  const labelEvery = Math.max(1, Math.ceil(n / 13));
  const filled = d.revenue.filter((v): v is number => v !== null).length; // хвіст масиву — майбутні null-дні
  // Тренд: ≤10 точок — по вершинах, довше — ковзне середнє за 7 днів
  const smooth = (vals: number[]) => (filled <= 10 ? vals : vals.map((_, i) => {
    const from = Math.max(0, i - 6);
    return vals.slice(from, i + 1).reduce((s, v) => s + v, 0) / (i + 1 - from);
  }));

  const revVals  = d.revenue.slice(0, filled).map(v => v ?? 0);
  const profVals = d.profit.slice(0, filled).map(v => v ?? 0);
  // Панелі: [top, height, значення, колір, підпис]
  const maxRev = Math.max(...revVals, 1);
  const maxProf = Math.max(...profVals, 1);
  const minProf = Math.min(0, ...profVals);
  const panels = [
    { top: 16, h: 128, min: 0, max: maxRev, vals: revVals, color: () => 'var(--brand-blue)', trend: 'var(--brand-blue)', label: 'Виручка' },
    { top: 172, h: 62, min: minProf, max: maxProf, vals: profVals, color: (v: number) => (v >= 0 ? '#15803D' : '#DC2626'), trend: '#15803D', label: 'Прибуток' },
  ];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }} role="img" aria-label="Виручка і прибуток по днях">
      {panels.map(pn => {
        const span = pn.max - pn.min || 1;
        const y = (v: number) => pn.top + pn.h - ((v - pn.min) / span) * pn.h;
        const y0 = y(Math.max(0, pn.min));
        const ticks = pn.h > 100 ? [0, 1, 2] : [0, 1];
        const trendVals = smooth(pn.vals);
        return (
          <g key={pn.label}>
            <text x={padL} y={pn.top - 5} fontSize="10.5" fontWeight="700" fill={pn.trend} opacity="0.85">{pn.label}</text>
            {ticks.map(t => {
              const v = pn.min + (span * t) / ticks[ticks.length - 1];
              return (
                <g key={t}>
                  <line x1={padL} y1={y(v)} x2={W - padR} y2={y(v)} stroke="var(--border-light, var(--border))" strokeWidth="1" strokeDasharray={Math.abs(v) < 1 ? undefined : '3 4'} />
                  <text x={padL - 8} y={y(v) + 3.5} textAnchor="end" fontSize="10" fill="var(--text-muted)">{fmtAxis(v)}</text>
                </g>
              );
            })}
            {pn.vals.map((v, i) => (
              <rect key={i} x={cx(i) - barW / 2} y={v >= 0 ? y(v) : y(0)} width={barW}
                height={Math.max(1.5, Math.abs(y(v) - y0))} rx={Math.min(2.5, barW / 3)} fill={pn.color(v)} opacity="0.9">
                <title>{`${d.labels[i]}: ${pn.label.toLowerCase()} ${fmt(v)} ₴`}</title>
              </rect>
            ))}
            {n > 1 && (
              <polyline points={trendVals.map((v, i) => `${cx(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')}
                fill="none" stroke={pn.trend} strokeWidth="1.4" strokeDasharray="4 4" opacity="0.55" />
            )}
          </g>
        );
      })}
      {d.labels.map((l, i) => ((n - 1 - i) % labelEvery === 0 ? (
        <text key={i} x={cx(i)} y={H - 6} textAnchor="middle" fontSize="10.5" fill="var(--text-muted)">{l}</text>
      ) : null))}
    </svg>
  );
}

/* ── Джерела замовлень: кругова + таблиця деталей по каналах ──────────────
   Праворуч від донату — сер. чек, очікуваний прибуток каналу (методика KPI
   «Прибуток») і дельта виручки проти попереднього періоду тієї ж довжини. */
function SourcesDonut({ sources }: { sources: Dynamics['sources'] }) {
  const parts = sources.filter(s => s.revenue > 0);
  const total = parts.reduce((a, s) => a + s.revenue, 0);
  const totalCount = parts.reduce((a, s) => a + s.count, 0);
  const totalProfit = parts.reduce((a, s) => a + s.profit, 0);
  if (total <= 0) {
    return <div style={{ height: 230, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Немає замовлень за період</div>;
  }
  const R = 80, SW = 30, C = 2 * Math.PI * R;
  let acc = 0;
  const th: React.CSSProperties = { fontSize: '10.5px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'right', padding: '0 0 6px 18px', whiteSpace: 'nowrap' };
  const td: React.CSSProperties = { fontSize: '12.5px', textAlign: 'right', padding: '4px 0 4px 18px', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', color: 'var(--text-primary)' };
  const delta = (s: Dynamics['sources'][number]) => {
    if (s.prevRevenue <= 0) return <span style={{ color: 'var(--text-muted)' }}>—</span>;
    const d = Math.round((s.revenue - s.prevRevenue) / s.prevRevenue * 100);
    return <span style={{ color: d >= 0 ? '#15803D' : '#DC2626', fontWeight: 600 }}>{d >= 0 ? '+' : ''}{d}%</span>;
  };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '40px', minHeight: 224, flexWrap: 'wrap', paddingLeft: '10px' }}>
      <svg width="224" height="224" viewBox="0 0 224 224" role="img" aria-label="Джерела замовлень" style={{ flexShrink: 0 }}>
        <g transform="rotate(-90 112 112)">
          {parts.map(s => {
            const meta = SOURCE_META[s.code] ?? SOURCE_META.other;
            const frac = s.revenue / total;
            const seg = (
              <circle key={s.code} cx="112" cy="112" r={R} fill="none" stroke={meta.color} strokeWidth={SW}
                strokeDasharray={`${Math.max(0, frac * C - 2)} ${C}`} strokeDashoffset={-acc * C}>
                <title>{`${meta.label}: ${fmt(s.revenue)} ₴ (${Math.round(frac * 100)}%) · ${s.count} зам.`}</title>
              </circle>
            );
            acc += frac;
            return seg;
          })}
        </g>
        <text x="112" y="107" textAnchor="middle" fontSize="23" fontWeight="800" fill="var(--text-primary)" style={{ fontVariantNumeric: 'tabular-nums' }}>
          {totalCount}
        </text>
        <text x="112" y="126" textAnchor="middle" fontSize="11.5" fill="var(--text-muted)">замовлень</text>
      </svg>
      <div style={{ minWidth: 0, overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: 'left', padding: '0 0 6px' }}>Канал</th>
              <th style={th}>Сума</th>
              <th style={th}>Частка</th>
              <th style={th}>Зам.</th>
              <th style={th} title="Середній чек каналу за період">Сер. чек</th>
              <th style={th} title="Очікуваний валовий прибуток: доставлені — факт з обліку, решта — оцінка (як у KPI «Прибуток»)">Прибуток</th>
              <th style={th} title="Виручка каналу проти попереднього періоду тієї ж довжини">vs попер.</th>
            </tr>
          </thead>
          <tbody>
            {parts.map(s => {
              const meta = SOURCE_META[s.code] ?? SOURCE_META.other;
              return (
                <tr key={s.code} style={{ borderTop: '1px solid var(--border-light, var(--border))' }}>
                  <td style={{ ...td, textAlign: 'left', padding: '4px 0' }}>
                    <span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: '50%', background: meta.color, marginRight: '7px', verticalAlign: 'baseline' }} />
                    <span style={{ color: 'var(--text-secondary)' }}>{meta.label}</span>
                  </td>
                  <td style={{ ...td, fontWeight: 700 }}>{fmt(s.revenue)} ₴</td>
                  <td style={{ ...td, color: 'var(--text-muted)' }}>{Math.round(s.revenue / total * 100)}%</td>
                  <td style={td}>{s.count}</td>
                  <td style={td}>{fmt(s.avgCheck)} ₴</td>
                  <td style={{ ...td, color: s.profit >= 0 ? '#15803D' : '#DC2626', fontWeight: 600 }}>
                    {fmt(s.profit)} ₴{s.margin !== null && <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}> · {Math.round(s.margin)}%</span>}
                  </td>
                  <td style={td}>{delta(s)}</td>
                </tr>
              );
            })}
            <tr style={{ borderTop: '1px solid var(--border)' }}>
              <td style={{ ...td, textAlign: 'left', padding: '5px 0', color: 'var(--text-secondary)', fontWeight: 600 }}>Разом</td>
              <td style={{ ...td, fontWeight: 800 }}>{fmt(total)} ₴</td>
              <td style={{ ...td, color: 'var(--text-muted)' }}>100%</td>
              <td style={{ ...td, fontWeight: 700 }}>{totalCount}</td>
              <td style={td}>{fmt(totalCount ? Math.round(total / totalCount) : 0)} ₴</td>
              <td style={{ ...td, color: totalProfit >= 0 ? '#15803D' : '#DC2626', fontWeight: 700 }}>
                {fmt(totalProfit)} ₴<span style={{ color: 'var(--text-muted)', fontWeight: 500 }}> · {Math.round(totalProfit / total * 100)}%</span>
              </td>
              <td style={td} />
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Накопичення продажів місяця проти рівномірного темпу плану ──────────── */
function PlanCumChart({ p }: { p: Dynamics['planCum'] }) {
  const W = 900, H = 232, padL = 48, padB = 22, padT = 10, padR = 8;
  const iw = W - padL - padR, ih = H - padT - padB;
  const factVals = p.fact.filter((v): v is number => v !== null);
  const maxV = Math.max(...factVals, ...(p.plan ?? [0]), 1);
  const x = (i: number) => padL + (i / Math.max(p.labels.length - 1, 1)) * iw;
  const y = (v: number) => padT + ih - (v / maxV) * ih;
  const line = (arr: (number | null)[]) => arr.map((v, i) => (v === null ? null : `${x(i).toFixed(1)},${y(v).toFixed(1)}`)).filter(Boolean).join(' ');
  let lastIdx = 0;
  p.fact.forEach((v, i) => { if (v !== null) lastIdx = i; });
  const lastVal = p.fact[lastIdx] ?? 0;
  const fmtAxis = (v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(Math.round(v)));
  const labelEvery = Math.max(1, Math.ceil(p.labels.length / 12));
  const onTrack = p.plan ? lastVal >= (p.plan[lastIdx] ?? 0) : null;
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }} role="img" aria-label={`Накопичення продажів за ${p.monthLabel}`}>
        {[0, 1, 2, 3].map(i => {
          const v = (maxV * i) / 3;
          return (
            <g key={i}>
              <line x1={padL} y1={y(v)} x2={W - padR} y2={y(v)} stroke="var(--border-light, var(--border))" strokeWidth="1" strokeDasharray={i === 0 ? undefined : '3 4'} />
              <text x={padL - 8} y={y(v) + 3.5} textAnchor="end" fontSize="10.5" fill="var(--text-muted)">{fmtAxis(v)}</text>
            </g>
          );
        })}
        {p.labels.map((l, i) => (i % labelEvery === 0 ? (
          <text key={i} x={x(i)} y={H - 6} textAnchor="middle" fontSize="10.5" fill="var(--text-muted)">{l}</text>
        ) : null))}
        {p.plan && <polyline points={line(p.plan)} fill="none" stroke="var(--text-muted)" strokeWidth="1.8" strokeDasharray="5 5" />}
        <polyline points={line(p.fact)} fill="none" stroke="var(--brand-blue)" strokeWidth="2.2" strokeLinejoin="round" />
        <circle cx={x(lastIdx)} cy={y(lastVal)} r="3.2" fill="var(--brand-blue)" />
      </svg>
      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
        {p.plan
          ? <>Продажі {fmt(lastVal)} ₴ (створені, вкл. в дорозі) проти темпу плану {fmt(p.plan[lastIdx] ?? 0)} ₴ — {onTrack
              ? <b style={{ color: '#15803D' }}>випереджаємо</b>
              : <b style={{ color: '#DC2626' }}>відстаємо на {fmt((p.plan[lastIdx] ?? 0) - lastVal)} ₴</b>}</>
          : 'План не задано — введіть його у віджеті «План на місяць», і тут з’явиться лінія темпу.'}
      </div>
    </div>
  );
}

const SLIDES = [
  { key: 'daily', label: 'Дні' },
  { key: 'sources', label: 'Джерела' },
  { key: 'plan', label: 'План' },
] as const;

export default function DynamicsCarousel({ data }: { data: Dynamics }) {
  const [slide, setSlide] = useState<(typeof SLIDES)[number]['key']>('daily');
  return (
    <div>
      <div style={{ display: 'flex', gap: '3px', marginBottom: '10px', alignItems: 'center' }}>
        {SLIDES.map(s => (
          <button key={s.key} onClick={() => setSlide(s.key)}
            style={{ padding: '2px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: 600, border: 'none', cursor: 'pointer',
              color: slide === s.key ? '#fff' : 'var(--text-secondary)', background: slide === s.key ? '#1E3A5F' : 'var(--bg-soft)' }}>
            {s.label}
          </button>
        ))}
        {slide === 'plan' && (
          <span style={{ display: 'flex', gap: '14px', fontSize: '11.5px', color: 'var(--text-secondary)', marginLeft: 'auto' }}>
            <span><span className="fin-dot" style={{ background: 'var(--brand-blue)' }} /> Продажі</span>
            <span><span className="fin-dot" style={{ background: 'var(--text-muted)' }} /> Темп плану</span>
          </span>
        )}
      </div>
      {slide === 'daily' && <DayBars d={data.daily} />}
      {slide === 'sources' && <SourcesDonut sources={data.sources} />}
      {slide === 'plan' && <PlanCumChart p={data.planCum} />}
    </div>
  );
}

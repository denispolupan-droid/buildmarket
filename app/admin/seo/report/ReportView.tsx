import type { CSSProperties } from 'react';
import type { KindRow, MonthRow, PageRow, QueryRow, SearchReport, WeekRow } from '../../../../lib/seo/report';

// Зведений звіт малюється НА СЕРВЕРІ, разом із графіками: SVG не потребує
// жодного скрипта, тому сторінка з'являється одразу готовою, коректно
// друкується в PDF і не блимає порожніми блоками.

const UK_MONTH = ['січ', 'лют', 'бер', 'кві', 'тра', 'чер', 'лип', 'сер', 'вер', 'жов', 'лис', 'гру'];
const monthLabel = (m: string) => `${UK_MONTH[Number(m.slice(5, 7)) - 1] ?? m} ${m.slice(2, 4)}`;
const nf = (n: number) => Math.round(n).toLocaleString('uk-UA');
const dm = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;

const card: CSSProperties = {
  background: 'var(--bg-card)', border: '1px solid var(--border)',
  borderRadius: 12, padding: '18px 20px',
};
const th: CSSProperties = {
  padding: '0 10px 8px', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)',
  textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'left', whiteSpace: 'nowrap',
  borderBottom: '1px solid var(--border)',
};
const td: CSSProperties = {
  padding: '8px 10px', fontSize: 13, color: 'var(--text-primary)',
  borderTop: '1px solid var(--border-light)', verticalAlign: 'top',
};
const tdNum: CSSProperties = { ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' };
const pathStyle: CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12,
  color: 'var(--text-secondary)', wordBreak: 'break-all',
};
const hint: CSSProperties = { fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.55 };
const h2: CSSProperties = { fontSize: 17, fontWeight: 800, color: 'var(--text-primary)', margin: 0 };

const ACCENT = 'var(--brand-blue)';
const REF = 'var(--border)';

function Pill({ tone, children }: { tone: 'up' | 'down' | 'flat'; children: React.ReactNode }) {
  const map = {
    up:   { color: '#15803D', background: '#E7F5EC' },
    down: { color: '#B45309', background: '#FDF3E3' },
    flat: { color: 'var(--text-muted)', background: 'var(--bg-soft)' },
  }[tone];
  return (
    <span style={{ ...map, fontSize: 11.5, fontWeight: 700, padding: '1px 7px', borderRadius: 999, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
      {children}
    </span>
  );
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: React.ReactNode; tone?: 'up' | 'down' | 'flat' }) {
  return (
    <div style={card}>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums', marginTop: 4, letterSpacing: '-0.02em' }}>
        {value}
      </div>
      {sub && (
        <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--text-muted)' }}>
          {tone && <Pill tone={tone}>{sub}</Pill>}
          {!tone && sub}
        </div>
      )}
    </div>
  );
}

/** Стовпчики по місяцях: одна серія, значення підписані прямо над стовпчиком. */
function MonthBars({ rows, field, title, sub }: { rows: MonthRow[]; field: 'clicks' | 'impressions'; title: string; sub: string }) {
  const W = 460, H = 180, padB = 32, padT = 24;
  const max = Math.max(...rows.map(r => r[field]), 1);
  const bw = W / Math.max(rows.length, 1);
  return (
    <div style={card}>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)' }}>{title}</div>
      <div style={{ ...hint, marginBottom: 6 }}>{sub}</div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', width: '100%', height: 'auto', overflow: 'visible' }} role="img">
        <line x1={0} y1={H - padB} x2={W} y2={H - padB} stroke="var(--border)" strokeWidth={1} />
        {rows.map((r, i) => {
          const h = (H - padB - padT) * (r[field] / max);
          const x = i * bw + bw * 0.24, w = bw * 0.52, y = H - padB - h;
          return (
            <g key={r.month}>
              <rect x={x} y={y} width={w} height={Math.max(h, 2)} rx={4} fill={ACCENT}>
                <title>{`${monthLabel(r.month)}: ${nf(r[field])} · ${r.days} дн.`}</title>
              </rect>
              <text x={x + w / 2} y={y - 7} textAnchor="middle" style={{ fontSize: 10.5, fontWeight: 700, fill: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                {nf(r[field])}
              </text>
              <text x={x + w / 2} y={H - padB + 15} textAnchor="middle" style={{ fontSize: 10, fill: 'var(--text-muted)' }}>
                {monthLabel(r.month)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** Тижні: площа + лінія по показах, остання точка виділена. */
function WeekArea({ rows }: { rows: WeekRow[] }) {
  const W = 960, H = 210, padT = 18, padB = 30;
  const max = Math.max(...rows.map(r => r.impressions), 1);
  const stepX = rows.length > 1 ? W / (rows.length - 1) : W;
  const y = (v: number) => H - padB - (H - padB - padT) * (v / max);
  const pts = rows.map((r, i) => [i * stepX, y(r.impressions)] as const);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  const areaD = `${d} L ${pts[pts.length - 1][0].toFixed(1)} ${H - padB} L 0 ${H - padB} Z`;
  return (
    <div style={card}>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)' }}>Покази по тижнях</div>
      <div style={{ ...hint, marginBottom: 6 }}>остання точка — неповний тиждень, дані Search Console обриваються на {dm(rows[rows.length - 1].week)}</div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', width: '100%', height: 'auto', overflow: 'visible' }} role="img">
        {[0.5, 1].map(f => (
          <g key={f}>
            <line x1={0} y1={y(max * f)} x2={W} y2={y(max * f)} stroke="var(--border)" strokeWidth={1} />
            <text x={0} y={y(max * f) - 5} style={{ fontSize: 10, fill: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{nf(max * f)}</text>
          </g>
        ))}
        <path d={areaD} fill={ACCENT} opacity={0.13} />
        <path d={d} fill="none" stroke={ACCENT} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r={4.5} fill={ACCENT} stroke="var(--bg-card)" strokeWidth={2} />
        {rows.map((r, i) => (
          <g key={r.week}>
            <rect x={pts[i][0] - stepX / 2} y={padT} width={stepX} height={H - padT - padB} fill="transparent">
              <title>{`тиждень з ${dm(r.week)}: ${nf(r.impressions)} показів, ${nf(r.clicks)} переходів, позиція ${r.position.toFixed(1)}`}</title>
            </rect>
            {(i % 3 === 0 || i === rows.length - 1) && (
              <text x={pts[i][0]} y={H - padB + 15} textAnchor="middle" style={{ fontSize: 10, fill: 'var(--text-muted)' }}>{dm(r.week)}</text>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}

/** Типи сторінок: товста смуга — зараз, тонка сіра — попередній період. */
function KindBars({ rows }: { rows: KindRow[] }) {
  const W = 960, rowH = 44, labelW = 96, padR = 70;
  const H = rows.length * rowH + 6;
  const max = Math.max(...rows.map(r => Math.max(r.impressions, r.prevImpressions)), 1);
  const scale = (v: number) => (W - labelW - padR) * (v / max);
  return (
    <div style={card}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', width: '100%', height: 'auto', overflow: 'visible' }} role="img">
        {rows.map((r, i) => {
          const top = i * rowH + 4;
          return (
            <g key={r.kind}>
              <text x={0} y={top + 19} style={{ fontSize: 12, fontWeight: 600, fill: 'var(--text-primary)' }}>{r.kind}</text>
              <rect x={labelW} y={top + 2} width={Math.max(scale(r.impressions), 2)} height={15} rx={4} fill={ACCENT}>
                <title>{`${r.kind} зараз: ${nf(r.impressions)} показів, ${nf(r.clicks)} переходів`}</title>
              </rect>
              <rect x={labelW} y={top + 21} width={Math.max(scale(r.prevImpressions), 2)} height={9} rx={4} fill={REF}>
                <title>{`${r.kind} раніше: ${nf(r.prevImpressions)} показів, ${nf(r.prevClicks)} переходів`}</title>
              </rect>
              <text x={labelW + Math.max(scale(r.impressions), 2) + 8} y={top + 14}
                style={{ fontSize: 11, fontWeight: 700, fill: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                {nf(r.impressions)}
              </text>
            </g>
          );
        })}
      </svg>
      <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--text-secondary)', marginTop: 8 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <i style={{ width: 10, height: 10, borderRadius: 2, background: ACCENT, display: 'inline-block' }} /> поточний період
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <i style={{ width: 10, height: 10, borderRadius: 2, background: REF, display: 'inline-block' }} /> попередній
        </span>
      </div>
    </div>
  );
}

function PageTable({ rows, showPrev }: { rows: PageRow[]; showPrev?: boolean }) {
  return (
    <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 620 }}>
        <thead>
          <tr>
            <th style={{ ...th, paddingTop: 14 }}>Сторінка</th>
            <th style={{ ...th, paddingTop: 14, textAlign: 'right' }}>Покази</th>
            {showPrev && <th style={{ ...th, paddingTop: 14, textAlign: 'right' }}>Було</th>}
            <th style={{ ...th, paddingTop: 14, textAlign: 'right' }}>Переходи</th>
            <th style={{ ...th, paddingTop: 14, textAlign: 'right' }}>Позиція</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(p => (
            <tr key={p.path}>
              <td style={td}>
                <span style={pathStyle}>{p.path}</span>
                <span style={{ fontSize: 10.5, fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: 'var(--bg-soft)', color: 'var(--text-muted)', marginLeft: 8, whiteSpace: 'nowrap' }}>
                  {p.kind}
                </span>
              </td>
              <td style={tdNum}>{nf(p.impressions)}</td>
              {showPrev && <td style={{ ...tdNum, color: 'var(--text-muted)' }}>{p.prevImpressions ? nf(p.prevImpressions) : '—'}</td>}
              <td style={tdNum}>{nf(p.clicks)}</td>
              <td style={tdNum}>{p.position.toFixed(1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function QueryTable({ rows, showClicks = true }: { rows: QueryRow[]; showClicks?: boolean }) {
  return (
    <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520 }}>
        <thead>
          <tr>
            <th style={{ ...th, paddingTop: 14 }}>Запит</th>
            <th style={{ ...th, paddingTop: 14, textAlign: 'right' }}>Покази</th>
            {showClicks && <th style={{ ...th, paddingTop: 14, textAlign: 'right' }}>Переходи</th>}
            <th style={{ ...th, paddingTop: 14, textAlign: 'right' }}>Позиція</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(q => (
            <tr key={q.query}>
              <td style={td}>{q.query}</td>
              <td style={tdNum}>{nf(q.impressions)}</td>
              {showClicks && <td style={tdNum}>{nf(q.clicks)}</td>}
              <td style={tdNum}><Pill tone={q.position <= 10 ? 'up' : 'down'}>{q.position.toFixed(1)}</Pill></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ReportView({ report, days }: { report: SearchReport; days: 28 | 90 }) {
  const r = report;
  const ratio = r.prev.clicks ? r.cur.clicks / r.prev.clicks : null;
  const posBetter = r.prev.position - r.cur.position;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 26, maxWidth: 1060 }}>
      <header>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
          Search Console · {r.window.first} — {r.window.last}
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: 'var(--text-primary)', margin: '8px 0 0', letterSpacing: '-0.02em' }}>
          Зведений звіт про пошуковий трафік
        </h1>
        <p style={{ ...hint, marginTop: 8, maxWidth: '68ch' }}>
          Період: {r.curPeriod.from} — {r.curPeriod.to} проти {r.prevPeriod.from} — {r.prevPeriod.to}.
          Дані по сторінках беруться з нашої історії, запити — живим запитом до Google.
          Позиція скрізь зважена показами.
        </p>
        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginTop: 12, fontSize: 12.5, color: 'var(--text-muted)' }}>
          <span><b style={{ color: 'var(--text-secondary)' }}>{r.window.days}</b> днів спостережень</span>
          <span><b style={{ color: 'var(--text-secondary)' }}>{nf(r.totals.pages)}</b> сторінок у видачі</span>
          <span><b style={{ color: 'var(--text-secondary)' }}>{nf(r.totals.clicks)}</b> переходів за весь час</span>
          <span><b style={{ color: 'var(--text-secondary)' }}>{nf(r.totals.impressions)}</b> показів за весь час</span>
        </div>
      </header>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
        <Kpi label={`Переходи за ${days} днів`} value={nf(r.cur.clicks)}
          tone={ratio && ratio >= 1.1 ? 'up' : ratio && ratio <= 0.9 ? 'down' : 'flat'}
          sub={ratio ? `×${ratio.toFixed(1)}` : undefined} />
        <Kpi label="Покази" value={nf(r.cur.impressions)}
          tone={r.prev.impressions && r.cur.impressions / r.prev.impressions >= 1.1 ? 'up' : 'flat'}
          sub={r.prev.impressions ? `×${(r.cur.impressions / r.prev.impressions).toFixed(1)}` : undefined} />
        <Kpi label="CTR" value={`${r.cur.ctr.toFixed(2)}%`}
          tone={Math.abs(r.cur.ctr - r.prev.ctr) < 0.15 ? 'flat' : r.cur.ctr > r.prev.ctr ? 'up' : 'down'}
          sub={Math.abs(r.cur.ctr - r.prev.ctr) < 0.15 ? 'без змін' : `${r.cur.ctr > r.prev.ctr ? '+' : ''}${(r.cur.ctr - r.prev.ctr).toFixed(2)} п.п.`} />
        <Kpi label="Середня позиція" value={r.cur.position.toFixed(1)}
          tone={posBetter > 0.5 ? 'up' : posBetter < -0.5 ? 'down' : 'flat'}
          sub={`${posBetter > 0 ? '+' : ''}${posBetter.toFixed(1)}`} />
      </section>

      {r.findings.length > 0 && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h2 style={h2}>Що показують цифри</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 }}>
            {r.findings.map((f, i) => (
              <div key={i} style={{ ...card, borderLeft: `3px solid ${f.tone === 'good' ? '#15803D' : f.tone === 'warn' ? '#B45309' : 'var(--brand-blue)'}` }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-primary)' }}>{f.title}</div>
                <p style={{ ...hint, marginTop: 6 }}>{f.text}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h2 style={h2}>Як росли</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
          <MonthBars rows={r.months} field="impressions" title="Покази по місяцях" sub="скільки разів сайт побачили у видачі" />
          <MonthBars rows={r.months} field="clicks" title="Переходи по місяцях" sub="скільки разів по ньому клікнули" />
        </div>
        <WeekArea rows={r.weeks} />
      </section>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h2 style={h2}>Звідки приходять</h2>
        <KindBars rows={r.kinds} />
        <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
            <thead>
              <tr>
                <th style={{ ...th, paddingTop: 14 }}>Тип сторінок</th>
                <th style={{ ...th, paddingTop: 14, textAlign: 'right' }}>Покази</th>
                <th style={{ ...th, paddingTop: 14, textAlign: 'right' }}>Переходи</th>
                <th style={{ ...th, paddingTop: 14, textAlign: 'right' }}>CTR</th>
                <th style={{ ...th, paddingTop: 14, textAlign: 'right' }}>Частка переходів</th>
              </tr>
            </thead>
            <tbody>
              {r.kinds.map(k => (
                <tr key={k.kind}>
                  <td style={td}>{k.kind}</td>
                  <td style={tdNum}>{nf(k.impressions)}</td>
                  <td style={tdNum}>{nf(k.clicks)}</td>
                  <td style={{ ...tdNum, color: k.impressions >= 500 && k.ctr < 0.3 ? '#B45309' : 'var(--text-primary)', fontWeight: k.impressions >= 500 && k.ctr < 0.3 ? 700 : 400 }}>
                    {k.ctr.toFixed(2)}%
                  </td>
                  <td style={tdNum}>{Math.round(k.clickShare)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h2 style={h2}>Сторінки-локомотиви</h2>
        <PageTable rows={r.topPages} showPrev />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 12 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 8 }}>Найбільше додали</div>
            <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr><th style={{ ...th, paddingTop: 14 }}>Сторінка</th><th style={{ ...th, paddingTop: 14, textAlign: 'right' }}>Приріст</th></tr></thead>
                <tbody>
                  {r.growth.map(p => (
                    <tr key={p.path}>
                      <td style={td}><span style={pathStyle}>{p.path}</span></td>
                      <td style={tdNum}><Pill tone="up">+{nf(p.delta)}</Pill></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 8 }}>Просіли</div>
            <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr><th style={{ ...th, paddingTop: 14 }}>Сторінка</th><th style={{ ...th, paddingTop: 14, textAlign: 'right' }}>Втрата</th></tr></thead>
                <tbody>
                  {r.decline.length === 0 && (
                    <tr><td style={{ ...td, color: 'var(--text-muted)' }} colSpan={2}>Помітних втрат немає</td></tr>
                  )}
                  {r.decline.map(p => (
                    <tr key={p.path}>
                      <td style={td}><span style={pathStyle}>{p.path}</span></td>
                      <td style={tdNum}><Pill tone="down">{nf(p.delta)}</Pill></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h2 style={h2}>Запити</h2>
        {r.queriesError ? (
          <div style={{ ...card, color: '#B45309' }}>
            Search Console не віддала запити: {r.queriesError}. Решта звіту рахується з нашої історії й лишається вірною.
          </div>
        ) : (
          <>
            <div style={hint}>Топ-20 за показами. Позиція нижче 10 — перша сторінка видачі, все інше практично не дає переходів.</div>
            <QueryTable rows={r.queries} />
            {r.zeroClick.length > 0 && (
              <>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', marginTop: 6 }}>
                  Показів багато, переходів нуль
                </div>
                <QueryTable rows={r.zeroClick} showClicks={false} />
              </>
            )}
            {r.newQueries.length > 0 && (
              <>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', marginTop: 6 }}>
                  Нові запити — місяцем раніше показів по них не було
                </div>
                <QueryTable rows={r.newQueries} showClicks={false} />
              </>
            )}
          </>
        )}
      </section>

      {r.orders.length > 0 && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h2 style={h2}>Для контексту: замовлення</h2>
          <div style={hint}>
            Усі канали разом. Прямого зв&apos;язку з пошуком це не доводить — більшість замовлень
            приходить з маркетплейсів, — але показує, у який бік рухається справа.
          </div>
          <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 480 }}>
              <thead>
                <tr>
                  <th style={{ ...th, paddingTop: 14 }}>Місяць</th>
                  <th style={{ ...th, paddingTop: 14, textAlign: 'right' }}>Замовлень</th>
                  <th style={{ ...th, paddingTop: 14, textAlign: 'right' }}>Виручка</th>
                  <th style={{ ...th, paddingTop: 14, textAlign: 'right' }}>З сайту</th>
                </tr>
              </thead>
              <tbody>
                {r.orders.map(o => (
                  <tr key={o.month}>
                    <td style={td}>{monthLabel(o.month)}</td>
                    <td style={tdNum}>{nf(o.count)}</td>
                    <td style={tdNum}>{nf(o.revenue)} ₴</td>
                    <td style={tdNum}>{nf(o.fromSite)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <footer style={{ borderTop: '1px solid var(--border)', paddingTop: 16, ...hint }}>
        Сформовано {new Date(r.generatedAt).toLocaleString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}.
        Search Console добирає дані із затримкою 2–3 дні, тому періоди відлічуються від {r.window.last}, а не від сьогодні.
      </footer>
    </div>
  );
}

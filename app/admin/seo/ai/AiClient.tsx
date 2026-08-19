'use client';

import { useEffect, useState } from 'react';
import { badge, card, chip, hint, num, path as pathStyle, td, tdNum, th, TONE } from '../ui';
import { TrendBadge } from '../../finance/overview-charts';
import HelpBox from '../HelpBox';
import { HELP_AI } from '../help-content';
import { botLabel, referralLabel } from '../../../../lib/ai-crawlers';

// Вкладка «ШІ»: чи читають нас пошуковики на базі мовних моделей і чи приходять
// звідти люди. Дані пише proxy на межі запиту — клієнтська аналітика тут
// безсила: краулер не виконує JavaScript, для GA його не існує.

type Bot = {
  bot: string;
  hits: number;
  prev: number;
  purpose: 'search' | 'user' | 'training' | 'token';
  sections: { section: string; hits: number }[];
};
type Referral = { source: string; hits: number; prev: number };
type Landing = { source: string; path: string; hits: number };
type Data = {
  window: { from: string; to: string; days: number };
  totals: { bots: number; botsPrev: number; referrals: number; referralsPrev: number };
  bots: Bot[];
  referrals: Referral[];
  landings: Landing[];
  series: { day: string; bots: number; referrals: number }[];
};

const PURPOSE: Record<Bot['purpose'], { label: string; tone: 'ok' | 'info' | 'muted' }> = {
  search:   { label: 'пошук',    tone: 'ok' },
  user:     { label: 'перехід',  tone: 'info' },
  training: { label: 'навчання', tone: 'muted' },
  token:    { label: 'директива', tone: 'muted' },
};

/**
 * Стовпчики по днях. Дві метрики — два графіки з власною шкалою, а не один із
 * двома осями: візитів ботів сотні, переходів одиниці, і на спільній шкалі
 * друга серія лягла б у нуль, вдаючи, що переходів немає взагалі.
 */
function DayBars({ values, labels, color, title }: {
  values: number[]; labels: string[]; color: string; title: string;
}) {
  const max = Math.max(...values, 1);
  const total = values.reduce((s, v) => s + v, 0);
  const w = 100, h = 34;               // viewBox; реальний розмір тягнеться по контейнеру
  const n = Math.max(values.length, 1);
  const slot = w / n;
  const barW = Math.max(slot - 0.35, 0.4);  // проміжок ≈ товщина лінії, бари не злипаються

  return (
    <div style={{ ...card, padding: '12px 14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>{title}</span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>усього {num(total)}</span>
      </div>
      {total === 0 ? (
        <div style={{ height: 60, display: 'flex', alignItems: 'center', fontSize: 12, color: 'var(--text-muted)' }}>
          за період нічого не зафіксовано
        </div>
      ) : (
        <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none"
          style={{ width: '100%', height: 60, display: 'block' }}
          role="img" aria-label={`${title}: ${total} за період`}>
          <line x1="0" y1={h} x2={w} y2={h} stroke="var(--border)" strokeWidth="0.3" vectorEffect="non-scaling-stroke" />
          {values.map((v, i) => {
            const bh = v === 0 ? 0 : Math.max(0.6, (v / max) * (h - 2));
            return v === 0 ? null : (
              <rect key={i} x={i * slot} y={h - bh} width={barW} height={bh} fill={color} rx="0.3">
                <title>{`${labels[i]}: ${v}`}</title>
              </rect>
            );
          })}
        </svg>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: 'var(--text-muted)', marginTop: 4 }}>
        <span>{labels[0]}</span>
        <span>{labels[labels.length - 1]}</span>
      </div>
    </div>
  );
}

function Kpi({ label, value, prev, note }: { label: string; value: number; prev: number; note: string }) {
  return (
    <div style={{ ...card, flex: '1 1 240px' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, margin: '6px 0 4px' }}>
        <span style={{ fontSize: 26, fontWeight: 800, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
          {num(value)}
        </span>
        <TrendBadge cur={value} prev={prev} />
      </div>
      <div style={{ ...hint, fontSize: 11.5 }}>{note}</div>
    </div>
  );
}

export default function AiClient() {
  const [days, setDays] = useState<7 | 28 | 90>(28);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setData(null);
    setError('');
    fetch(`/api/admin/seo/ai?days=${days}`)
      .then(async res => {
        const d = await res.json();
        if (!res.ok) throw new Error(d.error ?? res.statusText);
        setData(d);
      })
      .catch(err => setError(String(err instanceof Error ? err.message : err)));
  }, [days]);

  const dayLabel = (iso: string) => iso.slice(8, 10) + '.' + iso.slice(5, 7);

  return (
    <div>
      <HelpBox content={HELP_AI} />

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        {([7, 28, 90] as const).map(p => (
          <button key={p} onClick={() => setDays(p)} style={chip(days === p)}>{p} днів</button>
        ))}
        <span style={{ ...hint, marginLeft: 'auto' }}>
          {error && <span style={{ color: TONE.danger }}>Не вдалося завантажити: {error.slice(0, 200)}</span>}
          {!error && !data && 'Завантажуємо…'}
          {!error && data && `${data.window.from} — ${data.window.to}, порівняння з попередніми ${days} днями`}
        </span>
      </div>

      {data && (
        <>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 14 }}>
            <Kpi label="Візити ШІ-краулерів" value={data.totals.bots} prev={data.totals.botsPrev}
              note="Скільки разів роботи ChatGPT, Gemini, Perplexity та інших читали сторінки. Це покази, не продажі." />
            <Kpi label="Переходи з чат-ботів" value={data.totals.referrals} prev={data.totals.referralsPrev}
              note="Живі люди, які прийшли з відповіді ШІ. Саме ця цифра перетворюється на замовлення." />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14, marginBottom: 18 }}>
            <DayBars title="Візити краулерів по днях" color="var(--brand-blue)"
              values={data.series.map(s => s.bots)} labels={data.series.map(s => dayLabel(s.day))} />
            <DayBars title="Переходи людей по днях" color="var(--color-success)"
              values={data.series.map(s => s.referrals)} labels={data.series.map(s => dayLabel(s.day))} />
          </div>

          <div style={{ ...card, padding: 0, overflow: 'hidden', marginBottom: 18 }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
              <b style={{ fontSize: 13, color: 'var(--text-primary)' }}>Хто нас читає</b>
              <p style={{ ...hint, margin: '4px 0 0' }}>
                Впливають на появу у відповідях лише боти з типом <b>пошук</b>. «Навчання» — збір корпусу для моделі,
                на цитування сайту не впливає.
              </p>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={th}>Бот</th>
                  <th style={th}>Тип</th>
                  <th style={{ ...th, textAlign: 'right' }}>Візити</th>
                  <th style={{ ...th, textAlign: 'right' }}>Зміна</th>
                  <th style={th}>Що читає</th>
                </tr>
              </thead>
              <tbody>
                {data.bots.length === 0 && (
                  <tr><td style={{ ...td, color: 'var(--text-muted)' }} colSpan={5}>
                    Жодного візиту ШІ-краулера за період. Для щойно увімкненого обліку це нормально: перші заходи
                    зазвичай зʼявляються протягом двох тижнів.
                  </td></tr>
                )}
                {data.bots.map(b => (
                  <tr key={b.bot}>
                    <td style={td}><b>{botLabel(b.bot)}</b><div style={{ ...hint, fontSize: 11 }}>{b.bot}</div></td>
                    <td style={td}><span style={badge(PURPOSE[b.purpose].tone)}>{PURPOSE[b.purpose].label}</span></td>
                    <td style={tdNum}>{num(b.hits)}</td>
                    <td style={{ ...tdNum, textAlign: 'right' }}><TrendBadge cur={b.hits} prev={b.prev} /></td>
                    <td style={td}>
                      {b.sections.slice(0, 5).map(s => `${s.section} (${s.hits})`).join(' · ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14 }}>
            <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                <b style={{ fontSize: 13, color: 'var(--text-primary)' }}>Звідки приходять люди</b>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={th}>Джерело</th>
                    <th style={{ ...th, textAlign: 'right' }}>Переходи</th>
                    <th style={{ ...th, textAlign: 'right' }}>Зміна</th>
                  </tr>
                </thead>
                <tbody>
                  {data.referrals.length === 0 && (
                    <tr><td style={{ ...td, color: 'var(--text-muted)' }} colSpan={3}>Переходів ще не було</td></tr>
                  )}
                  {data.referrals.map(r => (
                    <tr key={r.source}>
                      <td style={td}>{referralLabel(r.source)}</td>
                      <td style={tdNum}>{num(r.hits)}</td>
                      <td style={{ ...tdNum, textAlign: 'right' }}><TrendBadge cur={r.hits} prev={r.prev} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                <b style={{ fontSize: 13, color: 'var(--text-primary)' }}>Куди приводять</b>
                <p style={{ ...hint, margin: '4px 0 0' }}>Сторінки, які ШІ фактично радить. Їх і треба дотискати.</p>
              </div>
              <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-soft)', zIndex: 1 }}>
                    <tr>
                      <th style={th}>Сторінка</th>
                      <th style={th}>Джерело</th>
                      <th style={{ ...th, textAlign: 'right' }}>Переходи</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.landings.length === 0 && (
                      <tr><td style={{ ...td, color: 'var(--text-muted)' }} colSpan={3}>Поки порожньо</td></tr>
                    )}
                    {data.landings.map(l => (
                      <tr key={`${l.source}${l.path}`}>
                        <td style={td}><span style={pathStyle}>{l.path}</span></td>
                        <td style={td}>{referralLabel(l.source)}</td>
                        <td style={tdNum}>{num(l.hits)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div style={{ ...card, marginTop: 18 }}>
            <b style={{ fontSize: 13, color: 'var(--text-primary)' }}>Що саме бачить ШІ</b>
            <p style={{ ...hint, margin: '6px 0 8px' }}>
              Крім звичайних сторінок сайт віддає моделям окремий полегшений шар — самі факти без розмітки.
              Посилання відкриваються у новій вкладці, це публічні адреси.
            </p>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 13 }}>
              <a href="/llms.txt" target="_blank" rel="noreferrer" style={{ color: 'var(--brand-blue)' }}>/llms.txt — карта сайту для моделей</a>
              <a href="/robots.txt" target="_blank" rel="noreferrer" style={{ color: 'var(--brand-blue)' }}>/robots.txt — кого пускаємо</a>
              <span style={{ color: 'var(--text-muted)' }}>
                будь-який товар чи категорія у Markdown: додай <code>.md</code> до адреси
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

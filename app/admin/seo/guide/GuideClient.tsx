'use client';

import Link from 'next/link';
import { HelpBody, HelpTableView } from '../HelpBox';
import { HELP_ALL, HELP_QUERIES, SECTION_LIMITS, WEEKLY_CYCLE } from '../help-content';
import { card, hint, TONE } from '../ui';

// Довідник = ті самі константи, що показує довідка всередині кожного екрана
// (HELP_*), зібрані в одну сторінку. Копії тексту немає навмисне: інакше
// формулювання неминуче розійшлися б між екраном і посібником.
//
// Свідомо БЕЗ поточних цифр (CTR, скільки запитів у діапазоні): вони живуть на
// самих вкладках і там завжди свіжі, а в посібнику зачерствіли б за місяць.

const mono = 'ui-monospace, monospace';

const PRIORITY: Record<string, { label: string; tone: string }> = {
  hot:  { label: 'починати звідси', tone: TONE.danger },
  warm: { label: 'робоча лошадка',  tone: TONE.warn },
  cool: { label: 'зрідка',          tone: 'var(--text-muted)' },
  idle: { label: 'за потреби',      tone: 'var(--color-success)' },
};

const eyebrow: React.CSSProperties = {
  fontFamily: mono, fontSize: 10.5, fontWeight: 700,
  textTransform: 'uppercase', letterSpacing: '0.08em',
  color: 'var(--text-muted)', marginBottom: 10,
};

const h2: React.CSSProperties = {
  fontSize: 19, fontWeight: 750, color: 'var(--text-primary)',
  margin: '0 0 6px', letterSpacing: '-0.01em',
};

export default function GuideClient() {
  return (
    <div style={{ maxWidth: 940 }}>

      {/* Головне правило */}
      <section style={{ ...card, borderLeft: '3px solid var(--brand-blue)', marginBottom: 22 }}>
        <div style={{ ...eyebrow, color: 'var(--brand-blue)', marginBottom: 8 }}>Головне правило</div>
        <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6, color: 'var(--text-primary)' }}>
          Спершу дивимось на <b>позицію</b>, і лише потім вирішуємо, що робити.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12, marginTop: 14 }}>
          <RuleCard pos="1–7" tone={TONE.danger} what="Проблема у сніпеті" to="/admin/seo/snippets" cta="Сніпети" />
          <RuleCard pos="8–35" tone={TONE.warn} what="Працює дожим контентом" to="/admin/seo" cta="Запити" />
          <RuleCard pos="36+" tone="var(--text-muted)" what="Надто далеко — пропустити" />
        </div>
        <p style={{ ...hint, margin: '14px 0 0' }}>
          Найчастіша помилка — дожимати контентом сторінку, яка вже на 5-му місці. Контент там ні до чого:
          її просто не клікають.
        </p>
      </section>

      {/* Тижневий цикл */}
      <section style={{ marginBottom: 26 }}>
        <h2 style={h2}>Тижневий цикл</h2>
        <p style={{ ...hint, margin: '0 0 14px' }}>
          Порядок не довільний: кожен крок звужує вибір для наступного. Повний прохід — 30–40 хвилин.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {WEEKLY_CYCLE.map((step, i) => (
            <div key={i} style={{ ...card, display: 'grid', gridTemplateColumns: '34px 1fr', gap: 16, alignItems: 'start' }}>
              <div style={{ fontFamily: mono, fontSize: 19, fontWeight: 700, color: 'var(--brand-blue)', lineHeight: 1.35 }}>
                {i + 1}
              </div>
              <div>
                <div style={{ fontFamily: mono, fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)' }}>
                  {step.when}
                </div>
                <Link href={step.href} style={{ fontSize: 14.5, fontWeight: 650, color: 'var(--text-primary)', textDecoration: 'none' }}>
                  {step.title} <span style={{ color: 'var(--brand-blue)' }}>→</span>
                </Link>
                <p style={{ margin: '4px 0 0', fontSize: 13.5, lineHeight: 1.5, color: 'var(--text-secondary)' }}>{step.text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Таблиця рішень */}
      <section style={{ marginBottom: 26 }}>
        <h2 style={h2}>Що якою дією лагодиться</h2>
        <p style={{ ...hint, margin: '0 0 14px' }}>
          Відповідає на єдине питання перед кожним запуском: тиснути «Посилити товар», «Стаття під запит»
          чи взагалі не тиснути.
        </p>
        <div style={card}>
          {HELP_QUERIES.table && <HelpTableView table={HELP_QUERIES.table} />}
        </div>
      </section>

      {/* Довідка по кожній вкладці */}
      <section style={{ marginBottom: 26 }}>
        <h2 style={h2}>Вкладки розділу</h2>
        <p style={{ ...hint, margin: '0 0 14px' }}>
          Той самий текст, що й у блоці «Як користуватись» на кожному екрані — тут зібраний разом.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {HELP_ALL.map(c => {
            const prio = PRIORITY[c.priority];
            return (
              <div key={c.id} style={card}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
                  <Link href={c.route} style={{ fontSize: 17, fontWeight: 750, color: 'var(--text-primary)', textDecoration: 'none', letterSpacing: '-0.01em' }}>
                    {c.label} <span style={{ color: 'var(--brand-blue)', fontWeight: 400 }}>→</span>
                  </Link>
                  <code style={{ fontFamily: mono, fontSize: 12, color: 'var(--text-muted)' }}>{c.route}</code>
                  <span style={{
                    marginLeft: 'auto', fontFamily: mono, fontSize: 10, fontWeight: 700,
                    textTransform: 'uppercase', letterSpacing: '0.07em',
                    color: prio.tone, border: `1px solid ${prio.tone}`,
                    borderRadius: 999, padding: '2px 9px', whiteSpace: 'nowrap',
                  }}>
                    {c.cadence}
                  </span>
                </div>
                <HelpBody content={c} showTable={false} />
              </div>
            );
          })}
        </div>
      </section>

      {/* Межі */}
      <section style={{ marginBottom: 26 }}>
        <h2 style={h2}>Чого розділ не робить</h2>
        <p style={{ ...hint, margin: '0 0 14px' }}>Щоб не шукати кнопку, якої немає.</p>
        <div style={card}>
          <HelpTableView table={SECTION_LIMITS} />
        </div>
      </section>

      <p style={{ ...hint, borderTop: '1px solid var(--border)', paddingTop: 16, margin: 0 }}>
        Дані Search Console відстають на 2–3 дні — усі вікна в розділі відлічуються від останньої повної
        дати, а не від сьогодні. Історію поповнює щоденний крон <code>gsc-snapshot</code>; період
        порівняння в колонці «Зміна» — попередній відрізок такої ж довжини.
      </p>
    </div>
  );
}

function RuleCard({ pos, tone, what, to, cta }: {
  pos: string; tone: string; what: string; to?: string; cta?: string;
}) {
  return (
    <div style={{ background: 'var(--bg-soft)', borderRadius: 8, padding: '12px 14px', borderLeft: `3px solid ${tone}` }}>
      <div style={{ fontFamily: mono, fontSize: 17, fontWeight: 700, color: tone, lineHeight: 1.2 }}>{pos}</div>
      <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>{what}</div>
      {to && cta && (
        <Link href={to} style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--brand-blue)', textDecoration: 'none' }}>
          {cta} →
        </Link>
      )}
    </div>
  );
}

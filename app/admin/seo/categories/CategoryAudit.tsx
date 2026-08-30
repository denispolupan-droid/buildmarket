'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { CategoryAuditRow, CategoryAuditGaps } from '../../../../lib/seo/category-audit';
import { badge, card, chip, hint, TONE, type Tone } from '../ui';
import HelpBox from '../HelpBox';
import { HELP_CATEGORIES } from '../help-content';

const GAP_LABELS: { key: keyof CategoryAuditGaps; label: string; tone: Tone; explain: string }[] = [
  { key: 'staleBrands',   label: 'бренд зник',       tone: 'danger', explain: 'Текст називає бренд, якого в категорії вже немає' },
  { key: 'noProducts',    label: 'порожня сторінка', tone: 'danger', explain: 'Є текст, але жодного активного товару — сторінка нічого не продає' },
  { key: 'noMeta',        label: 'немає тексту',     tone: 'danger', explain: 'Є товар, але категорія без курованого опису' },
  { key: 'deadBlogLink',  label: 'стаття в 404',     tone: 'danger', explain: 'blogSlug вказує на статтю, якої немає — кнопка «Читати статтю» веде в 404' },
  { key: 'missingBrands', label: 'бренд не згаданий', tone: 'warn',  explain: 'Помітна частка асортименту не потрапила в перелік' },
  { key: 'noCatalogLine', label: 'немає переліку',   tone: 'warn',   explain: 'У seoText немає речення з асортиментом — текст не привʼязаний до каталогу' },
  { key: 'noGuide',       label: 'немає гайда',      tone: 'warn',   explain: '5+ товарів і ≥ 25 показів за 28 днів, а гайда «Як вибрати» немає — стандарт 1.4' },
  { key: 'guideNoBuy',    label: 'гайд без «купити»', tone: 'warn',  explain: 'У гайді немає розділу «Де купити» — ні «купити», ні «ціна». Сторінка комерційна, текст — порада' },
  { key: 'deadPriceSku',  label: 'ціна на знятий товар', tone: 'danger', explain: 'Токен {price:SKU} у гайді/FAQ посилається на артикул, якого немає серед активних товарів — речення з ним не показується. Замінити артикул' },
  { key: 'h1Mismatch',    label: 'H1 ≠ запит',       tone: 'warn',   explain: 'Слова найчастішого запиту сторінки не входять у назву категорії (uk або ru) — стандарт 1.2' },
  { key: 'guideMissesChild', label: 'гайд не знає підкатегорію', tone: 'warn', explain: 'У родині зʼявилась підкатегорія з 5+ товарами, на яку гайд не посилається. Дописати абзац і посилання — стандарт 1.4' },
  { key: 'thinCategory',  label: 'тонка категорія',  tone: 'info',   explain: '1–4 товари: пополнити асортимент або не індексувати; гайд не пишемо' },
  { key: 'thinFaq',       label: 'мало FAQ',         tone: 'info',   explain: 'Менше 4 питань хоча б однією мовою; з гайдом — менше 7' },
  { key: 'ruBehind',      label: 'рос. відстає',     tone: 'info',   explain: 'Російська версія коротша за українську або відсутня' },
  { key: 'ruGuideBehind', label: 'рос. гайд відстає', tone: 'info',  explain: 'Російський гайд відсутній або коротший за український більш ніж на 30 %' },
];

const hasGap = (row: CategoryAuditRow) => Object.values(row.gaps).some(Boolean);

export default function CategoryAudit({ rows }: { rows: CategoryAuditRow[] }) {
  // 'any' — лише з зауваженнями (аудит), 'all' — усі категорії: інакше до
  // редактора чистої категорії з цієї вкладки не дістатися
  const [filter, setFilter] = useState<keyof CategoryAuditGaps | 'any' | 'all'>('any');
  const [search, setSearch] = useState('');

  const withGaps = useMemo(() => rows.filter(hasGap), [rows]);
  const visible = useMemo(() => {
    const base = filter === 'all' ? rows : filter === 'any' ? withGaps : withGaps.filter(r => r.gaps[filter]);
    const q = search.trim().toLowerCase();
    return q ? rows.filter(r => r.name.toLowerCase().includes(q) || r.slug.includes(q)) : base;
  }, [rows, withGaps, filter, search]);
  const counts = useMemo(() => {
    const c = {} as Record<keyof CategoryAuditGaps, number>;
    for (const g of GAP_LABELS) c[g.key] = withGaps.filter(r => r.gaps[g.key]).length;
    return c;
  }, [withGaps]);

  return (
    <div>
      <HelpBox content={HELP_CATEGORIES} />
      <p style={{ ...hint, margin: '0 0 14px' }}>
        Розбіжностей: <b style={{ color: 'var(--text-primary)' }}>{withGaps.length}</b> з {rows.length} категорій.
        Бренди звіряються лише в реченні з переліком асортименту (тому, де згадано FIXLINE) — так проза
        на кшталт «конструкційних сталей» не читається як бренд «Сталь». Правила — у <code>docs/CONTENT-STANDARD.md</code>;
        попит — покази за 28 днів із Search Console, рядки відсортовано за ним.
      </p>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        <button onClick={() => setFilter('any')} style={chip(filter === 'any')} title="Категорії, де аудит знайшов розбіжності">
          Із зауваженнями ({withGaps.length})
        </button>
        <button onClick={() => setFilter('all')} style={chip(filter === 'all')} title="Усі категорії з товарами чи текстом — щоб дістатися редактора будь-якої">
          Усі ({rows.length})
        </button>
        {GAP_LABELS.filter(g => counts[g.key] > 0).map(g => (
          <button key={g.key} onClick={() => setFilter(g.key)} title={g.explain} style={chip(filter === g.key)}>
            {g.label} ({counts[g.key]})
          </button>
        ))}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="пошук категорії — назва або slug"
          style={{ marginLeft: 'auto', padding: '6px 10px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-card)', color: 'var(--text-primary)', minWidth: 220 }}
        />
      </div>

      {visible.length === 0 ? (
        <div style={{ ...card, textAlign: 'center', padding: '36px 18px' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-success)' }}>{search ? 'Нічого не знайдено' : 'Розбіжностей немає'}</div>
          <p style={{ ...hint, margin: '6px 0 0' }}>Текст кожної категорії сходиться з фактичним асортиментом.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {visible.map(row => (
            <div key={row.slug} style={card}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                <Link
                  href={`/shop/${row.slug}`}
                  target="_blank"
                  style={{ fontWeight: 600, color: 'var(--text-primary)', textDecoration: 'none' }}
                >
                  {row.name}
                </Link>
                <code style={{ fontSize: 12, color: 'var(--text-muted)' }}>{row.slug}</code>
                <Link href={`/admin/seo/categories/${row.slug}`} style={{ fontSize: 12, fontWeight: 600 }}>
                  {row.gaps.noMeta ? 'створити текст' : 'редагувати'}
                </Link>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>· {row.productCount} товарів</span>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>· FAQ {row.uaFaq}/{row.ruFaq}</span>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>· гайд {row.guideWords.ua ? `${row.guideWords.ua}/${row.guideWords.ru} слів` : '—'}</span>
                {row.demand && (
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }} title="Покази uk+ru за 28 днів і найчастіший запит (GSC)">
                    · {row.demand.impressions} показів{row.demand.topQuery ? ` · «${row.demand.topQuery}»` : ''}
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 6 }}>
                {GAP_LABELS.filter(g => row.gaps[g.key]).map(g => (
                  <span key={g.key} title={g.explain} style={badge(g.tone)}>{g.label}</span>
                ))}
              </div>

              {row.deadBlogSlug && (
                <div style={line}>
                  <b style={{ color: TONE.danger }}>Стаття не існує:</b> <code>/blog/{row.deadBlogSlug}</code>{' '}
                  — приберіть <code>blogSlug</code> або вкажіть наявну статтю
                </div>
              )}
              {row.staleBrands.length > 0 && (
                <div style={line}>
                  <b style={{ color: TONE.danger }}>У тексті, але не в каталозі:</b> {row.staleBrands.join(', ')}
                </div>
              )}
              {row.missingBrands.length > 0 && (
                <div style={line}>
                  <b style={{ color: TONE.warn }}>Є в каталозі, але не в тексті:</b>{' '}
                  {row.missingBrands
                    .map(b => `${b} (${row.actualBrands.find(a => a.brand === b)?.count ?? 0})`)
                    .join(', ')}
                </div>
              )}
              {row.unlinkedChildren.length > 0 && (
                <div style={line}>
                  <b style={{ color: TONE.warn }}>Гайд не веде в підкатегорії:</b>{' '}
                  {row.unlinkedChildren.map(s => <code key={s} style={{ marginRight: 8 }}>/shop/{s}</code>)}
                </div>
              )}
              {row.actualBrands.length > 0 && (
                <div style={{ ...line, color: 'var(--text-muted)' }}>
                  Фактично: {row.actualBrands.slice(0, 8).map(b => `${b.brand} (${b.count})`).join(', ')}
                  {row.actualBrands.length > 8 ? ' …' : ''}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const line: React.CSSProperties = { fontSize: 13, lineHeight: 1.5, color: 'var(--text-secondary)' };

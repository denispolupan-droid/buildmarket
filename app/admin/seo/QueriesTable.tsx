'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { badge, card, chip, hint, num, pct, path as pathStyle, td, tdNum, th, TONE } from './ui';
import { actionKey, KIND_LABEL, type PageAction } from './use-seo-actions';

// Таблиця запитів Search Console. Раніше тут було вікно на 25 рядків без
// фільтрів, а сам звіт обрізався на 500 рядках за кліками — тобто найцінніші
// запити (багато показів, нуль кліків) не доходили взагалі. Тепер приходить
// увесь звіт, а звужують його фільтри.

export type QueryRow = {
  query: string;
  page: string;
  path: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  prev: { clicks: number; impressions: number; position: number } | null;
};

const RANGES = [
  { key: 'boost', label: 'Дожим 8–35', min: 8, max: 35, hint: 'Друга-третя сторінка: найдешевший приріст' },
  { key: 'top',   label: 'Топ 1–7',    min: 0, max: 7,  hint: 'Уже в топі — тут працює сніпет, а не контент' },
  { key: 'tail',  label: 'Хвіст 36+',  min: 36, max: 1000, hint: 'Далеко; контентом швидко не дотягнути' },
  { key: 'all',   label: 'Усі',        min: 0, max: 1000, hint: 'Весь звіт' },
] as const;

const PERIODS = [7, 28, 90] as const;

type SortKey = 'impressions' | 'clicks' | 'position' | 'ctr' | 'delta';

/** slug категорії з /shop/<slug> (uk або /ru), інакше null — для посилання в редактор */
export function categorySlug(p: string): string | null {
  const m = p.replace(/^https?:\/\/[^/]+/, '').replace(/^\/ru(?=\/)/, '').match(/^\/shop\/([^/?#]+)$/);
  return m && !['sale', 'brand'].includes(m[1]) ? m[1] : null;
}

export function pageKind(p: string): 'product' | 'shop' | 'blog' | 'other' {
  const s = p.replace(/^\/ru/, '');
  if (s.startsWith('/product/')) return 'product';
  if (s.startsWith('/shop')) return 'shop';
  if (s.startsWith('/blog')) return 'blog';
  return 'other';
}

const KIND_FILTERS = [
  { key: 'all', label: 'Усі сторінки' },
  { key: 'product', label: 'Товари' },
  { key: 'shop', label: 'Категорії' },
  { key: 'blog', label: 'Статті' },
  { key: 'other', label: 'Інші' },
] as const;

export default function QueriesTable({
  actions, onPick,
}: {
  actions: Map<string, PageAction>;
  onPick: (query: string, sku: string, path: string) => void;
}) {
  const [days, setDays] = useState<(typeof PERIODS)[number]>(28);
  const [range, setRange] = useState<(typeof RANGES)[number]['key']>('boost');
  const [lang, setLang] = useState<'all' | 'uk' | 'ru'>('all');
  const [kind, setKind] = useState<(typeof KIND_FILTERS)[number]['key']>('all');
  const [search, setSearch] = useState('');
  const [hideDone, setHideDone] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'impressions', desc: true });

  const [rows, setRows] = useState<QueryRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    const r = RANGES.find(x => x.key === range)!;
    setRows(null);
    setError('');
    fetch(`/api/admin/seo/gsc?view=queries&days=${days}&min=${r.min}&max=${r.max}&limit=2000&compare=1`)
      .then(async res => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        setRows(data.rows);
        setTotal(data.total);
      })
      .catch(err => setError(String(err instanceof Error ? err.message : err)));
  }, [days, range]);

  const visible = useMemo(() => {
    if (!rows) return [];
    const q = search.trim().toLowerCase();
    const filtered = rows.filter(r => {
      if (lang === 'ru' && !r.path.startsWith('/ru')) return false;
      if (lang === 'uk' && r.path.startsWith('/ru')) return false;
      if (kind !== 'all' && pageKind(r.path) !== kind) return false;
      if (hideDone && actions.has(actionKey(r.path))) return false;
      if (q && !r.query.toLowerCase().includes(q) && !r.path.toLowerCase().includes(q)) return false;
      return true;
    });
    const delta = (r: QueryRow) => (r.prev ? r.prev.position - r.position : 0);
    const val = (r: QueryRow) =>
      sort.key === 'delta' ? delta(r)
        : sort.key === 'position' ? r.position
          : sort.key === 'ctr' ? r.ctr
            : sort.key === 'clicks' ? r.clicks
              : r.impressions;
    return [...filtered].sort((a, b) => (sort.desc ? val(b) - val(a) : val(a) - val(b)));
  }, [rows, search, lang, kind, hideDone, actions, sort]);

  const shown = visible.slice(0, 300);

  function toggleSort(key: SortKey) {
    setSort(s => (s.key === key ? { key, desc: !s.desc } : { key, desc: key !== 'position' }));
  }

  return (
    <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
          {RANGES.map(r => (
            <button key={r.key} onClick={() => setRange(r.key)} title={r.hint} style={chip(range === r.key)}>
              {r.label}
            </button>
          ))}
          <div style={{ width: 1, height: 22, background: 'var(--border)', margin: '0 4px' }} />
          {PERIODS.map(p => (
            <button key={p} onClick={() => setDays(p)} style={chip(days === p)}>{p} днів</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {KIND_FILTERS.map(k => (
            <button key={k.key} onClick={() => setKind(k.key)} style={chip(kind === k.key)}>{k.label}</button>
          ))}
          <div style={{ width: 1, height: 22, background: 'var(--border)', margin: '0 4px' }} />
          {(['all', 'uk', 'ru'] as const).map(l => (
            <button key={l} onClick={() => setLang(l)} style={chip(lang === l)}>
              {l === 'all' ? 'Обидві мови' : l === 'uk' ? 'Укр' : 'Рос'}
            </button>
          ))}
          <button onClick={() => setHideDone(v => !v)} style={chip(hideDone)} title="Сховати сторінки, з якими вже працювали">
            Сховати дожаті
          </button>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Пошук по запиту або URL"
            style={{
              marginLeft: 'auto', minWidth: 220, padding: '7px 12px', borderRadius: 8,
              border: '1px solid var(--border)', background: 'var(--bg-card)',
              color: 'var(--text-primary)', fontSize: 13,
            }}
          />
        </div>
        <p style={{ ...hint, margin: '10px 0 0' }}>
          {error && <span style={{ color: TONE.danger }}>GSC недоступний: {error.slice(0, 200)}</span>}
          {!error && rows === null && 'Завантажуємо звіт Search Console…'}
          {!error && rows !== null && (
            <>
              У діапазоні: <b style={{ color: 'var(--text-primary)' }}>{num(total)}</b> запитів ·
              після фільтрів: {num(visible.length)}
              {visible.length > shown.length && ` · показано перші ${shown.length}`}
              {' · '}клік по рядку підставляє запит у форму дожиму
            </>
          )}
        </p>
      </div>

      <div style={{ maxHeight: 520, overflowY: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-soft)', zIndex: 1 }}>
            <tr>
              <th style={th}>Запит</th>
              <th style={th}>Сторінка</th>
              <th style={th}>Що робили</th>
              <Sortable label="Позиція" k="position" sort={sort} onSort={toggleSort} />
              <Sortable label="Зміна" k="delta" sort={sort} onSort={toggleSort} />
              <Sortable label="Покази" k="impressions" sort={sort} onSort={toggleSort} />
              <Sortable label="Кліки" k="clicks" sort={sort} onSort={toggleSort} />
              <Sortable label="CTR" k="ctr" sort={sort} onSort={toggleSort} />
            </tr>
          </thead>
          <tbody>
            {shown.map((r, i) => {
              const done = actions.get(actionKey(r.path));
              const m = /\/product\/([^/?#]+)/.exec(r.path);
              const delta = r.prev ? r.prev.position - r.position : null;
              return (
                <tr
                  key={`${r.query}|${r.path}|${i}`}
                  onClick={() => onPick(r.query, m?.[1] ?? '', r.path)}
                  style={{ cursor: 'pointer' }}
                  title="Клік — підставити запит у форму дожиму"
                >
                  <td style={{ ...td, fontWeight: 600 }}>{r.query}</td>
                  <td style={td}>
                    <span style={pathStyle}>{r.path}</span>
                    {categorySlug(r.path) && (
                      <Link
                        href={`/admin/seo/categories/${categorySlug(r.path)}?q=${encodeURIComponent(r.query)}`}
                        onClick={e => e.stopPropagation()}
                        title="Відкрити редактор категорії з цим запитом як ціллю для тексту"
                        style={{ marginLeft: 8, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}
                      >
                        дожати →
                      </Link>
                    )}
                  </td>
                  <td style={td}>
                    {done ? (
                      <span
                        style={badge('ok')}
                        title={`${done.kinds.map(k => KIND_LABEL[k]).join(', ')}${done.query ? ` · запит: «${done.query}»` : ''} · усього дій: ${done.total}`}
                      >
                        ✓ {done.kinds.map(k => KIND_LABEL[k]).join(' + ')} ·{' '}
                        {new Date(done.last_at).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit' })}
                      </span>
                    ) : (
                      <span style={{ color: 'var(--text-muted)' }}>—</span>
                    )}
                  </td>
                  <td style={{ ...tdNum, fontWeight: 700, color: r.position <= 15 ? TONE.warn : 'var(--text-secondary)' }}>
                    {r.position.toFixed(1)}
                  </td>
                  <td style={{ ...tdNum, color: delta == null ? 'var(--text-muted)' : delta > 0.3 ? 'var(--color-success)' : delta < -0.3 ? TONE.danger : 'var(--text-muted)' }}>
                    {delta == null ? '—' : `${delta > 0 ? '↑' : delta < 0 ? '↓' : ''}${Math.abs(delta).toFixed(1)}`}
                  </td>
                  <td style={tdNum}>{num(r.impressions)}</td>
                  <td style={tdNum}>{num(r.clicks)}</td>
                  <td style={tdNum}>{pct(r.ctr)}</td>
                </tr>
              );
            })}
            {rows !== null && shown.length === 0 && (
              <tr><td colSpan={8} style={{ ...td, textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>
                Під ці фільтри запитів немає
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Sortable({
  label, k, sort, onSort,
}: {
  label: string;
  k: SortKey;
  sort: { key: SortKey; desc: boolean };
  onSort: (k: SortKey) => void;
}) {
  const active = sort.key === k;
  return (
    <th
      style={{ ...th, textAlign: 'right', cursor: 'pointer', color: active ? 'var(--brand-blue)' : 'var(--text-muted)' }}
      onClick={() => onSort(k)}
    >
      {label}{active ? (sort.desc ? ' ↓' : ' ↑') : ''}
    </th>
  );
}

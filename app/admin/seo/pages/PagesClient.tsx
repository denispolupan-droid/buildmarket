'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { badge, card, chip, hint, num, path as pathStyle, pct, td, tdNum, th, TONE } from '../ui';
import { actionKey, KIND_LABEL, useSeoActions } from '../use-seo-actions';
import { pageKind } from '../QueriesTable';
import HelpBox from '../HelpBox';
import { HELP_PAGES } from '../help-content';

// Зріз по сторінках: раніше розділ бачив тільки пари «запит × сторінка», тому
// сторінка, яка збирає покази десятками довгих хвостів, ніде не спливала.
// Тут же — канібалізація за фактом видачі й звірка sitemap проти показів.

type PageRow = {
  page: string;
  path: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  prev: { clicks: number; impressions: number; position: number } | null;
};

type Conflict = {
  query: string;
  impressions: number;
  pages: { path: string; impressions: number; clicks: number; position: number }[];
};

type Coverage = {
  sitemapCount: number; withImpressions: number;
  silent: string[]; silentTotal: number;
  extra: { path: string; impressions: number }[]; extraTotal: number;
  days: number;
};

const KIND_FILTERS = [
  { key: 'all', label: 'Усі' },
  { key: 'product', label: 'Товари' },
  { key: 'shop', label: 'Категорії' },
  { key: 'blog', label: 'Статті' },
  { key: 'other', label: 'Інші' },
] as const;

export default function PagesClient() {
  const { actions } = useSeoActions();
  const [days, setDays] = useState<7 | 28 | 90>(28);
  const [kind, setKind] = useState<(typeof KIND_FILTERS)[number]['key']>('all');
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<PageRow[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setRows(null);
    setError('');
    fetch(`/api/admin/seo/gsc?view=pages&days=${days}&limit=2000&compare=1`)
      .then(async res => {
        const d = await res.json();
        if (!res.ok) throw new Error(d.error);
        setRows(d.rows);
      })
      .catch(err => setError(String(err instanceof Error ? err.message : err)));
  }, [days]);

  const visible = useMemo(() => {
    if (!rows) return [];
    const q = search.trim().toLowerCase();
    return rows.filter(r => {
      if (kind !== 'all' && pageKind(r.path) !== kind) return false;
      if (q && !r.path.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, kind, search]);

  const totals = useMemo(() => ({
    impressions: visible.reduce((s, r) => s + r.impressions, 0),
    clicks: visible.reduce((s, r) => s + r.clicks, 0),
  }), [visible]);

  return (
    <div>
      <HelpBox content={HELP_PAGES} />
      <div style={{ ...card, padding: 0, overflow: 'hidden', marginBottom: 18 }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {([7, 28, 90] as const).map(p => (
            <button key={p} onClick={() => setDays(p)} style={chip(days === p)}>{p} днів</button>
          ))}
          <div style={{ width: 1, height: 22, background: 'var(--border)', margin: '0 4px' }} />
          {KIND_FILTERS.map(k => (
            <button key={k.key} onClick={() => setKind(k.key)} style={chip(kind === k.key)}>{k.label}</button>
          ))}
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Пошук по URL"
            style={{
              marginLeft: 'auto', minWidth: 200, padding: '7px 12px', borderRadius: 8,
              border: '1px solid var(--border)', background: 'var(--bg-card)',
              color: 'var(--text-primary)', fontSize: 13,
            }}
          />
        </div>

        <p style={{ ...hint, margin: 0, padding: '10px 16px' }}>
          {error && <span style={{ color: TONE.danger }}>GSC недоступний: {error.slice(0, 200)}</span>}
          {!error && rows === null && 'Завантажуємо зріз по сторінках…'}
          {!error && rows !== null && (
            <>Сторінок: <b style={{ color: 'var(--text-primary)' }}>{num(visible.length)}</b> ·
              показів {num(totals.impressions)} · кліків {num(totals.clicks)} ·
              CTR {totals.impressions ? pct(totals.clicks / totals.impressions) : '—'}</>
          )}
        </p>

        <div style={{ maxHeight: 460, overflowY: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-soft)', zIndex: 1 }}>
              <tr>
                <th style={th}>Сторінка</th>
                <th style={th}>Що робили</th>
                <th style={{ ...th, textAlign: 'right' }}>Позиція</th>
                <th style={{ ...th, textAlign: 'right' }}>Зміна</th>
                <th style={{ ...th, textAlign: 'right' }}>Покази</th>
                <th style={{ ...th, textAlign: 'right' }}>Кліки</th>
                <th style={{ ...th, textAlign: 'right' }}>CTR</th>
              </tr>
            </thead>
            <tbody>
              {visible.slice(0, 300).map(r => {
                const done = actions.get(actionKey(r.path));
                const delta = r.prev ? r.prev.position - r.position : null;
                return (
                  <tr key={r.path}>
                    <td style={td}>
                      <Link href={r.path} target="_blank" style={{ ...pathStyle, color: 'var(--brand-blue)' }}>{r.path}</Link>
                    </td>
                    <td style={td}>
                      {done
                        ? <span style={badge('ok')}>{done.kinds.map(k => KIND_LABEL[k]).join(' + ')}</span>
                        : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                    </td>
                    <td style={{ ...tdNum, fontWeight: 700 }}>{r.position.toFixed(1)}</td>
                    <td style={{ ...tdNum, color: delta == null ? 'var(--text-muted)' : delta > 0.3 ? 'var(--color-success)' : delta < -0.3 ? TONE.danger : 'var(--text-muted)' }}>
                      {delta == null ? '—' : `${delta > 0 ? '↑' : delta < 0 ? '↓' : ''}${Math.abs(delta).toFixed(1)}`}
                    </td>
                    <td style={tdNum}>{num(r.impressions)}</td>
                    <td style={tdNum}>{num(r.clicks)}</td>
                    <td style={tdNum}>{pct(r.ctr)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <Cannibalization days={days} />
      <Coverage />
    </div>
  );
}

function Cannibalization({ days }: { days: number }) {
  const [data, setData] = useState<Conflict[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setData(null);
    fetch(`/api/admin/seo/cannibal?days=${days}`)
      .then(async res => {
        const d = await res.json();
        if (!res.ok) throw new Error(d.error);
        setData(d.conflicts);
      })
      .catch(err => setError(String(err instanceof Error ? err.message : err)));
  }, [days]);

  return (
    <section style={{ ...card, marginBottom: 18 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
        Канібалізація ({data ? data.length : '…'})
      </div>
      <p style={{ ...hint, margin: '0 0 12px' }}>
        Один запит — кілька наших сторінок у видачі: вони ділять сигнали й тягнуть одна одну вниз.
        Мовні версії однієї сторінки склеєні, це не конфлікт. Лікується так: одну сторінку лишаємо
        цільовою, другу переорієнтовуємо на інший запит або ставимо з неї посилання на цільову.
      </p>
      {error && <p style={{ fontSize: 12, color: TONE.danger }}>{error}</p>}
      {data?.length === 0 && <p style={{ ...hint, margin: 0, color: 'var(--color-success)' }}>Конфліктів немає.</p>}
      {data && data.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 320, overflowY: 'auto' }}>
          {data.slice(0, 40).map(c => (
            <div key={c.query} style={{ borderTop: '1px solid var(--border-light)', paddingTop: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                {c.query} <span style={{ ...hint, fontWeight: 400 }}>· {num(c.impressions)} показів</span>
              </div>
              {c.pages.map(p => (
                <div key={p.path} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, marginTop: 3 }}>
                  <Link href={p.path} target="_blank" style={{ ...pathStyle, color: 'var(--brand-blue)' }}>{p.path}</Link>
                  <span style={{ color: 'var(--text-muted)' }}>
                    поз. {p.position.toFixed(1)} · {num(p.impressions)} показів · {num(p.clicks)} кліків
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function Coverage() {
  const [data, setData] = useState<Coverage | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/admin/seo/coverage?days=90')
      .then(async res => {
        const d = await res.json();
        if (!res.ok) throw new Error(d.error);
        setData(d);
      })
      .catch(err => setError(String(err instanceof Error ? err.message : err)));
  }, []);

  return (
    <section style={card}>
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>Індексація</div>
      <p style={{ ...hint, margin: '0 0 12px' }}>
        Звірка нашого sitemap із фактичними показами за 90 днів. Сторінка в sitemap без жодного показу
        майже напевно не в індексі. Сторінка з показами, якої в sitemap немає, — або забутий тип
        сторінок, або параметричний URL, що заповз в індекс.
      </p>
      {error && <p style={{ fontSize: 12, color: TONE.danger }}>{error}</p>}
      {!data && !error && <p style={hint}>Рахуємо…</p>}
      {data && (
        <>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 10px' }}>
            У sitemap <b>{num(data.sitemapCount)}</b> адрес · з показами <b style={{ color: 'var(--color-success)' }}>{num(data.withImpressions)}</b>
            {' · '}без жодного показу <b style={{ color: data.silentTotal ? TONE.warn : 'var(--color-success)' }}>{num(data.silentTotal)}</b>
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <div style={{ ...hint, fontWeight: 700, marginBottom: 6 }}>Без показів (перші 40)</div>
              <div style={{ maxHeight: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
                {data.silent.slice(0, 40).map(p => (
                  <Link key={p} href={p} target="_blank" style={{ ...pathStyle, maxWidth: '100%', color: 'var(--text-secondary)' }}>{p}</Link>
                ))}
                {data.silent.length === 0 && <span style={{ ...hint, color: 'var(--color-success)' }}>усі адреси показуються</span>}
              </div>
            </div>
            <div>
              <div style={{ ...hint, fontWeight: 700, marginBottom: 6 }}>
                Є покази, немає в sitemap ({num(data.extraTotal)})
              </div>
              <div style={{ maxHeight: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
                {data.extra.slice(0, 40).map(e => (
                  <div key={e.path} style={{ display: 'flex', gap: 8, fontSize: 12 }}>
                    <Link href={e.path} target="_blank" style={{ ...pathStyle, color: 'var(--brand-blue)' }}>{e.path}</Link>
                    <span style={{ color: 'var(--text-muted)' }}>{num(e.impressions)}</span>
                  </div>
                ))}
                {data.extra.length === 0 && <span style={{ ...hint, color: 'var(--color-success)' }}>зайвих немає</span>}
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

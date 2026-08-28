'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { card, chip, hint, td, tdNum, th } from '../ui';

// «Попит» відповідає на питання закупівлі, а не SEO: що люди шукають, куди
// рухатись, що завозити. Вкладка «Запити» показує кожну пару «фраза × сторінка»
// — там добре видно, що дожати, але не видно ТОВАРУ за фразами. Тут навпаки:
// показуємо товар і слова, якими його шукають.
//
// Межа даних, яку важливо памʼятати і про яку сказано просто в самому екрані:
// Search Console знає лише ті запити, де сайт УЖЕ показувався. Попит, якого ми
// не торкаємось узагалі, сюди не потрапляє.

type Phrase = { query: string; impressions: number; clicks: number; position: number };

type ProductRow = {
  slug: string;
  sku: string | null;
  name: string;
  brand: string | null;
  impressions: number;
  clicks: number;
  position: number;
  in_stock: boolean | null;
  price: number | null;
  phrases: Phrase[];
};

type GapRow = { query: string; path: string; impressions: number; clicks: number; position: number };

type Data = {
  window: { startDate: string; endDate: string };
  products: ProductRow[];
  gaps: GapRow[];
  totals: { products: number; gaps: number };
};

const PERIODS = [28, 90, 180] as const;

export default function DemandClient() {
  const [days, setDays] = useState<(typeof PERIODS)[number]>(28);
  const [tab, setTab] = useState<'products' | 'gaps'>('products');
  const [onlyOutOfStock, setOnlyOutOfStock] = useState(false);
  const [search, setSearch] = useState('');
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setData(null);
    setError('');
    fetch(`/api/admin/seo/gsc?view=demand&days=${days}&limit=100`)
      .then(async res => {
        const d = await res.json();
        if (!res.ok) throw new Error(d.error);
        setData(d);
      })
      .catch(e => setError(e instanceof Error ? e.message : String(e)));
  }, [days]);

  const products = useMemo(() => {
    let rows = data?.products ?? [];
    if (onlyOutOfStock) rows = rows.filter(r => r.in_stock === false);
    const q = search.trim().toLowerCase();
    if (q) {
      rows = rows.filter(r =>
        r.name.toLowerCase().includes(q)
        || (r.sku ?? '').toLowerCase().includes(q)
        || r.phrases.some(p => p.query.includes(q)));
    }
    return rows;
  }, [data, onlyOutOfStock, search]);

  const gaps = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = data?.gaps ?? [];
    return q ? rows.filter(r => r.query.includes(q)) : rows;
  }, [data, search]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={card}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>
          Що шукають у Google по нашій темі
        </div>
        <div style={hint}>
          Дві сторони одного звіту Search Console. <b>Товари</b> — попит, який уже веде на картку:
          скільки показів збирає товар і якими словами його шукають. <b>Попит без товару</b> — фрази,
          що сідають на категорію, статтю чи головну, бо окремої картки під них немає. Другий список
          і є списком на закупівлю.
          <br />
          Search Console бачить лише ті запити, де сайт уже показувався. Попиту, якого ми не
          торкаємось зовсім, тут немає — для нього потрібен Планувальник ключових слів Google Ads.
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {PERIODS.map(p => (
          <button key={p} onClick={() => setDays(p)} style={chip(days === p)}>{p} днів</button>
        ))}
        <span style={{ width: 12 }} />
        <button onClick={() => setTab('products')} style={chip(tab === 'products')}>
          Товари{data ? ` (${data.totals.products})` : ''}
        </button>
        <button onClick={() => setTab('gaps')} style={chip(tab === 'gaps')}>
          Попит без товару{data ? ` (${data.totals.gaps})` : ''}
        </button>
        <span style={{ flex: 1 }} />
        {tab === 'products' && (
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', cursor: 'pointer' }}>
            <input type="checkbox" checked={onlyOutOfStock} onChange={e => setOnlyOutOfStock(e.target.checked)}
              style={{ width: 15, height: 15, cursor: 'pointer' }} />
            Тільки те, чого немає в наявності
          </label>
        )}
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Пошук по назві, артикулу, фразі…"
          style={{ height: 32, padding: '0 10px', minWidth: 240, border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, background: 'var(--bg-card)', color: 'var(--text-primary)' }} />
      </div>

      {error && <div style={{ ...card, color: 'var(--color-danger)' }}>Search Console не відповіла: {error}</div>}
      {!data && !error && <div style={hint}>Тягнемо звіт із Search Console…</div>}

      {data && tab === 'products' && (
        <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
            <thead>
              <tr>
                <th style={th}>Товар</th>
                <th style={{ ...th, textAlign: 'right' }}>Покази</th>
                <th style={{ ...th, textAlign: 'right' }}>Кліки</th>
                <th style={{ ...th, textAlign: 'right' }}>Позиція</th>
                <th style={{ ...th, textAlign: 'right' }}>Наявність</th>
              </tr>
            </thead>
            <tbody>
              {products.map((r, i) => {
                const isOpen = open[r.slug] ?? false;
                return (
                  // Ключ на зовнішньому елементі: рядок товару і рядок із
                  // фразами — це один запис, розгорнутий на дві <tr>.
                  <Fragment key={r.slug}>
                    <tr onClick={() => setOpen(o => ({ ...o, [r.slug]: !isOpen }))} style={{ cursor: 'pointer' }}>
                      <td style={td}>
                        <span style={{ color: 'var(--text-muted)', marginRight: 8, fontVariantNumeric: 'tabular-nums' }}>{i + 1}</span>
                        <span style={{ fontWeight: 600 }}>{r.name}</span>
                        {r.sku && <span style={{ color: 'var(--text-muted)', marginLeft: 8, fontSize: 12 }}>{r.sku}</span>}
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                          {isOpen ? '▾' : '▸'} {r.phrases.length ? r.phrases[0].query : '—'}
                          {r.phrases.length > 1 ? ` та ще ${r.phrases.length - 1}` : ''}
                        </div>
                      </td>
                      <td style={tdNum}>{r.impressions.toLocaleString('uk-UA')}</td>
                      <td style={tdNum}>{r.clicks.toLocaleString('uk-UA')}</td>
                      <td style={tdNum}>{r.position.toFixed(1)}</td>
                      <td style={{ ...tdNum, color: r.in_stock === false ? 'var(--color-danger)' : r.in_stock ? '#15803D' : 'var(--text-muted)', fontWeight: 700 }}>
                        {r.in_stock === null ? '—' : r.in_stock ? 'є' : 'немає'}
                      </td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={5} style={{ ...td, background: 'var(--bg-soft)' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {r.phrases.map(p => (
                              <div key={p.query} style={{ display: 'grid', gridTemplateColumns: '1fr 90px 70px 70px', gap: 8, fontSize: 12 }}>
                                <span>{p.query}</span>
                                <span style={{ textAlign: 'right', color: 'var(--text-secondary)' }}>{p.impressions} показів</span>
                                <span style={{ textAlign: 'right', color: 'var(--text-secondary)' }}>{p.clicks} клік.</span>
                                <span style={{ textAlign: 'right', color: 'var(--text-muted)' }}>поз. {p.position.toFixed(1)}</span>
                              </div>
                            ))}
                            <Link href={`/product/${encodeURIComponent(r.slug)}`} target="_blank"
                              style={{ fontSize: 12, fontWeight: 700, color: 'var(--brand-blue)', textDecoration: 'none', marginTop: 4 }}>
                              Відкрити картку товару →
                            </Link>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {products.length === 0 && (
                <tr><td colSpan={5} style={{ ...td, color: 'var(--text-muted)' }}>Нічого не знайшлось за цим фільтром</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {data && tab === 'gaps' && (
        <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
            <thead>
              <tr>
                <th style={th}>Запит</th>
                <th style={th}>Куди сідає</th>
                <th style={{ ...th, textAlign: 'right' }}>Покази</th>
                <th style={{ ...th, textAlign: 'right' }}>Кліки</th>
                <th style={{ ...th, textAlign: 'right' }}>Позиція</th>
              </tr>
            </thead>
            <tbody>
              {gaps.map((r, i) => (
                <tr key={`${r.query}-${r.path}`}>
                  <td style={td}>
                    <span style={{ color: 'var(--text-muted)', marginRight: 8, fontVariantNumeric: 'tabular-nums' }}>{i + 1}</span>
                    {r.query}
                  </td>
                  <td style={td}>
                    <Link href={r.path} target="_blank" style={{ fontSize: 12, color: 'var(--brand-blue)', textDecoration: 'none' }}>
                      {r.path}
                    </Link>
                  </td>
                  <td style={tdNum}>{r.impressions.toLocaleString('uk-UA')}</td>
                  <td style={tdNum}>{r.clicks.toLocaleString('uk-UA')}</td>
                  <td style={tdNum}>{r.position.toFixed(1)}</td>
                </tr>
              ))}
              {gaps.length === 0 && (
                <tr><td colSpan={5} style={{ ...td, color: 'var(--text-muted)' }}>Нічого не знайшлось за цим фільтром</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

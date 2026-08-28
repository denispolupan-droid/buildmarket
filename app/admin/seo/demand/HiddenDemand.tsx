'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { badge, card, chip, hint, td, tdNum, th } from '../ui';
import type { HiddenCluster, HiddenPhrase } from '../../../api/admin/seo/demand/hidden/route';

// «Невидимий попит» — друга половина вкладки «Попит». Верхня частина екрана
// знає лише запити, де сайт уже показувався; ця — що люди набирають у Google
// по наших темах узагалі (автопідказки, крон demand-crawl, раз на тиждень).
// Фраза без нашої сторінки і без показів у GSC — тема для статті або гайда;
// звідси одним кліком у «Стаття під запит» або в редактор категорії.

type Data = { clusters: HiddenCluster[]; totals: { phrases: number; uncovered: number; invisible: number; info: number }; lastCrawl: string | null };
type Filter = 'invisible' | 'uncovered' | 'all';
type Kind = 'all' | 'info' | 'buy';

export default function HiddenDemand() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<Filter>('invisible');
  const [kind, setKind] = useState<Kind>('all');
  const [lang, setLang] = useState<'all' | 'uk' | 'ru'>('all');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetch('/api/admin/seo/demand/hidden')
      .then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error); setData(d); })
      .catch(e => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  const q = search.trim().toLowerCase();
  const keep = (p: HiddenPhrase) =>
    (filter === 'all' || !p.covered) && (filter !== 'invisible' || p.impressions == null)
    && (kind === 'all' || p.kind === kind) && (lang === 'all' || p.lang === lang)
    && (!q || p.phrase.includes(q));
  const clusters = useMemo(() => (data?.clusters ?? []).map(c => ({ ...c, phrases: c.phrases.filter(keep) })).filter(c => c.phrases.length > 0), [data, filter, kind, lang, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = clusters.reduce((s, c) => s + c.phrases.length, 0);

  return (
    <section style={{ marginTop: 28 }}>
      <h2 style={{ fontSize: 17, fontWeight: 750, margin: '0 0 4px', color: 'var(--text-primary)' }}>Невидимий попит</h2>
      <p style={{ ...hint, margin: '0 0 12px' }}>
        Search Console вище знає лише запити, де сайт уже показувався. Тут — що люди набирають у Google по наших темах узагалі
        (автопідказки, обхід раз на тиждень{data?.lastCrawl ? `, останній ${new Date(data.lastCrawl).toLocaleDateString('uk-UA')}` : ''}).
        Частотності Google не віддає; факт потрапляння в підказки означає, що фразу набирають часто.
        {data && <> Усього фраз <b style={{ color: 'var(--text-primary)' }}>{data.totals.phrases}</b>, без нашої сторінки {data.totals.uncovered},
        з них Google нас за ними не показує взагалі <b style={{ color: 'var(--text-primary)' }}>{data.totals.invisible}</b>.</>}
      </p>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <button onClick={() => setFilter('invisible')} style={chip(filter === 'invisible')} title="Немає ні сторінки, ні показів у GSC — чистий пробіл">Невидимі</button>
        <button onClick={() => setFilter('uncovered')} style={chip(filter === 'uncovered')} title="Немає сторінки, що відповідає на фразу (показуватись можемо випадково)">Без сторінки</button>
        <button onClick={() => setFilter('all')} style={chip(filter === 'all')}>Усі</button>
        <span style={{ width: 1, height: 20, background: 'var(--border)' }} />
        <button onClick={() => setKind('all')} style={chip(kind === 'all')}>Будь-які</button>
        <button onClick={() => setKind('info')} style={chip(kind === 'info')} title="«як», «який», «скільки», «чим» — тягне стаття">Питання → стаття</button>
        <button onClick={() => setKind('buy')} style={chip(kind === 'buy')} title="«купити», «ціна» — тягне категорія або картка">Покупка → категорія</button>
        <span style={{ width: 1, height: 20, background: 'var(--border)' }} />
        <button onClick={() => setLang('all')} style={chip(lang === 'all')}>Укр + Рос</button>
        <button onClick={() => setLang('uk')} style={chip(lang === 'uk')}>Укр</button>
        <button onClick={() => setLang('ru')} style={chip(lang === 'ru')}>Рос</button>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="пошук по фразах" style={{ marginLeft: 'auto', padding: '6px 10px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-card)', color: 'var(--text-primary)', minWidth: 200 }} />
      </div>

      {error && <div style={{ ...card, color: 'var(--color-danger)' }}>{error}</div>}
      {!data && !error && <div style={{ ...card, color: 'var(--text-muted)' }}>Завантаження…</div>}
      {data && clusters.length === 0 && <div style={{ ...card, color: 'var(--text-muted)' }}>{data.totals.phrases ? 'Нічого за цим фільтром.' : 'Обхід ще не робився — крон demand-crawl запускається щопонеділка.'}</div>}

      {clusters.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p style={{ ...hint, margin: 0 }}>Показано {shown} фраз у {clusters.length} темах. Клік по темі розгортає фрази; «стаття →» відкриває дожим із фразою, «категорія →» — редактор категорії з фразою як ціллю.</p>
          {clusters.map(c => {
            const isOpen = open[c.slug] ?? clusters.length <= 3;
            return (
              <div key={c.slug} style={card}>
                <div onClick={() => setOpen(o => ({ ...o, [c.slug]: !isOpen }))} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{c.name}</span>
                  <code style={{ fontSize: 12, color: 'var(--text-muted)' }}>{c.slug}</code>
                  <span style={badge('warn')}>{c.phrases.length} фраз</span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>усього по темі {c.total} · невидимих {c.invisible}</span>
                  <Link href={`/admin/seo/categories/${c.slug}`} onClick={e => e.stopPropagation()} style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 600 }}>редактор категорії →</Link>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{isOpen ? '▾' : '▸'}</span>
                </div>
                {isOpen && (
                  <div style={{ overflowX: 'auto', marginTop: 10 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead><tr><th style={th}>Фраза</th><th style={th}>Мова</th><th style={th}>Тип</th><th style={{ ...th, textAlign: 'right' }}>Обходів</th><th style={{ ...th, textAlign: 'right' }}>GSC</th><th style={th}>Наша сторінка</th><th style={th}>Дія</th></tr></thead>
                      <tbody>
                        {c.phrases.map(p => (
                          <tr key={`${p.phrase}|${p.lang}`}>
                            <td style={{ ...td, fontWeight: 600 }}>{p.phrase}</td>
                            <td style={td}>{p.lang}</td>
                            <td style={td}>{p.kind === 'info' ? <span style={badge('info')}>питання</span> : p.kind === 'buy' ? <span style={badge('ok')}>покупка</span> : <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                            <td style={tdNum}>{p.seen}</td>
                            <td style={tdNum} title={p.impressions != null ? `покази за 90 дн, позиція ${p.position}` : 'Google нас за цією фразою не показує'}>{p.impressions != null ? `${p.impressions} · поз ${Math.round(p.position ?? 0)}` : <span style={{ color: 'var(--text-muted)' }}>немає</span>}</td>
                            <td style={td}>{p.covered ? <Link href={p.covered} target="_blank" style={{ fontSize: 12 }}>{p.covered}</Link> : <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                            <td style={{ ...td, whiteSpace: 'nowrap' }}>
                              {p.kind === 'buy'
                                ? <Link href={`/admin/seo/categories/${c.slug}?q=${encodeURIComponent(p.phrase)}`} style={{ fontSize: 12, fontWeight: 600 }}>категорія →</Link>
                                : <Link href={`/admin/seo?q=${encodeURIComponent(p.phrase)}`} style={{ fontSize: 12, fontWeight: 600 }}>стаття →</Link>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

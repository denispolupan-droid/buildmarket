'use client';

import { useMemo, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import type { CategoryFaq, CategoryGuide, CategoryRelated, CategoryMeta } from '../../../../../lib/category-descriptions';
import { resolveGuidePrices, type PricedProduct } from '../../../../../lib/seo/guide-prices';
import type { AuditDemand } from '../../../../../lib/seo/category-audit';
import { badge, btnGhost, btnPrimary, card, chip, hint, type Tone } from '../../ui';
import HelpBox from '../../HelpBox';
import { HELP_CATEGORY_EDITOR } from '../../help-content';

export type EditorContent = {
  description: string;
  seoText: string;
  faq: CategoryFaq[];
  guide: CategoryGuide | null;
  related: CategoryRelated[];
  blogSlug: string;
  source?: 'seed' | 'manual' | 'ai';
  updatedAt?: string;
  updatedBy?: string | null;
};

type Lang = 'uk' | 'ru';

type Props = {
  slug: string;
  name: string;
  nameRu: string;
  initial: Record<Lang, EditorContent | null>;
  priced: PricedProduct[];
  family: string[];
  familyProducts: { sku: string; name: string; brand: string; volume: string | null; price: number | null }[];
  categories: { slug: string; name: string; nameRu: string; parent: string | null }[];
  posts: { slug: string; title: string }[];
  gaps: string[];
  demand: AuditDemand | null;
  queries: { query: string; impressions: number; position: number }[];
  /** запит із вкладки «Запити» — ціль для генерації й позначка в журналі */
  initialWish?: string;
  productGaps: { count: number; noChars: number; noRu: number; thin: number };
};

const GAP_LABEL: Record<string, { label: string; tone: Tone }> = {
  noMeta: { label: 'немає тексту', tone: 'danger' }, noProducts: { label: 'порожня сторінка', tone: 'danger' },
  staleBrands: { label: 'бренд зник', tone: 'danger' }, deadBlogLink: { label: 'стаття в 404', tone: 'danger' },
  deadPriceSku: { label: 'ціна на знятий товар', tone: 'danger' }, missingBrands: { label: 'бренд не згаданий', tone: 'warn' },
  noCatalogLine: { label: 'немає переліку', tone: 'warn' }, noGuide: { label: 'немає гайда', tone: 'warn' },
  guideNoBuy: { label: 'гайд без «купити»', tone: 'warn' }, h1Mismatch: { label: 'H1 ≠ запит', tone: 'warn' },
  thinCategory: { label: 'тонка категорія', tone: 'info' }, thinFaq: { label: 'мало FAQ', tone: 'info' },
  ruBehind: { label: 'рос. відстає', tone: 'info' }, ruGuideBehind: { label: 'рос. гайд відстає', tone: 'info' },
};

const EMPTY: EditorContent = { description: '', seoText: '', faq: [], guide: null, related: [], blogSlug: '' };

const inp: CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '8px 10px', fontSize: 13, lineHeight: 1.5,
  border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-card)', color: 'var(--text-primary)', fontFamily: 'inherit',
};
const label: CSSProperties = { fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.04em', margin: '14px 0 6px', display: 'flex', justifyContent: 'space-between', gap: 8 };
const small: CSSProperties = { fontSize: 12, color: 'var(--text-muted)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 };
const sectionBox: CSSProperties = { border: '1px solid var(--border)', borderRadius: 10, padding: 10, marginBottom: 8, background: 'var(--bg-soft)' };
const xBtn: CSSProperties = { ...btnGhost, padding: '2px 8px', fontSize: 12 };

const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
const guideWords = (g: CategoryGuide | null) => g ? words([g.title, ...g.sections.flatMap(s => [s.h, ...s.p])].join(' ')) : 0;
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

/** Абзаци гайда в textarea — через порожній рядок; посилання [текст](/шлях) лишаються як є. */
const joinP = (p: string[]) => p.join('\n\n');
const splitP = (s: string) => s.split(/\n\s*\n/).map(x => x.trim()).filter(Boolean);

export default function CategoryEditor(props: Props) {
  const { slug, name, nameRu, priced, family, familyProducts, categories, posts, gaps, demand, queries, productGaps } = props;
  const [lang, setLang] = useState<Lang>('uk');
  const [data, setData] = useState<Record<Lang, EditorContent>>({ uk: props.initial.uk ?? clone(EMPTY), ru: props.initial.ru ?? clone(EMPTY) });
  const [saved, setSaved] = useState<Record<Lang, string>>({ uk: JSON.stringify(props.initial.uk ?? EMPTY), ru: JSON.stringify(props.initial.ru ?? EMPTY) });
  const [busy, setBusy] = useState<'save' | 'gen' | null>(null);
  const [msg, setMsg] = useState<{ tone: Tone; text: string } | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [wish, setWish] = useState(props.initialWish ?? '');
  const boostQuery = props.initialWish ?? '';
  const [showSkus, setShowSkus] = useState(false);
  const [preview, setPreview] = useState(true);

  const c = data[lang];
  const dirty = JSON.stringify({ ...c, source: undefined, updatedAt: undefined, updatedBy: undefined }) !== JSON.stringify({ ...JSON.parse(saved[lang]), source: undefined, updatedAt: undefined, updatedBy: undefined });
  const set = (patch: Partial<EditorContent>) => setData(d => ({ ...d, [lang]: { ...d[lang], ...patch } }));

  // Прев'ю — ті самі підстановки, що на сайті (lib/seo/guide-prices)
  const resolved = useMemo(() => {
    const meta: CategoryMeta = { description: c.description, seoText: c.seoText || undefined, faq: c.faq, guide: c.guide ?? undefined, related: c.related };
    return resolveGuidePrices(meta, priced, family);
  }, [c, priced, family]);

  const prefix = lang === 'ru' ? '/ru' : '';
  const catName = (x: { name: string; nameRu: string }) => (lang === 'ru' ? x.nameRu : x.name);

  async function save() {
    setBusy('save'); setMsg(null);
    try {
      const res = await fetch(`/api/admin/category-content/${encodeURIComponent(slug)}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lang, source: c.source === 'ai' ? 'ai' : 'manual', query: boostQuery || undefined, content: { description: c.description, seoText: c.seoText || null, faq: c.faq, guide: c.guide, related: c.related, blogSlug: c.blogSlug || null } }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? res.statusText);
      setSaved(s => ({ ...s, [lang]: JSON.stringify(c) }));
      setWarnings(j.warnings ?? []);
      setMsg({ tone: 'ok', text: `Збережено (${lang}). Сторінка ${prefix}/shop/${slug} оновиться за кілька секунд.` });
    } catch (e) {
      setMsg({ tone: 'danger', text: `Не збережено: ${e instanceof Error ? e.message : String(e)}` });
    } finally { setBusy(null); }
  }

  async function generate() {
    const has = !!(c.description || c.guide);
    if (!confirm(`Згенерувати ${lang === 'ru' ? 'російський' : 'український'} контент за стандартом? ~1 хв, ≈ $0,1–0,3.${has ? ' Поточний текст у формі буде замінено (до натискання «Зберегти» на сайті нічого не зміниться).' : ''}`)) return;
    setBusy('gen'); setMsg(null);
    try {
      const res = await fetch(`/api/admin/category-content/${encodeURIComponent(slug)}/generate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lang, hint: wish, useCurrent: has }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? res.statusText);
      setData(d => ({ ...d, [lang]: { ...d[lang], ...j.content, seoText: j.content.seoText ?? '', blogSlug: j.content.blogSlug ?? '', source: 'ai' } }));
      setWarnings(j.warnings ?? []);
      setMsg({ tone: 'ok', text: `Згенеровано за ${j.seconds} с, $${j.costUsd} (товарів у контексті: ${j.context.products}, запитів: ${j.context.queries}, статей: ${j.context.posts}). Вичитайте і натисніть «Зберегти».` });
    } catch (e) {
      setMsg({ tone: 'danger', text: `Генерація не вдалась: ${e instanceof Error ? e.message : String(e)}` });
    } finally { setBusy(null); }
  }

  const updFaq = (i: number, patch: Partial<CategoryFaq>) => set({ faq: c.faq.map((f, k) => (k === i ? { ...f, ...patch } : f)) });
  const moveFaq = (i: number, d: -1 | 1) => { const a = [...c.faq]; const j = i + d; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; set({ faq: a }); };
  const guide = c.guide ?? { title: '', sections: [] };
  const setGuide = (g: CategoryGuide) => set({ guide: g.title || g.sections.length ? g : null });
  const updSec = (i: number, patch: Partial<{ h: string; p: string[] }>) => setGuide({ ...guide, sections: guide.sections.map((s, k) => (k === i ? { ...s, ...patch } : s)) });
  const moveSec = (i: number, d: -1 | 1) => { const a = [...guide.sections]; const j = i + d; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; setGuide({ ...guide, sections: a }); };

  return (
    <div>
      <HelpBox content={HELP_CATEGORY_EDITOR} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
        <Link href="/admin/seo/categories" style={{ fontSize: 13, color: 'var(--text-muted)', textDecoration: 'none' }}>← Категорії</Link>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: 'var(--text-primary)' }}>{name}</h2>
        <code style={{ fontSize: 12, color: 'var(--text-muted)' }}>{slug}</code>
        <Link href={`${prefix}/shop/${slug}`} target="_blank" style={{ fontSize: 12 }}>відкрити на сайті ↗</Link>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>· {familyProducts.length} товарів</span>
        {demand && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>· {demand.impressions} показів/28 дн{demand.topQuery ? ` · «${demand.topQuery}»` : ''}</span>}
      </div>
      {(gaps.length > 0 || productGaps.count > 0 || boostQuery) && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
          {boostQuery && <span style={badge('info')} title="Запит із вкладки «Запити»: генерація цілиться в нього, збереження запишеться в Журнал з цим запитом">дожим під «{boostQuery}»</span>}
          {gaps.map(g => GAP_LABEL[g] ? <span key={g} style={badge(GAP_LABEL[g].tone)}>{GAP_LABEL[g].label}</span> : null)}
          {productGaps.count > 0 && (
            <Link href="/admin/seo/products" style={{ ...badge('warn'), textDecoration: 'none' }} title="Картки товарів родини з пробілами (вкладка «Товари»): без характеристик гайду немає з чого брати витрату й типи">
              картки з пробілами: {productGaps.count}{productGaps.noChars ? ` · без характеристик ${productGaps.noChars}` : ''}{productGaps.noRu ? ` · без ru ${productGaps.noRu}` : ''} →
            </Link>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        {(['uk', 'ru'] as Lang[]).map(l => (
          <button key={l} onClick={() => setLang(l)} style={chip(lang === l)}>
            {l === 'uk' ? 'Українська' : 'Русский'}{data[l].description ? '' : ' · порожньо'}{JSON.stringify(data[l]) !== saved[l] ? ' •' : ''}
          </button>
        ))}
        <span style={{ flex: 1 }} />
        <button onClick={() => setPreview(p => !p)} style={btnGhost}>{preview ? 'Сховати прев’ю' : 'Прев’ю'}</button>
        <button onClick={generate} disabled={busy !== null} style={btnGhost}>{busy === 'gen' ? 'Генерую… (1–2 хв)' : 'Згенерувати за стандартом'}</button>
        <button onClick={save} disabled={busy !== null || !dirty || !c.description.trim()} style={btnPrimary}>{busy === 'save' ? 'Зберігаю…' : dirty ? 'Зберегти' : 'Збережено'}</button>
      </div>

      {msg && <div style={{ ...card, padding: '8px 12px', marginBottom: 10, fontSize: 13, color: msg.tone === 'danger' ? 'var(--color-danger)' : 'var(--text-primary)' }}>{msg.text}</div>}
      {warnings.length > 0 && (
        <div style={{ ...card, padding: '8px 12px', marginBottom: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-warning, #b45309)', marginBottom: 4 }}>Стандарт: що не сходиться</div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.5 }}>{warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
        </div>
      )}
      {c.updatedAt && <p style={{ ...hint, margin: '0 0 8px' }}>Джерело: {c.source === 'seed' ? 'знімок коду 28.08' : c.source === 'ai' ? 'згенеровано' : 'вручну'} · {new Date(c.updatedAt).toLocaleString('uk-UA')}{c.updatedBy ? ` · ${c.updatedBy}` : ''}</p>}

      <div style={{ display: 'grid', gridTemplateColumns: preview ? 'minmax(0, 1fr) minmax(0, 1fr)' : 'minmax(0, 1fr)', gap: 16, alignItems: 'start' }}>
        <div style={card}>
          <div style={label}><span>Побажання для генерації</span><span style={small}>необов’язково</span></div>
          <input style={inp} value={wish} onChange={e => setWish(e.target.value)} placeholder="напр.: більше про бетонні основи; згадати, що Eskaro — для фундаментів" />

          <div style={label}><span>Опис (meta description)</span><span style={{ ...small, color: c.description.length > 160 ? 'var(--color-danger)' : undefined }}>{c.description.length}/160</span></div>
          <textarea style={{ ...inp, minHeight: 56 }} value={c.description} onChange={e => set({ description: e.target.value })} />

          <div style={label}><span>Про категорію (seoText)</span><span style={small}>{words(c.seoText)} слів · норма 60–100, речення «У каталозі FIXLINE — …»</span></div>
          <textarea style={{ ...inp, minHeight: 120 }} value={c.seoText} onChange={e => set({ seoText: e.target.value })} />

          <div style={label}><span>Профільна стаття (кнопка «Читати статтю»)</span></div>
          <select style={inp} value={c.blogSlug} onChange={e => set({ blogSlug: e.target.value })}>
            <option value="">— немає —</option>
            {posts.map(p => <option key={p.slug} value={p.slug}>{p.title}</option>)}
          </select>

          <div style={label}><span>FAQ</span><span style={small}>{c.faq.length} питань · норма ≥ 7 з гайдом, одне про ціну</span></div>
          {c.faq.map((f, i) => (
            <div key={i} style={sectionBox}>
              <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                <input style={inp} value={f.q} placeholder="Питання" onChange={e => updFaq(i, { q: e.target.value })} />
                <button style={xBtn} title="вгору" onClick={() => moveFaq(i, -1)}>↑</button>
                <button style={xBtn} title="вниз" onClick={() => moveFaq(i, 1)}>↓</button>
                <button style={xBtn} title="видалити" onClick={() => set({ faq: c.faq.filter((_, k) => k !== i) })}>×</button>
              </div>
              <textarea style={{ ...inp, minHeight: 64 }} value={f.a} placeholder="Відповідь 2–4 речення" onChange={e => updFaq(i, { a: e.target.value })} />
            </div>
          ))}
          <button style={btnGhost} onClick={() => set({ faq: [...c.faq, { q: '', a: '' }] })}>+ питання</button>

          <div style={label}><span>Гайд «Як вибрати»</span><span style={small}>{guideWords(c.guide)} слів · норма 350–600, 5–6 розділів, останній — «Де купити»</span></div>
          <input style={{ ...inp, marginBottom: 8 }} value={guide.title} placeholder="Заголовок гайда, напр.: Як вибрати ґрунтовку-концентрат" onChange={e => setGuide({ ...guide, title: e.target.value })} />
          {guide.sections.map((s, i) => (
            <div key={i} style={sectionBox}>
              <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                <input style={{ ...inp, fontWeight: 600 }} value={s.h} placeholder="Підзаголовок розділу" onChange={e => updSec(i, { h: e.target.value })} />
                <button style={xBtn} onClick={() => moveSec(i, -1)}>↑</button>
                <button style={xBtn} onClick={() => moveSec(i, 1)}>↓</button>
                <button style={xBtn} onClick={() => setGuide({ ...guide, sections: guide.sections.filter((_, k) => k !== i) })}>×</button>
              </div>
              <textarea style={{ ...inp, minHeight: 110 }} value={joinP(s.p)} placeholder="Абзаци через порожній рядок. Посилання: [текст](/shop/slug). Ціни: {price:SKU}, {price:SKU / 5}, {range:SKU1,SKU2}" onChange={e => updSec(i, { p: splitP(e.target.value) })} />
            </div>
          ))}
          <button style={btnGhost} onClick={() => setGuide({ ...guide, sections: [...guide.sections, { h: '', p: [] }] })}>+ розділ</button>

          <div style={label}><span>Дивіться також</span><span style={small}>{c.related.length} чипів · норма 4–6, шляхи без /ru</span></div>
          {c.related.map((r, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
              <input style={{ ...inp, flex: 1 }} list="cc-paths" value={r.href} placeholder="/shop/slug або /blog/slug" onChange={e => set({ related: c.related.map((x, k) => (k === i ? { ...x, href: e.target.value } : x)) })} />
              <input style={{ ...inp, flex: 1 }} value={r.label} placeholder="Підпис" onChange={e => set({ related: c.related.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)) })} />
              <button style={xBtn} onClick={() => set({ related: c.related.filter((_, k) => k !== i) })}>×</button>
            </div>
          ))}
          <datalist id="cc-paths">
            {categories.map(x => <option key={x.slug} value={`/shop/${x.slug}`}>{catName(x)}</option>)}
            {posts.map(p => <option key={p.slug} value={`/blog/${p.slug}`}>{p.title}</option>)}
          </datalist>
          <button style={btnGhost} onClick={() => set({ related: [...c.related, { href: '', label: '' }] })}>+ чип</button>

          <div style={{ ...label, cursor: 'pointer' }} onClick={() => setShowSkus(s => !s)}><span>Артикули для токенів {showSkus ? '▾' : '▸'}</span><span style={small}>ціна на сайті = акційна, інакше роздрібна</span></div>
          {showSkus && (
            <div style={{ fontSize: 12, lineHeight: 1.6, maxHeight: 260, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 8, padding: 8 }}>
              {familyProducts.map(p => <div key={p.sku}><code>{`{price:${p.sku}}`}</code> {p.brand} · {p.name}{p.volume ? ` · ${p.volume}` : ''} — <b>{p.price ?? '—'}</b> грн</div>)}
            </div>
          )}
          {queries.length > 0 && (
            <>
              <div style={label}><span>Запити Search Console по сторінці, 28 дн</span></div>
              <div style={{ fontSize: 12, lineHeight: 1.6 }}>{queries.map(q => <div key={q.query}>«{q.query}» — {q.impressions} пок., поз. {q.position}</div>)}</div>
            </>
          )}
        </div>

        {preview && (
          <div style={{ ...card, position: 'sticky', top: 12, maxHeight: 'calc(100vh - 24px)', overflow: 'auto' }}>
            <div style={{ ...label, margin: '0 0 8px' }}><span>Прев’ю з живими цінами</span><span style={small}>{resolved.unresolved.length ? `не розв’язано: ${[...new Set(resolved.unresolved)].join(', ')}` : 'усі токени розв’язано'}</span></div>
            {resolved.unresolved.length > 0 && <p style={{ fontSize: 12, color: 'var(--color-danger)', margin: '0 0 8px' }}>Речення з нерозв’язаними токенами на сайті не показуються.</p>}
            <h3 style={{ fontSize: 16, margin: '0 0 4px' }}>{lang === 'ru' ? nameRu : name}</h3>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 10px' }}>{resolved.meta.description}</p>
            {resolved.meta.seoText && <p style={{ fontSize: 14, lineHeight: 1.6 }}>{withLinks(resolved.meta.seoText, prefix)}</p>}
            {resolved.meta.faq?.map((f, i) => (
              <div key={i} style={{ margin: '8px 0' }}><div style={{ fontWeight: 600, fontSize: 14 }}>{f.q}</div><div style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--text-secondary)' }}>{withLinks(f.a, prefix)}</div></div>
            ))}
            {resolved.meta.guide && (
              <div style={{ marginTop: 14 }}>
                <h4 style={{ fontSize: 15, margin: '0 0 6px' }}>{resolved.meta.guide.title}</h4>
                {resolved.meta.guide.sections.map((s, i) => (
                  <div key={i} style={{ margin: '8px 0' }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{s.h}</div>
                    {s.p.map((p, k) => <p key={k} style={{ fontSize: 13, lineHeight: 1.6, margin: '4px 0' }}>{withLinks(p, prefix)}</p>)}
                  </div>
                ))}
              </div>
            )}
            {!!resolved.meta.related?.length && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
                {resolved.meta.related.map((r, i) => <span key={i} style={{ fontSize: 12, padding: '4px 10px', border: '1px solid var(--border)', borderRadius: 999 }}>{r.label}</span>)}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** [текст](/шлях) → посилання, як у CategoryAbout. */
function withLinks(text: string, prefix: string) {
  const parts = text.split(/(\[[^\]]+\]\([^)]+\))/g);
  return parts.map((part, i) => {
    const m = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
    return m ? <a key={i} href={`${prefix}${m[2]}`} target="_blank" rel="noreferrer">{m[1]}</a> : part;
  });
}

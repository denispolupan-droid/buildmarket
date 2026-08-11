'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';

export type QueueItem = {
  sku: string;
  slug: string | null;
  name: string;
  brand: string;
  category: string;
  /** незаповнені обов'язкові характеристики категорії (зі словника) */
  missingLabels: string[];
  gaps: {
    thinDesc: boolean;   // description_full < порога — заповнюється кнопкою тут
    noFaq: boolean;      // немає FAQ — заповнюється кнопкою тут (разом з описом)
    ruDesc: boolean;     // рос. опис застарів / FAQ без перекладу — кнопкою тут
    noRu: boolean;       // немає name_ru/description_ru — AI-кнопка в картці товару
    noKeywords: boolean; // немає keywords — AI-кнопка в картці товару
    noChars: boolean;    // немає характеристик взагалі — генерація тут
    missingRequired: boolean; // є характеристики, але не всі обов'язкові — генерація тут
    dirtyChars: boolean; // лейбли-синоніми/апострофи — кнопка «Нормалізувати» (без AI)
    noImage: boolean;    // немає фото — завантажити вручну
  };
};

type EnrichEvent =
  | { type: 'start'; total: number }
  | { type: 'progress'; sku: string; name: string; done: number; total: number }
  | { type: 'result'; sku: string; description_full: string; faqCount: number; ru: boolean }
  | { type: 'error'; sku: string; error: string }
  | { type: 'done'; done: number; errors: number };

const COST_PER_PRODUCT_USD = 0.04; // укр генерація (opus) + рос переклад (haiku)

const GAP_LABELS: { key: keyof QueueItem['gaps']; label: string; color: string }[] = [
  { key: 'thinDesc',   label: 'короткий опис',    color: '#F59E0B' },
  { key: 'noFaq',      label: 'немає FAQ',        color: '#F59E0B' },
  { key: 'ruDesc',     label: 'рос. опис/FAQ',    color: '#F59E0B' },
  { key: 'noRu',       label: 'немає рос. назви', color: '#8B5CF6' },
  { key: 'noKeywords', label: 'немає keywords',   color: '#8B5CF6' },
  { key: 'noChars',    label: 'немає характеристик', color: '#EF4444' },
  { key: 'missingRequired', label: 'обов\'язкові хар-ки', color: '#EF4444' },
  { key: 'dirtyChars', label: 'ненормовані лейбли', color: '#0EA5E9' },
  { key: 'noImage',    label: 'немає фото',       color: '#EF4444' },
];

function hasAnyGap(item: QueueItem): boolean {
  return Object.values(item.gaps).some(Boolean);
}

export default function SeoQueueClient({ items, faqTableReady }: { items: QueueItem[]; faqTableReady: boolean }) {
  const [filter, setFilter] = useState<keyof QueueItem['gaps'] | 'any'>('any');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, errors: 0 });
  const [currentName, setCurrentName] = useState('');
  const [log, setLog] = useState<{ sku: string; text: string; ok: boolean }[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const withGaps = useMemo(() => items.filter(hasAnyGap), [items]);
  const visible = useMemo(
    () => (filter === 'any' ? withGaps : withGaps.filter(i => i.gaps[filter])),
    [withGaps, filter],
  );
  const gapCounts = useMemo(() => {
    const counts = {} as Record<keyof QueueItem['gaps'], number>;
    for (const g of GAP_LABELS) counts[g.key] = withGaps.filter(i => i.gaps[g.key]).length;
    return counts;
  }, [withGaps]);

  // Кнопка запускає ЄДИНИЙ рушій (lib/catalog-enricher): AI генерує комплект
  // картки, але ЗАПИСУЮТЬСЯ лише пробіли — наявний контент і ручні значення
  // не перезаписуються (див. applyContent). Придатні — усі з будь-яким
  // пробілом, крім фото (його завантажують вручну).
  const enrichable = useMemo(
    () => visible.filter(i => i.gaps.thinDesc || i.gaps.noFaq || i.gaps.ruDesc || i.gaps.noRu || i.gaps.noKeywords || i.gaps.noChars || i.gaps.missingRequired),
    [visible],
  );
  const selectedEnrichable = enrichable.filter(i => selected.has(i.sku));
  const cost = (selectedEnrichable.length * COST_PER_PRODUCT_USD).toFixed(2);

  function toggle(sku: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(sku)) next.delete(sku); else next.add(sku);
      return next;
    });
  }

  function selectAllVisible() {
    setSelected(new Set(enrichable.map(i => i.sku)));
  }

  async function start() {
    if (!selectedEnrichable.length) return;
    setRunning(true);
    setLog([]);
    setProgress({ done: 0, total: selectedEnrichable.length, errors: 0 });
    abortRef.current = new AbortController();

    try {
      const res = await fetch('/api/admin/catalog/enrich', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skus: selectedEnrichable.map(i => i.sku), limit: selectedEnrichable.length }),
        signal: abortRef.current.signal,
      });

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const event = JSON.parse(line.slice(6)) as EnrichEvent;
          if (event.type === 'start') setProgress(p => ({ ...p, total: event.total }));
          else if (event.type === 'progress') setCurrentName(event.name);
          else if (event.type === 'result') {
            setProgress(p => ({ ...p, done: p.done + 1 }));
            setLog(l => [{ sku: event.sku, text: `${event.description_full.split(/\s+/).length} слів, FAQ: ${event.faqCount}${event.ru ? ', рос. ✓' : ', рос. ✗'}`, ok: true }, ...l]);
          } else if (event.type === 'error') {
            setProgress(p => ({ ...p, errors: p.errors + 1 }));
            setLog(l => [{ sku: event.sku, text: event.error, ok: false }, ...l]);
          }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        setLog(l => [{ sku: '', text: String(err), ok: false }, ...l]);
      }
    } finally {
      setRunning(false);
      setCurrentName('');
    }
  }

  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;

  // ── Нормалізація лейблів (без AI, безкоштовно): всі видимі товари з dirtyChars ──
  const dirtyVisible = useMemo(() => visible.filter(i => i.gaps.dirtyChars), [visible]);
  const [normBusy, setNormBusy] = useState(false);
  const [normMsg, setNormMsg] = useState('');

  async function normalizeDirty() {
    if (!dirtyVisible.length || normBusy) return;
    setNormBusy(true);
    setNormMsg('');
    try {
      let changed = 0;
      const skus = dirtyVisible.map(i => i.sku);
      for (let i = 0; i < skus.length; i += 100) {
        const res = await fetch('/api/admin/characteristics/normalize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ skus: skus.slice(i, i + 100) }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        changed += (data.changed ?? []).length;
      }
      setNormMsg(`✓ Нормалізовано ${changed} товарів — оновіть сторінку, щоб перерахувати пробіли`);
    } catch (err) {
      setNormMsg(`✗ ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setNormBusy(false);
    }
  }

  // ── Запити з Search Console (позиції 8–35 = "дожимаємі") ──
  type GscRow = { query: string; page: string; clicks: number; impressions: number; position: number };
  const [gscRows, setGscRows] = useState<GscRow[] | null>(null);
  const [gscError, setGscError] = useState('');
  useEffect(() => {
    fetch('/api/admin/seo/gsc?min=8&max=35&limit=25')
      .then(async res => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        setGscRows(data);
      })
      .catch(err => setGscError(String(err)));
  }, []);

  // ── Що вже робили з цією сторінкою ──
  type PageAction = {
    page_path: string; last_at: string; total: number;
    kinds: ('article_boost' | 'article_products' | 'product_boost' | 'cover')[];
    query: string | null; products: number | null;
  };
  const [actions, setActions] = useState<Map<string, PageAction>>(new Map());

  async function loadActions() {
    try {
      const res = await fetch('/api/admin/seo/actions');
      if (!res.ok) return;
      const rows: PageAction[] = await res.json();
      setActions(new Map(rows.map(r => [r.page_path, r])));
    } catch { /* історія не критична для роботи розділу */ }
  }
  useEffect(() => { void loadActions(); }, []);

  /** Той самий ключ, що в журналі: без домену й без /ru */
  function pagePath(page: string): string {
    return page.replace(/^https?:\/\/[^/]+/i, '').replace(/[?#].*$/, '')
      .replace(/^\/ru(?=\/|$)/, '').replace(/\/+$/, '') || '/';
  }

  const KIND_LABEL: Record<string, string> = {
    article_boost:    'дожим статті',
    article_products: 'товари',
    product_boost:    'перепис картки',
    cover:            'обкладинка',
  };

  function pickGscRow(row: GscRow) {
    setBoostQuery(row.query);
    // Якщо запит веде на сторінку товару — підставляємо SKU автоматично
    const m = /\/product\/([^/?#]+)/.exec(row.page);
    if (m) {
      const target = items.find(i => i.slug === m[1] || i.sku === m[1]);
      setBoostSku(target?.sku ?? '');
    } else {
      setBoostSku('');
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ── "Дожим" запиту: посилення сторінки під конкретний пошуковий запит ──
  const [boostQuery, setBoostQuery] = useState('');
  const [boostSku, setBoostSku] = useState('');
  const [boostBusy, setBoostBusy] = useState<'' | 'product' | 'article'>('');
  const [boostMsg, setBoostMsg] = useState('');

  // Кілька SKU через кому: у статтю треба вести на ВСІ фасовки товару, інакше
  // читач приходить на текст і не бачить, що саме купити під свій обсяг робіт.
  const boostSkus = useMemo(
    () => [...new Set(boostSku.split(/[,;\s]+/).map(s => s.trim()).filter(Boolean))],
    [boostSku],
  );
  const boostItems = useMemo(
    () => boostSkus.map(s => items.find(i => i.sku === s)).filter((i): i is QueueItem => !!i),
    [boostSkus, items],
  );
  const boostItem = boostItems[0];
  const boostUnknown = boostSkus.filter(s => !items.some(i => i.sku === s));
  // Заповнена картка: дожим ПЕРЕЗАПИШЕ наявний опис/FAQ — попереджаємо явно
  const boostItemFull = boostItem ? !hasAnyGap(boostItem) : false;

  // ── Чи є вже стаття під цей запит (антиканібалізація) ──
  type ExistingPost = {
    id: number; slug: string; title: string; is_published: boolean;
    hits: number; of: number; len: number; len_ru: number;
    has_phrase: boolean; product_links: number;
  };
  const [existing, setExisting] = useState<ExistingPost[] | null>(null);

  async function refreshExisting(q: string) {
    try {
      const res = await fetch(`/api/admin/blog/boost?query=${encodeURIComponent(q)}`);
      setExisting(res.ok ? await res.json() : []);
    } catch {
      setExisting([]);
    }
  }

  useEffect(() => {
    const q = boostQuery.trim();
    if (q.length < 6) { setExisting(null); return; }
    const t = setTimeout(() => { void refreshExisting(q); }, 500);
    return () => clearTimeout(t);
  }, [boostQuery]);

  // Дожим картки = ПЕРЕЗАПИС контенту під запит. Раніше тут викликався gap-driven
  // enrich, який на заповненій картці не змінював нічого (опис перегенеровується
  // лише якщо коротший за поріг, FAQ — лише якщо його немає), і запит просто
  // дописувався в keywords — тобто кнопка витрачала гроші даремно. Тепер — force.
  async function boostProduct() {
    if (!boostQuery.trim() || !boostItem) return;
    setBoostBusy('product');
    setBoostMsg('');
    try {
      const res = await fetch('/api/admin/products/ai-fill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skus: [boostItem.sku], force: true, targetQuery: boostQuery.trim() }),
      });
      const text = await res.text();
      if (text.includes('"type":"result"')) {
        setBoostMsg(`✓ Картку ${boostItem.sku} перезаписано під запит: опис, FAQ, keywords, характеристики — обидві мови`);
        void loadActions();
      } else {
        const err = /"error":"([^"]*)"/.exec(text)?.[1];
        throw new Error(err ?? 'генерація не повернула результат');
      }
    } catch (err) {
      setBoostMsg(`✗ ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBoostBusy('');
    }
  }

  // Дожим НАЯВНОЇ статті: розширення тексту під запит + блок посилань на товари.
  // Це найчастіший корисний хід — стаття вже має позицію, її треба дотягнути,
  // а не дублювати новою (дві сторінки під один запит канібалізують одна одну).
  async function boostExistingArticle(postId: number) {
    if (!boostQuery.trim()) return;
    setBoostBusy('article');
    setBoostMsg('');
    try {
      const res = await fetch('/api/admin/blog/boost', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          postId,
          focusQuery: boostQuery.trim(),
          skus: boostSkus,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const grew = `${data.lenBefore}→${data.lenAfter} симв. (рос. ${data.lenRuBefore}→${data.lenRuAfter})`;
      const links = data.linkedSkus?.length ? `, посилання на ${data.linkedSkus.length} товар(ів)` : '';
      setBoostMsg(`✓ Статтю «${data.title}» дожато: ${grew}, FAQ: ${data.faqCount}${links}. Перевірте текст у розділі Блог.`);
      void refreshExisting(boostQuery.trim());
      void loadActions();
    } catch (err) {
      setBoostMsg(`✗ ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBoostBusy('');
    }
  }

  async function boostArticle() {
    if (!boostQuery.trim()) return;
    setBoostBusy('article');
    setBoostMsg('');
    try {
      const res = await fetch('/api/admin/blog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: boostQuery.trim(),
          focusQuery: boostQuery.trim(),
          ...(boostItem ? { mustLink: { href: `/product/${boostItem.slug ?? boostItem.sku}`, label: `${boostItem.brand} ${boostItem.name}` } } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setBoostMsg(`✓ Стаття-чернетка «${data.title}» створена — опублікуйте її в розділі Блог`);
    } catch (err) {
      setBoostMsg(`✗ ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBoostBusy('');
    }
  }

  return (
    <div style={{ padding: '32px 36px 64px', overflowY: 'auto', flex: 1 }}>
      <h1 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>SEO-черга</h1>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '4px 0 20px' }}>
        Товари з пробілами SEO-контенту: {withGaps.length} з {items.length} активних.
        Генерація опису + FAQ запускається тільки вручну — кнопкою нижче, з оцінкою вартості.
        {!faqTableReady && ' ⚠️ Таблиця FAQ ще не створена (міграція 048) — генерація впаде на кроці FAQ.'}
      </p>

      {/* Дожим запиту: посилення сторінок під запити з GSC (позиції 11–30) */}
      <div style={{ padding: '16px 20px', background: 'var(--bg-card, #fff)', border: '1px solid #E2E8F0', borderRadius: 10, marginBottom: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#1E293B', marginBottom: 4 }}>🎯 Дожим запиту</div>
        <p style={{ fontSize: 12, color: '#64748B', margin: '0 0 12px' }}>
          Запити з 2–3 сторінки Google (Search Console → Ефективність, позиції 11–30) дожимаємо контентом.
          <b> Товар</b> (~$0.04) — перезапис опису/FAQ/keywords під запит.
          <b> Стаття</b> (~$0.20) — якщо під запит уже є стаття, дожимаємо її, а не створюємо другу.
          Інформаційні запити («як…», «чим…») тягне стаття, транзакційні («купити…», «ціна») — картка товару.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            value={boostQuery}
            onChange={e => setBoostQuery(e.target.value)}
            disabled={!!boostBusy}
            placeholder="Пошуковий запит, напр.: грунтовка для газобетону яка краще"
            style={{ flex: 2, minWidth: 260, padding: '9px 13px', borderRadius: 8, border: '1px solid #CBD5E1', fontSize: 13 }}
          />
          <input
            value={boostSku}
            onChange={e => setBoostSku(e.target.value)}
            disabled={!!boostBusy}
            placeholder="SKU, можна кілька: 1001-002, 1001-003"
            style={{ width: 240, padding: '9px 13px', borderRadius: 8, border: '1px solid #CBD5E1', fontSize: 13, fontFamily: 'monospace' }}
          />
          <button
            onClick={boostProduct}
            disabled={!!boostBusy || !boostQuery.trim() || !boostItem}
            title={boostSku && !boostItem ? 'SKU не знайдено серед активних товарів' : ''}
            style={{ ...btnPrimary, opacity: boostBusy || !boostQuery.trim() || !boostItem ? 0.5 : 1 }}
          >
            {boostBusy === 'product' ? '⏳ Генеруємо…' : 'Посилити товар'}
          </button>
          <button
            onClick={boostArticle}
            disabled={!!boostBusy || !boostQuery.trim()}
            title={existing?.length ? 'Під цей запит уже є стаття — краще дожати її (кнопка нижче), інакше сторінки конкуруватимуть' : ''}
            style={{
              ...btnPrimary,
              background: existing?.length ? '#94A3B8' : '#4880B8',
              opacity: boostBusy || !boostQuery.trim() ? 0.5 : 1,
            }}
          >
            {boostBusy === 'article' ? '⏳ Пишемо (1–2 хв)…' : existing?.length ? 'Все одно нова стаття' : 'Стаття під запит'}
          </button>
        </div>

        {/* Стан вибраних товарів */}
        {boostItems.length > 0 && (
          <p style={{ fontSize: 12, margin: '8px 0 0', color: '#10B981' }}>
            {boostItems.length === 1
              ? `Товар: ${boostItems[0].brand} ${boostItems[0].name}`
              : `Товарів: ${boostItems.length} — ${boostItems.map(i => i.sku).join(', ')} (усі отримають посилання зі статті)`}
          </p>
        )}
        {boostUnknown.length > 0 && (
          <p style={{ fontSize: 12, margin: '4px 0 0', color: '#EF4444' }}>
            Не знайдено серед активних товарів: {boostUnknown.join(', ')}
          </p>
        )}
        {boostItemFull && boostItems.length === 1 && (
          <p style={{ fontSize: 12, margin: '4px 0 0', color: '#B45309' }}>
            ⚠️ Картка вже повністю заповнена — «Посилити товар» ПЕРЕЗАПИШЕ опис, FAQ і характеристики
            під запит (у т.ч. ручні правки). Якщо ціль — інформаційний запит, дожимайте статтю.
          </p>
        )}

        {/* Антиканібалізація: під запит уже є стаття → дожимаємо її */}
        {existing && existing.length > 0 && (
          <div style={{ marginTop: 10, padding: '10px 12px', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 8 }}>
            <div style={{ fontSize: 12, color: '#92400E', marginBottom: 8 }}>
              Під цей запит уже є стаття. Друга сторінка на ту саму тему відбирає позицію в першої —
              дожимайте наявну.
            </div>
            {existing.map(p => (
              <div key={p.id} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: '5px 0' }}>
                <Link href={`/blog/${p.slug}`} target="_blank" style={{ fontSize: 13, fontWeight: 600, color: '#1E293B' }}>
                  {p.title}
                </Link>
                <span style={{ fontSize: 11, color: '#64748B' }}>
                  {p.is_published ? 'опублікована' : 'чернетка'} · {p.len} симв.
                  {p.len_ru ? ` / рос. ${p.len_ru}` : ' / без рос.'}
                  {' · '}
                  <span style={{ color: p.has_phrase ? '#10B981' : '#EF4444' }}>
                    {p.has_phrase ? 'фраза запиту є' : 'фрази запиту в тексті НЕМАЄ'}
                  </span>
                  {' · '}
                  <span style={{ color: p.product_links ? '#10B981' : '#EF4444' }}>
                    {p.product_links ? `посилань на товари: ${p.product_links}` : 'посилань на товари немає'}
                  </span>
                </span>
                <button
                  onClick={() => boostExistingArticle(p.id)}
                  disabled={!!boostBusy}
                  style={{ ...btnPrimary, background: '#B45309', opacity: boostBusy ? 0.5 : 1 }}
                >
                  {boostBusy === 'article' ? '⏳ Дожимаємо (1–2 хв)…' : 'Дожати статтю'}
                </button>
              </div>
            ))}
          </div>
        )}
        {boostMsg && <p style={{ fontSize: 13, margin: '8px 0 0', color: boostMsg.startsWith('✓') ? '#10B981' : '#EF4444' }}>{boostMsg}</p>}

        {/* Автопідтяжка запитів із Search Console */}
        <div style={{ marginTop: 14, borderTop: '1px solid #E2E8F0', paddingTop: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#64748B', marginBottom: 8 }}>
            Запити з Search Console за 28 днів (позиції 8–35, за показами) — клікніть, щоб підставити:
          </div>
          {gscError && <p style={{ fontSize: 12, color: '#EF4444' }}>GSC недоступний: {gscError.slice(0, 160)}</p>}
          {!gscRows && !gscError && <p style={{ fontSize: 12, color: '#94A3B8' }}>Завантажуємо…</p>}
          {gscRows && gscRows.length === 0 && <p style={{ fontSize: 12, color: '#94A3B8' }}>Поки немає запитів у діапазоні 8–35 — сайт молодий, список наповниться.</p>}
          {gscRows && gscRows.length > 0 && (
            <div style={{ maxHeight: 260, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: '#64748B' }}>
                    <th style={{ padding: '4px 8px' }}>Запит</th>
                    <th style={{ padding: '4px 8px' }}>Сторінка</th>
                    <th style={{ padding: '4px 8px' }}>Що робили</th>
                    <th style={{ padding: '4px 8px', textAlign: 'right' }}>Позиція</th>
                    <th style={{ padding: '4px 8px', textAlign: 'right' }}>Покази</th>
                    <th style={{ padding: '4px 8px', textAlign: 'right' }}>Кліки</th>
                  </tr>
                </thead>
                <tbody>
                  {gscRows.map((r, i) => (
                    <tr
                      key={i}
                      onClick={() => pickGscRow(r)}
                      style={{ cursor: 'pointer', borderTop: '1px solid #F1F5F9' }}
                      title="Клік — підставити запит у форму дожиму"
                    >
                      <td style={{ padding: '5px 8px', fontWeight: 600, color: '#1E293B' }}>{r.query}</td>
                      <td style={{ padding: '5px 8px', color: '#64748B', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.page.replace('https://fixline.com.ua', '') || '/'}
                      </td>
                      <td style={{ padding: '5px 8px', whiteSpace: 'nowrap' }}>
                        {(() => {
                          const a = actions.get(pagePath(r.page));
                          if (!a) return <span style={{ color: '#CBD5E1' }}>—</span>;
                          const when = new Date(a.last_at).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit' });
                          return (
                            <span
                              title={`${a.kinds.map(k => KIND_LABEL[k]).join(', ')}${a.query ? ` · запит: «${a.query}»` : ''}${a.products != null ? ` · товарів: ${a.products}` : ''} · усього дій: ${a.total}`}
                              style={{
                                display: 'inline-block', padding: '2px 8px', borderRadius: 999,
                                background: '#ECFDF5', border: '1px solid #A7F3D0', color: '#047857',
                                fontSize: 11, fontWeight: 600,
                              }}
                            >
                              ✓ {a.kinds.map(k => KIND_LABEL[k]).join(' + ')} · {when}
                            </span>
                          );
                        })()}
                      </td>
                      <td style={{ padding: '5px 8px', textAlign: 'right', fontWeight: 700, color: r.position <= 15 ? '#F59E0B' : '#64748B' }}>{r.position.toFixed(1)}</td>
                      <td style={{ padding: '5px 8px', textAlign: 'right' }}>{r.impressions}</td>
                      <td style={{ padding: '5px 8px', textAlign: 'right' }}>{r.clicks}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Фільтри-чипси */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        <button onClick={() => setFilter('any')} style={chip(filter === 'any')}>
          Усі пробіли ({withGaps.length})
        </button>
        {GAP_LABELS.map(g => (
          <button key={g.key} onClick={() => setFilter(g.key)} style={chip(filter === g.key)}>
            {g.label} ({gapCounts[g.key]})
          </button>
        ))}
      </div>

      {/* Панель запуску */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '12px 16px', background: 'var(--bg-card, #fff)', border: '1px solid #E2E8F0', borderRadius: 10, marginBottom: 16 }}>
        <button onClick={selectAllVisible} disabled={running} style={btnGhost}>
          Вибрати всі з пробілами ({enrichable.length})
        </button>
        <button onClick={() => setSelected(new Set())} disabled={running || !selected.size} style={btnGhost}>
          Скинути
        </button>
        <button
          onClick={normalizeDirty}
          disabled={normBusy || running || !dirtyVisible.length}
          title="Звести лейбли-синоніми до канонічних за словником (без AI, безкоштовно)"
          style={{ ...btnGhost, color: '#0369A1', borderColor: '#BAE6FD', opacity: dirtyVisible.length ? 1 : 0.5 }}
        >
          {normBusy ? '⏳ Нормалізуємо…' : `Нормалізувати лейбли (${dirtyVisible.length})`}
        </button>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 13, color: '#475569' }}>
          Вибрано: <strong>{selectedEnrichable.length}</strong> · Орієнтовна вартість: <strong>${cost}</strong>
        </span>
        {!running ? (
          <button onClick={start} disabled={!selectedEnrichable.length || !faqTableReady} style={{ ...btnPrimary, opacity: selectedEnrichable.length && faqTableReady ? 1 : 0.5 }}>
            ▶ Заповнити пробіли
          </button>
        ) : (
          <button onClick={() => abortRef.current?.abort()} style={btnDanger}>■ Зупинити</button>
        )}
      </div>

      {normMsg && (
        <p style={{ fontSize: 13, margin: '0 0 12px', color: normMsg.startsWith('✓') ? '#10B981' : '#EF4444' }}>{normMsg}</p>
      )}

      {/* Прогрес */}
      {(running || progress.done > 0) && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#475569', marginBottom: 6 }}>
            <span>{running ? `⏳ ${currentName}` : '✅ Завершено'}</span>
            <span>{progress.done} / {progress.total}{progress.errors > 0 && ` · ${progress.errors} помилок`}</span>
          </div>
          <div style={{ background: '#E2E8F0', borderRadius: 6, height: 8, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pct}%`, background: progress.errors ? '#F59E0B' : '#3DBFB8', transition: 'width .3s', borderRadius: 6 }} />
          </div>
        </div>
      )}

      {log.length > 0 && (
        <div style={{ maxHeight: 180, overflowY: 'auto', marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {log.map((l, i) => (
            <div key={i} style={{ fontSize: 12, fontFamily: 'monospace', color: l.ok ? '#10B981' : '#EF4444' }}>
              {l.ok ? '✓' : '✗'} {l.sku} — {l.text}
            </div>
          ))}
        </div>
      )}

      {/* Таблиця */}
      <div style={{ background: 'var(--bg-card, #fff)', border: '1px solid #E2E8F0', borderRadius: 10, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#F8FAFC', textAlign: 'left' }}>
              <th style={th}></th>
              <th style={th}>SKU</th>
              <th style={th}>Товар</th>
              <th style={th}>Категорія</th>
              <th style={th}>Пробіли</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {visible.map(item => {
              // Той самий предикат, що й у enrichable — інакше товар лише з пробілом
              // характеристик не можна було б вибрати чекбоксом
              const canEnrich = item.gaps.thinDesc || item.gaps.noFaq || item.gaps.ruDesc
                || item.gaps.noRu || item.gaps.noKeywords || item.gaps.noChars || item.gaps.missingRequired;
              return (
                <tr key={item.sku} style={{ borderTop: '1px solid #F1F5F9' }}>
                  <td style={td}>
                    <input
                      type="checkbox"
                      checked={selected.has(item.sku)}
                      disabled={!canEnrich || running}
                      onChange={() => toggle(item.sku)}
                    />
                  </td>
                  <td style={{ ...td, fontFamily: 'monospace', fontSize: 12, color: '#64748B' }}>{item.sku}</td>
                  <td style={td}>{item.brand} {item.name}</td>
                  <td style={{ ...td, color: '#64748B', fontSize: 12 }}>{item.category}</td>
                  <td style={td}>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {GAP_LABELS.filter(g => item.gaps[g.key]).map(g => (
                        <span
                          key={g.key}
                          title={g.key === 'missingRequired' ? item.missingLabels.join(', ') : undefined}
                          style={{ fontSize: 11, padding: '2px 8px', borderRadius: 999, background: `${g.color}18`, color: g.color, fontWeight: 600 }}
                        >
                          {g.key === 'missingRequired' ? `обов'язкові хар-ки: ${item.missingLabels.length}` : g.label}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td style={td}>
                    <Link href={`/admin/products/${item.sku}`} style={{ fontSize: 12, color: '#1E3A5F', fontWeight: 600, textDecoration: 'none' }}>
                      Картка →
                    </Link>
                  </td>
                </tr>
              );
            })}
            {visible.length === 0 && (
              <tr><td colSpan={6} style={{ ...td, textAlign: 'center', color: '#94A3B8', padding: 24 }}>Пробілів немає 🎉</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <p style={{ fontSize: 12, color: '#94A3B8', marginTop: 12 }}>
        Заповнюються лише пробіли: тонкий опис, порожні keywords, відсутні обов&apos;язкові характеристики, FAQ без перекладу, порожня рос. назва — одразу двома мовами (укр + рос). Наявний контент і ручні значення не перезаписуються. Та сама генерація доступна кнопкою в картці товару. Фото — вручну.
      </p>
    </div>
  );
}

const chip = (active: boolean): React.CSSProperties => ({
  padding: '6px 14px', borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: 'pointer',
  border: `1px solid ${active ? '#1E3A5F' : '#CBD5E1'}`,
  background: active ? '#1E3A5F' : '#fff',
  color: active ? '#fff' : '#475569',
});

const th: React.CSSProperties = { padding: '10px 12px', fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' };
const td: React.CSSProperties = { padding: '8px 12px', verticalAlign: 'top' };

const btnPrimary: React.CSSProperties = {
  padding: '9px 20px', background: '#3DBFB8', color: '#fff', border: 'none',
  borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer',
};
const btnDanger: React.CSSProperties = { ...btnPrimary, background: '#EF4444' };
const btnGhost: React.CSSProperties = {
  padding: '9px 16px', background: '#fff', color: '#475569', border: '1px solid #CBD5E1',
  borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
};

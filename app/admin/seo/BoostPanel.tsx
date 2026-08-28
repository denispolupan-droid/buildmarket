'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { badge, btnGhost, btnPrimary, card, hint, TONE } from './ui';

// «Дожим» — посилення сторінки під конкретний пошуковий запит.
// Товар (~$0.04) переписує картку; стаття (~$0.20) розширює наявний текст;
// категорія (~$0.10) — редактор /admin/seo/categories/<slug> із запитом як
// ціллю для генерації: там текст пишеться за стандартом і вичитується перед
// збереженням, тому сюди він не вбудований.
// Головне правило розділу: якщо під запит уже є стаття, дожимаємо ЇЇ, а не
// створюємо другу — дві сторінки під один запит канібалізують одна одну.

type FoundProduct = { sku: string; slug: string | null; name: string; brand: string; filled: boolean };

type ExistingPost = {
  id: number; slug: string; title: string; is_published: boolean;
  hits: number; of: number; len: number; len_ru: number;
  has_phrase: boolean; product_links: number;
};

export default function BoostPanel({
  query, setQuery, skus, setSkus, categorySlug, onDone,
}: {
  query: string;
  setQuery: (v: string) => void;
  skus: string;
  setSkus: (v: string) => void;
  /** slug категорії, якщо обраний запит веде на сторінку категорії */
  categorySlug?: string | null;
  /** дія завершилась — оновити позначки «що робили» в таблиці запитів */
  onDone: () => void;
}) {
  const [busy, setBusy] = useState<'' | 'product' | 'article'>('');
  const [msg, setMsg] = useState('');
  const [found, setFound] = useState<FoundProduct[]>([]);
  const [unknown, setUnknown] = useState<string[]>([]);
  const [existing, setExisting] = useState<ExistingPost[] | null>(null);

  const skuList = useMemo(
    () => [...new Set(skus.split(/[,;\s]+/).map(s => s.trim()).filter(Boolean))],
    [skus],
  );

  // Довідка по SKU — окремим запитом, а не з масиву всіх товарів: вкладка
  // «Запити» більше не тягне каталог наперед
  useEffect(() => {
    if (!skuList.length) { setFound([]); setUnknown([]); return; }
    const t = setTimeout(() => {
      fetch(`/api/admin/seo/lookup?skus=${encodeURIComponent(skuList.join(','))}`)
        .then(r => r.json())
        .then(d => { setFound(d.found ?? []); setUnknown(d.unknown ?? []); })
        .catch(() => { setFound([]); setUnknown([]); });
    }, 350);
    return () => clearTimeout(t);
  }, [skuList.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  async function refreshExisting(q: string) {
    try {
      const res = await fetch(`/api/admin/blog/boost?query=${encodeURIComponent(q)}`);
      setExisting(res.ok ? await res.json() : []);
    } catch {
      setExisting([]);
    }
  }

  useEffect(() => {
    const q = query.trim();
    if (q.length < 6) { setExisting(null); return; }
    const t = setTimeout(() => { void refreshExisting(q); }, 500);
    return () => clearTimeout(t);
  }, [query]);

  const first = found[0];
  const overwrites = found.length === 1 && first?.filled;

  // Дожим картки = ПЕРЕЗАПИС контенту під запит. Gap-driven генерація на
  // заповненій картці не міняла нічого і витрачала гроші даремно — тому force.
  async function boostProduct() {
    if (!query.trim() || !first) return;
    setBusy('product');
    setMsg('');
    try {
      const res = await fetch('/api/admin/products/ai-fill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skus: [first.sku], force: true, targetQuery: query.trim() }),
      });
      const text = await res.text();
      if (text.includes('"type":"result"')) {
        const spent = /"costUsd":([\d.]+)/.exec(text)?.[1];
        setMsg(`✓ Картку ${first.sku} перезаписано під запит: опис, FAQ, keywords, характеристики — обидві мови${spent ? ` · $${Number(spent).toFixed(3)}` : ''}`);
        onDone();
      } else {
        throw new Error(/"error":"([^"]*)"/.exec(text)?.[1] ?? 'генерація не повернула результат');
      }
    } catch (err) {
      setMsg(`✗ ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy('');
    }
  }

  async function boostExistingArticle(postId: number) {
    if (!query.trim()) return;
    setBusy('article');
    setMsg('');
    try {
      const res = await fetch('/api/admin/blog/boost', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId, focusQuery: query.trim(), skus: skuList }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const grew = `${data.lenBefore}→${data.lenAfter} симв. (рос. ${data.lenRuBefore}→${data.lenRuAfter})`;
      const links = data.linkedSkus?.length ? `, посилання на ${data.linkedSkus.length} товар(ів)` : '';
      setMsg(`✓ Статтю «${data.title}» дожато: ${grew}, FAQ: ${data.faqCount}${links} · $${Number(data.costUsd ?? 0).toFixed(2)}. Перевірте текст у розділі Блог.`);
      void refreshExisting(query.trim());
      onDone();
    } catch (err) {
      setMsg(`✗ ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy('');
    }
  }

  async function newArticle() {
    if (!query.trim()) return;
    setBusy('article');
    setMsg('');
    try {
      const res = await fetch('/api/admin/blog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: query.trim(),
          focusQuery: query.trim(),
          ...(first ? { mustLink: { href: `/product/${first.slug ?? first.sku}`, label: `${first.brand} ${first.name}` } } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMsg(`✓ Стаття-чернетка «${data.title}» створена · $${Number(data.costUsd ?? 0).toFixed(2)} — опублікуйте її в розділі Блог`);
      onDone();
    } catch (err) {
      setMsg(`✗ ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy('');
    }
  }

  return (
    <div style={{ ...card, marginBottom: 18 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>🎯 Дожим запиту</div>
      <p style={{ ...hint, margin: '0 0 12px' }}>
        Запити з 2–3 сторінки Google дожимаємо контентом. <b>Товар</b> (~$0.04) — перезапис опису, FAQ і
        keywords під запит. <b>Стаття</b> (~$0.20) — якщо під запит уже є стаття, дожимаємо її, а не
        створюємо другу. Інформаційні запити («як…», «чим…») тягне стаття, транзакційні («купити…», «ціна») — картка товару.
      </p>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          disabled={!!busy}
          placeholder="Пошуковий запит, напр.: грунтовка для газобетону яка краще"
          style={inputStyle(2, 260)}
        />
        <input
          value={skus}
          onChange={e => setSkus(e.target.value)}
          disabled={!!busy}
          placeholder="SKU, можна кілька: 1001-002, 1001-003"
          style={{ ...inputStyle(0, 240), width: 240, fontFamily: 'ui-monospace, monospace' }}
        />
        <button
          onClick={boostProduct}
          disabled={!!busy || !query.trim() || !first}
          title={skus && !first ? 'SKU не знайдено серед активних товарів' : ''}
          style={{ ...btnPrimary, opacity: busy || !query.trim() || !first ? 0.5 : 1 }}
        >
          {busy === 'product' ? '⏳ Генеруємо…' : 'Посилити товар'}
        </button>
        <button
          onClick={newArticle}
          disabled={!!busy || !query.trim()}
          title={existing?.length ? 'Під цей запит уже є стаття — краще дожати її, інакше сторінки конкуруватимуть' : ''}
          style={{
            ...btnPrimary,
            background: existing?.length ? 'var(--text-muted)' : 'var(--brand-blue)',
            opacity: busy || !query.trim() ? 0.5 : 1,
          }}
        >
          {busy === 'article' ? '⏳ Пишемо (1–2 хв)…' : existing?.length ? 'Все одно нова стаття' : 'Стаття під запит'}
        </button>
        {categorySlug && (
          <Link
            href={`/admin/seo/categories/${categorySlug}?q=${encodeURIComponent(query.trim())}`}
            title="Запит веде на сторінку категорії: текст під нього пишеться в редакторі категорії за стандартом"
            style={{ ...btnPrimary, textDecoration: 'none', opacity: query.trim() ? 1 : 0.5 }}
          >
            Дожати категорію →
          </Link>
        )}
      </div>

      {found.length > 0 && (
        <p style={{ fontSize: 12, margin: '8px 0 0', color: 'var(--color-success)' }}>
          {found.length === 1
            ? `Товар: ${found[0].brand} ${found[0].name}`
            : `Товарів: ${found.length} — ${found.map(f => f.sku).join(', ')} (усі отримають посилання зі статті)`}
        </p>
      )}
      {unknown.length > 0 && (
        <p style={{ fontSize: 12, margin: '4px 0 0', color: TONE.danger }}>
          Не знайдено серед активних товарів: {unknown.join(', ')}
        </p>
      )}
      {overwrites && (
        <p style={{ fontSize: 12, margin: '4px 0 0', color: TONE.warn }}>
          ⚠️ Картка вже повністю заповнена — «Посилити товар» ПЕРЕЗАПИШЕ опис, FAQ і характеристики
          під запит (у т.ч. ручні правки). Якщо ціль — інформаційний запит, дожимайте статтю.
        </p>
      )}

      {existing && existing.length > 0 && (
        <div style={{ marginTop: 10, padding: '10px 12px', background: 'var(--bg-soft)', border: `1px solid ${TONE.warn}`, borderRadius: 8 }}>
          <div style={{ fontSize: 12, color: TONE.warn, marginBottom: 8 }}>
            Під цей запит уже є стаття. Друга сторінка на ту саму тему відбирає позицію в першої — дожимайте наявну.
          </div>
          {existing.map(p => (
            <div key={p.id} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: '5px 0' }}>
              <Link href={`/blog/${p.slug}`} target="_blank" style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                {p.title}
              </Link>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                {p.is_published ? 'опублікована' : 'чернетка'} · {p.len} симв.
                {p.len_ru ? ` / рос. ${p.len_ru}` : ' / без рос.'}
                {' · '}
                <span style={{ color: p.has_phrase ? 'var(--color-success)' : TONE.danger }}>
                  {p.has_phrase ? 'фраза запиту є' : 'фрази запиту в тексті НЕМАЄ'}
                </span>
                {' · '}
                <span style={{ color: p.product_links ? 'var(--color-success)' : TONE.danger }}>
                  {p.product_links ? `посилань на товари: ${p.product_links}` : 'посилань на товари немає'}
                </span>
              </span>
              <button
                onClick={() => boostExistingArticle(p.id)}
                disabled={!!busy}
                style={{ ...btnGhost, borderColor: TONE.warn, color: TONE.warn, opacity: busy ? 0.5 : 1 }}
              >
                {busy === 'article' ? '⏳ Дожимаємо…' : 'Дожати статтю'}
              </button>
            </div>
          ))}
        </div>
      )}

      {msg && (
        <p style={{ fontSize: 13, margin: '8px 0 0', color: msg.startsWith('✓') ? 'var(--color-success)' : TONE.danger }}>
          {msg}
        </p>
      )}
      {!query.trim() && <p style={{ ...hint, margin: '10px 0 0' }}><span style={badge('info')}>підказка</span> клікніть рядок у таблиці нижче — запит і SKU підставляться самі</p>}
    </div>
  );
}

function inputStyle(flex: number, minWidth: number): React.CSSProperties {
  return {
    flex: flex || undefined,
    minWidth,
    padding: '9px 13px',
    borderRadius: 8,
    border: '1px solid var(--border)',
    background: 'var(--bg-card)',
    color: 'var(--text-primary)',
    fontSize: 13,
  };
}

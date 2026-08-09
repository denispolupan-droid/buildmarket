'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Search } from 'lucide-react';
import ProductImage from './ProductImage';
import { rankProducts, type SuggestProduct } from '../../lib/search-rank';

/**
 * Пошук товарів на головній з живими підказками. Індекс (~всі активні товари,
 * публічні поля) вантажиться ліниво один раз при фокусі з /api/search-index
 * (CDN-кеш), збіг і ранжування — на клієнті, без запитів на кожне натискання.
 * Enter або «Знайти» → /shop?q=…; клік по підказці → сторінка товару.
 */

let indexPromise: Promise<{ products: SuggestProduct[] }> | null = null;
function loadIndex() {
  indexPromise ??= fetch('/api/search-index')
    .then(r => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
    .catch(err => { indexPromise = null; throw err; });
  return indexPromise;
}

export default function HomeSearch({ lang }: { lang: 'uk' | 'ru' }) {
  const router = useRouter();
  const t = (uk: string, ru: string) => (lang === 'ru' ? ru : uk);
  const prefix = lang === 'ru' ? '/ru' : '';

  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  // Довгий плейсхолдер обрізався на телефоні («…артикул»). Скорочуємо його
  // ПІСЛЯ гідрації: інакше серверний HTML і клієнтський розійшлися б.
  // Три щаблі: широкий екран → телефон → зовсім вузький (320px), де навіть
  // скорочений варіант не вміщався (заміряно: 191px тексту в 155px поля).
  const [size, setSize] = useState<'wide' | 'narrow' | 'tiny'>('wide');
  const [products, setProducts] = useState<SuggestProduct[] | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQ(q), 250);
    return () => clearTimeout(timer);
  }, [q]);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  useEffect(() => {
    const narrowMq = window.matchMedia('(max-width: 560px)');
    const tinyMq   = window.matchMedia('(max-width: 345px)');
    const apply = () => setSize(tinyMq.matches ? 'tiny' : narrowMq.matches ? 'narrow' : 'wide');
    apply();
    narrowMq.addEventListener('change', apply);
    tinyMq.addEventListener('change', apply);
    return () => {
      narrowMq.removeEventListener('change', apply);
      tinyMq.removeEventListener('change', apply);
    };
  }, []);

  const found = useMemo(
    () => (products ? rankProducts(products, debouncedQ, lang) : []),
    [products, debouncedQ, lang],
  );
  useEffect(() => { setActive(-1); }, [debouncedQ]);

  const showDropdown = open && debouncedQ.trim().length >= 2;
  const shopHref = `${prefix}/shop?q=${encodeURIComponent(q.trim())}`;

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (active >= 0 && found[active]) {
      go(`${prefix}/product/${found[active].slug ?? found[active].sku}?from=shop`);
    } else if (q.trim()) {
      go(shopHref);
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { setOpen(false); return; }
    if (!showDropdown) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => Math.min(i + 1, found.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => Math.max(i - 1, -1)); }
  }

  return (
    <div ref={rootRef} style={{ position: 'relative', width: '100%', maxWidth: '640px' }}>
      <form onSubmit={submit} style={{ position: 'relative' }}>
        <Search size={17} style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
        <input
          type="search"
          value={q}
          onChange={e => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => { setOpen(true); loadIndex().then(d => setProducts(d.products)).catch(() => {}); }}
          onKeyDown={onKeyDown}
          placeholder={
            size === 'tiny'   ? t('Пошук товару', 'Поиск товара')
          : size === 'narrow' ? t('Пошук товару, артикулу', 'Поиск товара, артикула')
          :                     t('Пошук товару, артикулу або бренду…', 'Поиск товара, артикула или бренда…')}
          aria-label={t('Пошук товару', 'Поиск товара')}
          autoComplete="off"
          className="home-search__input"
        />
        <button type="submit" className="home-search__btn">
          {t('Знайти', 'Найти')}
        </button>
      </form>

      {showDropdown && (
        <div className="home-search-dd">
          {products === null && (
            <div className="home-search-dd__empty">{t('Шукаємо…', 'Ищем…')}</div>
          )}
          {products !== null && found.length === 0 && (
            <div className="home-search-dd__empty">{t('Нічого не знайдено', 'Ничего не найдено')}</div>
          )}

          {found.map((p, i) => {
            const name = lang === 'ru' ? (p.name_ru ?? p.name) : p.name;
            const nameFull = p.volume && !name.includes(p.volume) ? `${name} ${p.volume}` : name;
            const price = p.stock?.price_promo ?? p.stock?.price_retail;
            return (
              <Link
                key={p.sku}
                href={`${prefix}/product/${p.slug ?? p.sku}?from=shop`}
                className={`home-search-row${i === active ? ' home-search-row--active' : ''}`}
                onClick={() => setOpen(false)}
                onMouseEnter={() => setActive(i)}
              >
                <span className="home-search-row__thumb">
                  <ProductImage
                    brand={p.brand} nl1={p.nl1 ?? ''} nl2={p.nl2 ?? undefined}
                    volume={p.volume ?? ''} bc={p.bc} ac={p.ac} type={p.img_type}
                    variant="front" imageUrl={p.image ?? undefined}
                  />
                </span>
                <span className="home-search-row__name">{nameFull}</span>
                {price != null && <span className="home-search-row__price">{price} грн</span>}
              </Link>
            );
          })}

          {found.length > 0 && (
            <button type="button" className="home-search-dd__all" onClick={() => go(shopHref)}>
              {t('Всі результати', 'Все результаты')} <ArrowRight size={14} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

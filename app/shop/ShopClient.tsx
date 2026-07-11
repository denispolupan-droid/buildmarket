'use client';

import React, { useState, useMemo, useRef, useCallback, useEffect, useLayoutEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { getCategoryNameRu } from '../../lib/ru';
import { tFilterLabel, tFilterValue } from '../../lib/translations-ru';
import Link from 'next/link';
import { Plus, Minus, Heart, ChevronDown, Check, SlidersHorizontal, LayoutList, Grid2x2, Rows2, X } from 'lucide-react';
import { CATEGORY_ICONS } from '../../lib/category-icons';
import SearchAutocomplete from '../components/SearchAutocomplete';
import ProductImage from '../components/ProductImage';
import { RatingBadge } from '../components/StarRating';
import ScrollToTop from '../components/ScrollToTop';
import { PROMO } from '../promo.config';
import SalesBanner from '../components/SalesBanner';
import { useCart } from '../../lib/cart';
import { useWishlist } from '../../lib/wishlist';
import { getSupabaseBrowser } from '../../lib/supabase-browser';
import type { ProductFull, Category, ReviewStats } from '../../lib/supabase';
import { getCategoryMeta } from '../../lib/category-descriptions';
import { useStickyCompact } from '../../lib/useStickyCompact';

const SHOP_STATE_KEY = 'shop_filter_state';

function readShopSession<T>(field: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = sessionStorage.getItem(SHOP_STATE_KEY);
    if (!raw) return fallback;
    const val = JSON.parse(raw)[field];
    return val !== undefined ? val : fallback;
  } catch { return fallback; }
}

type CardProps = {
  p: ProductFull;
  price: number | null;
  priceOld: number | null;
  inStock: boolean;
  salePercent: number | null;
  isWished: boolean;
  onToggleWish: () => void;
  onWholesaleBlock: () => void;
  isWholesale: boolean;
  lang: 'uk' | 'ru';
  onSaveState?: () => void;
  rating?: { avg: number; count: number };
};

function ShopCard({ p, price, priceOld, inStock, salePercent, isWished, onToggleWish, onWholesaleBlock, isWholesale, lang, onSaveState, rating }: CardProps) {
  const t = (uk: string, ru: string) => lang === 'ru' ? ru : uk;
  const displayName = lang === 'ru' ? ((p as { name_ru?: string | null }).name_ru ?? p.name) : p.name;
  const [qty, setQty] = useState(1);
  const [inputVal, setInputVal] = useState('1');
  const [copied, setCopied] = useState(false);
  const { addItem, items } = useCart();
  const inCart = items.some(i => i.sku === p.sku);

  function handleCopySku(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard.writeText(p.sku).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  function handleAdd() {
    if (isWholesale) { onWholesaleBlock(); return; }
    addItem({
      sku: p.sku, name: p.name, name_ru: (p as { name_ru?: string | null }).name_ru ?? null,
      brand: p.brand, volume: p.volume ?? null,
      price: price ?? 0, min_order: 1,
      nl1: p.nl1 ?? '', nl2: p.nl2 ?? undefined,
      bc: p.bc, ac: p.ac, img_type: p.img_type, imageUrl: p.image ?? undefined,
      is_promo: !!(p as { stock?: { price_promo?: number | null } }).stock?.price_promo,
    }, qty);
  }

  return (
    <div className="shop-card">
      <Link href={lang === 'ru' ? `/ru/product/${p.sku}?from=shop` : `/product/${p.sku}?from=shop`} className="shop-card__clickable" onClick={() => onSaveState?.()}>
        <div className="shop-card__img">
          <div className="shop-card__badge-stack">
            {salePercent && salePercent > 0 && (
              <span className="shop-card__badge-sale">-{salePercent}%</span>
            )}
            {p.is_hit && <span className="shop-card__badge-hit">{t('ХІТ', 'ХИТ')}</span>}
            {p.is_new && <span className="shop-card__badge-new">НОВИНКА</span>}
          </div>
          <ProductImage
            brand={p.brand} nl1={p.nl1 ?? ''} nl2={p.nl2 ?? undefined}
            volume={p.volume ?? ''} bc={p.bc} ac={p.ac} type={p.img_type}
            variant="front" imageUrl={p.image ?? undefined}
          />
        </div>
        <div className="shop-card__body">
          <div className="shop-card__name" title={`${displayName}${p.volume && !displayName.includes(p.volume) ? ` ${p.volume}` : ''}`}>
            {displayName}{p.volume && !displayName.includes(p.volume) ? ` ${p.volume}` : ''}
          </div>
          <div className="shop-card__meta">
            {/* This group truncates as a unit (color badge is the flexible/ellipsis one) so the
                rating badge — the more valuable signal — always stays fully visible at the right
                edge instead of wrapping or getting squeezed by a long color name. */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flex: 1, minWidth: 0, overflow: 'hidden' }}>
              {(() => {
                const volL = p.volume ? (/кг|г$/.test(p.volume) ? 'Вага' : "Об'єм") : null;
                const colorVal = p.color ?? p.characteristics?.find(c => /^Колір/i.test(c.label))?.value ?? null;
                return (<>
                  <span className="shop-card__meta-brand">{p.brand}</span>
                  {volL     && <span className="shop-card__meta-badge">{p.volume}</span>}
                  {colorVal && <span className="shop-card__meta-badge shop-card__meta-color">{colorVal}</span>}
                </>);
              })()}
            </div>
            {rating && rating.count > 0 && (
              <span style={{ flexShrink: 0 }}>
                <RatingBadge avg={rating.avg} count={rating.count} size={11} />
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '8px', marginTop: '1px' }}>
            <div className={'shop-card__stock' + (inStock ? '' : ' out')}>
              <span className="shop-card__stock-dot" />
              {inStock ? t('В наявності', 'В наличии') : t('Немає', 'Нет')}
            </div>
            <div className="shop-card__price-wrap" style={{ textAlign: 'right' }}>
              {priceOld && <span className="shop-card__price-old">{priceOld} грн</span>}
              {price
                ? <div className="shop-card__price">{price} <span>грн</span></div>
                : <div className="shop-card__price-na">{t('Ціна за запитом', 'Цена по запросу')}</div>
              }
            </div>
          </div>
        </div>
      </Link>

      <div className="shop-card__footer">
        <button
          className={'shop-card__wish' + (isWished ? ' active' : '')}
          aria-label={isWished ? t('Прибрати з обраного', 'Убрать из избранного') : t('Додати в обране', 'Добавить в избранное')}
          onClick={onToggleWish}
        >
          <Heart size={14} fill={isWished ? '#EF4444' : 'none'} strokeWidth={2} />
        </button>
        <div className="shop-card__qty" style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--border)', borderRadius: '7px', overflow: 'hidden', height: '34px', background: 'var(--bg-card)', flexShrink: 0 }}>
          <button aria-label={t('Зменшити кількість', 'Уменьшить количество')} onClick={() => { const v = Math.max(1, qty - 1); setQty(v); setInputVal(String(v)); }} style={{ width: '34px', height: '34px', border: 'none', background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
            <Minus size={11} strokeWidth={2.5} />
          </button>
          <input
            type="number"
            aria-label={t('Кількість', 'Количество')}
            value={inputVal}
            min={1}
            onChange={e => setInputVal(e.target.value)}
            onBlur={() => { const v = parseInt(inputVal, 10); const valid = !isNaN(v) && v >= 1 ? v : 1; setQty(valid); setInputVal(String(valid)); }}
            style={{ width: '28px', height: '34px', border: 'none', background: 'none', textAlign: 'center', fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', outline: 'none', padding: 0 }}
          />
          <button aria-label={t('Збільшити кількість', 'Увеличить количество')} onClick={() => { const v = qty + 1; setQty(v); setInputVal(String(v)); }} style={{ width: '34px', height: '34px', border: 'none', background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
            <Plus size={11} strokeWidth={2.5} />
          </button>
        </div>
        <button
          className="shop-card__btn"
          disabled={!inStock}
          onClick={handleAdd}
          style={inCart ? { background: '#0D9488' } : undefined}
        >
          {inCart ? <><Check size={14} strokeWidth={2.5} /> {t('В кошику', 'В корзине')}</> : <><Plus size={14} strokeWidth={2.5} /> {t('В кошик', 'В корзину')}</>}
        </button>
      </div>
      <div className="shop-card__pack-row">
        <span
          onClick={handleCopySku}
          title={t('Копіювати артикул', 'Копировать артикул')}
          style={{ cursor: 'pointer', color: copied ? '#16A34A' : 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '3px' }}
        >
          Арт. {p.sku}
          {copied
            ? <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            : <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          }
        </span>
      </div>
    </div>
  );
}

type Props = {
  products: ProductFull[];
  categories: Category[];
  reviewStats?: ReviewStats;
  initialSaleOnly?: boolean;
  initialCategory?: string;
  initialBrand?: string;
};

export default function ShopClient({ products, categories, reviewStats, initialSaleOnly = false, initialCategory, initialBrand }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const lang = pathname.startsWith('/ru') ? 'ru' as const : 'uk' as const;
  const t = (uk: string, ru: string) => lang === 'ru' ? ru : uk;
  const catDisplayName = (slug: string, name: string) => lang === 'ru' ? getCategoryNameRu(slug, name) : name;
  const shopBase = lang === 'ru' ? '/ru/shop' : '/shop';
  const [isWholesale,   setIsWholesale]   = useState(false);
  const [showWholesaleModal, setShowWholesaleModal] = useState(false);
  const [search,       setSearch]       = useState('');
  const [selCat,       setSelCat]       = useState<string | null>(initialCategory ?? null);
  const [saleOnly,     setSaleOnly]     = useState(() => readShopSession('saleOnly', initialSaleOnly));
  const [filterValues,       setFilterValues]       = useState<Record<string, string[]>>(() => readShopSession<Record<string, string[]>>('filterValues', initialBrand ? { 'Бренд': [initialBrand] } : {}));
  const [filterVolumes,      setFilterVolumes]      = useState<string[]>(() => readShopSession('filterVolumes', []));
  const [filterVolumesKg,    setFilterVolumesKg]    = useState<string[]>(() => readShopSession('filterVolumesKg', []));
  const [filterPlasticGroup, setFilterPlasticGroup] = useState<string>(() => readShopSession('filterPlasticGroup', ''));
  const [inStockOnly,        setInStockOnly]        = useState<boolean>(() => readShopSession('inStockOnly', false));
  const [collapsedFilters,   setCollapsedFilters]   = useState<Set<string>>(new Set());
  const [expandedValues,     setExpandedValues]     = useState<Set<string>>(new Set());
  const activeFilterCount =
    Object.values(filterValues).filter(a => a.length > 0).length +
    (filterVolumes.length > 0 ? 1 : 0) + (filterVolumesKg.length > 0 ? 1 : 0) +
    (filterPlasticGroup ? 1 : 0) + (inStockOnly ? 1 : 0) + (saleOnly ? 1 : 0);
  const activeChips = useMemo(() => {
    const chips: { id: string; text: string; onRemove: () => void }[] = [];
    Object.entries(filterValues).forEach(([label, values]) => {
      values.forEach(v => {
        chips.push({
          id: `fv:${label}:${v}`,
          text: `${tFilterLabel(label, lang)}: ${tFilterValue(v, lang)}`,
          onRemove: () => setFilterValues(prev => ({
            ...prev,
            [label]: (prev[label] ?? []).filter(x => x.toLowerCase() !== v.toLowerCase()),
          })),
        });
      });
    });
    filterVolumes.forEach(v => {
      chips.push({ id: `vol:${v}`, text: `${t("Об'єм", 'Объём')}: ${v}`, onRemove: () => setFilterVolumes(prev => prev.filter(x => x !== v)) });
    });
    filterVolumesKg.forEach(v => {
      chips.push({ id: `wt:${v}`, text: `${t('Вага', 'Вес')}: ${v}`, onRemove: () => setFilterVolumesKg(prev => prev.filter(x => x !== v)) });
    });
    if (filterPlasticGroup) {
      const plasticLabels: Record<string, string> = {
        universal: t('Універсальний', 'Универсальный'),
        frost: t('Протиморозний', 'Противоморозный'),
        warm: t('Для теплих підлог', 'Для тёплых полов'),
      };
      chips.push({ id: 'plastic', text: `${t('Тип', 'Тип')}: ${plasticLabels[filterPlasticGroup] ?? filterPlasticGroup}`, onRemove: () => setFilterPlasticGroup('') });
    }
    if (inStockOnly) chips.push({ id: 'instock', text: t('Тільки в наявності', 'Только в наличии'), onRemove: () => setInStockOnly(false) });
    if (saleOnly) chips.push({ id: 'sale', text: t('Тільки акційні', 'Только акционные'), onRemove: () => setSaleOnly(false) });
    return chips;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterValues, filterVolumes, filterVolumesKg, filterPlasticGroup, inStockOnly, saleOnly, lang]);
  const clearAllFilters = () => {
    setFilterValues({}); setFilterVolumes([]); setFilterVolumesKg([]);
    setFilterPlasticGroup(''); setInStockOnly(false); setSaleOnly(false);
  };
  const [visibleCount,  setVisibleCount]  = useState(24);
  const [sortBy, setSortBy] = useState<'default' | 'price_asc' | 'price_desc' | 'sale'>('default');
  const [mobilePanel,   setMobilePanel]   = useState<'cats' | 'filters' | null>(null);
  const [gridCols, setGridCols] = useState<1 | 2>(2);
  useEffect(() => {
    const saved = localStorage.getItem('shop_grid_cols');
    if (saved === '1' || saved === '2') setGridCols(Number(saved) as 1 | 2);
  }, []);
  function setGridColsPersist(n: 1 | 2) {
    setGridCols(n);
    localStorage.setItem('shop_grid_cols', String(n));
  }
  const [expandedCats, setExpandedCats] = useState<Set<string>>(() => {
    if (!initialCategory) return new Set<string>();
    const expanded = new Set<string>();
    const catMap = new Map(categories.map(c => [c.slug, c]));
    // Expand the category itself if it has children
    const hasChildren = categories.some(c => c.parent_slug === initialCategory);
    if (hasChildren) expanded.add(initialCategory);
    // Expand all ancestors
    let slug: string | null = initialCategory;
    while (slug) {
      const cat = catMap.get(slug);
      if (cat?.parent_slug) { expanded.add(cat.parent_slug); slug = cat.parent_slug; }
      else break;
    }
    return expanded;
  });
  const catsListRef = useRef<HTMLDivElement>(null);
  const catRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const sidebarRef = useRef<HTMLElement>(null);
  const filtersRef  = useRef<HTMLDivElement>(null);
  const pillsRef = useRef<HTMLDivElement>(null);
  const prevSelCat = useRef<string | null>(initialCategory ?? null);
  const stickyCompact = useStickyCompact();

  // Clear sessionStorage after restoring (so stale state isn't reused on next fresh visit)
  useEffect(() => { sessionStorage.removeItem(SHOP_STATE_KEY); }, []);

  const saveFilterState = useCallback(() => {
    sessionStorage.setItem(SHOP_STATE_KEY, JSON.stringify({
      filterValues, filterVolumes, filterVolumesKg, filterPlasticGroup, saleOnly, inStockOnly,
    }));
  }, [filterValues, filterVolumes, filterVolumesKg, filterPlasticGroup, saleOnly, inStockOnly]);

  useEffect(() => {
    const sidebar = sidebarRef.current;
    if (!sidebar) return;
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      sidebar.scrollTop += e.deltaY;
    };
    sidebar.addEventListener('wheel', handleWheel, { passive: false });
    return () => sidebar.removeEventListener('wheel', handleWheel);
  }, []);

  useEffect(() => {
    const el = pillsRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  useEffect(() => {
    getSupabaseBrowser().auth.getUser().then(({ data }: { data: { user: import('@supabase/supabase-js').User | null } }) => {
      const type = data.user?.user_metadata?.account_type as string | undefined;
      setIsWholesale(['dealer', 'wholesale', 'contractor', 'shop_owner'].includes(type ?? ''));
    });
  }, []);

  useEffect(() => {
    if (initialCategory) setTimeout(() => scrollCatToTop(initialCategory), 150);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Скрол вгору (сторінка + сайдбар) після зміни категорії — спрацьовує після рендеру
  useEffect(() => {
    if (selCat !== prevSelCat.current) {
      prevSelCat.current = selCat;
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
      sidebarRef.current?.scrollTo({ top: 0 });
    }
  }, [selCat]);

  const scrollCatToTop = useCallback((slug: string) => {
    const catEl = catRefs.current[slug];
    const sidebar = sidebarRef.current;
    if (!catEl || !sidebar) return;
    const offset = catEl.getBoundingClientRect().top - sidebar.getBoundingClientRect().top;
    sidebar.scrollTo({ top: Math.max(0, sidebar.scrollTop + offset - 16), behavior: 'smooth' });
  }, []);

  const selectCat = (slug: string | null, scrollSlug?: string) => {
    // На brand-сторінці заголовок рендериться сервером — потрібна повна навігація
    if (initialBrand) {
      router.push(slug ? `${shopBase}/${slug}` : shopBase);
      return;
    }
    setSelCat(slug);
    window.history.pushState(null, '', slug ? `${shopBase}/${slug}` : shopBase);
    sidebarRef.current?.scrollTo({ top: 0 });
    setFilterValues({}); setFilterVolumes([]); setFilterVolumesKg([]); setFilterPlasticGroup(''); setExpandedValues(new Set());
    setVisibleCount(24);
    setMobilePanel(null);
    const target = scrollSlug ?? slug;
    if (target) setTimeout(() => scrollCatToTop(target), 120);
  };
  const { skus: wishSkus, toggle: toggleWish } = useWishlist();

  const parentCats = useMemo(() => categories.filter(c => !c.parent_slug), [categories]);
  const childrenOf = useMemo(() => {
    const map: Record<string, Category[]> = {};
    categories.forEach(c => {
      if (c.parent_slug) {
        if (!map[c.parent_slug]) map[c.parent_slug] = [];
        map[c.parent_slug].push(c);
      }
    });
    return map;
  }, [categories]);

  const matchingSlugs = useMemo(() => {
    if (!selCat) return null;
    const children = (childrenOf[selCat] ?? []).map(c => c.slug);
    return new Set([selCat, ...children]);
  }, [selCat, childrenOf]);


  const catProducts = useMemo(() =>
    matchingSlugs ? products.filter(p => matchingSlugs.has(p.category_slug ?? '')) : products,
  [products, matchingSlugs]);

  const parseVol = (v: string) => parseFloat(v.replace(',', '.').replace(/[^\d.]/g, '') || '0');
  const toGrams  = (v: string) => { const n = parseVol(v); return /кг/.test(v) ? n * 1000 : n; };
  const toNum    = (s: string) => parseFloat(s.replace(',', '.').replace(/[^\d.]/g, '') || 'NaN');

  const volumesL  = useMemo(() => [...new Set(catProducts.map(p => p.volume).filter((v): v is string => !!v && /л$|мл/.test(v)))].sort((a,b) => parseVol(a)-parseVol(b)), [catProducts]);
  const volumesKg = useMemo(() => [...new Set(catProducts.map(p => p.volume).filter((v): v is string => !!v && /кг|г$/.test(v)))].sort((a,b) => toGrams(a)-toGrams(b)), [catProducts]);

  // Єдиний useMemo для ВСІХ фільтрів: поля продукту + характеристики в одному місці
  const allFilters = useMemo(() => {
    const SKIP_LOWER = new Set([
      'колір',
      'бренд', 'торгова марка',
      'тип', 'тип фарби', 'тип ґрунтовки', 'тип герметика', 'тип клею',
      'обсяг', 'об\'єм', 'об\'єм упаковки', 'обсяг упаковки', 'вага',
      'об\'єм балону', 'об\'єм балона',
      'назва продукту', 'марка', 'розмір упаковки', 'розфасування',
      'мінімальна температура застосування', 'максимальна температура застосування',
      'мінімальна температура експлуатації', 'максимальна температура експлуатації',
      'мінімальна температура зберігання',   'максимальна температура зберігання',
      'час висихання поверхні', 'час висихання', 'час повного затвердіння', 'час затвердіння', 'час повного висихання',
      'час початкового схоплення', 'час поверхневого висихання',
      'час висихання (від пилу)', 'час висихання від пилу', 'час висихання (наступний шар)',
      'час висихання (дерево)', 'час висихання (папір)',
      'час відкритого шару', 'час до наступного шару',
      'вага упаковки', 'вага нетто',
      'термін зберігання', 'витрата матеріалу', 'витрата', 'витрата фарби', 'витрата ґрунтовки',
      'первинне розширення', 'вторинне розширення', 'вихід піни',
      'міцність клейового з\'єднання',
      'універсальність', 'прозорість',
      'матеріал', 'тип матеріалу', 'тип основи',
      'тип приміщення',
      'еластичність покриття', 'еластичність',
      'сумісність з основами', 'сумісність',
      'температурний діапазон', 'температурний діапазон експлуатації',
      'стан', 'вміст розчинників', 'сумісні поверхні', 'тип продукту',
      'серія',
      'розведення', 'розведення водою',
      'розчинник', 'консистенція', 'готовність до застосування',
      'ступінь блиску', 'фасування', 'тип проникнення',
      'термін придатності', 'температура нанесення',
      'підходящі основи', 'витрата концентрату',
      'площа обробки',
      'особливості',
      'водостійкість', 'клас водостійкості',
      'ширина шва', 'ширина шва (мм)',
      'область застосування',
      'захист від',
      'кількість шарів', 'кількість шарів нанесення',
      'тип різання', 'товщина',
      'час дії',
      'шліфування',
      'артикул',
      'конструкція',
      'тип інструменту',
      'матеріал корпусу', 'матеріал лезо', 'матеріал ствола', 'матеріал каркасу', 'матеріал корпус',
      'посадочний отвір', 'посадковий отвір',
      'механізм зворотного ходу',
      'сумісний об\'єм картриджів', 'тип картриджа', 'тип балона', 'тип хвостовика',
      'застосування', 'модель', 'розміри',
      'регулювання подачі', 'робоча довжина', 'ширина профілю', 'форма профілю', 'ширина лезо',
      'рід струму', 'вид зварювання', 'вид покриття',
      'положення зварювання', 'позиція зварювання', 'просторове положення зварювання', 'просторове положення', 'просторові положення',
      'метод зварювання', 'струм зварювання', 'тип електродів', 'тип зварювання', 'зварювальний струм (орієнтовно)',
      'марка електрода', 'тип електрода', 'діаметр електрода',
      'довжина картриджа', 'діапазон вимірювання',
      'упаковка', 'кількість ручок', 'капсули', 'кількість у наборі',
      'наявність індикатора', 'покриття', 'сфера застосування',
      'серія / модель', 'міцність на зсув', 'тип голівки',
      'об\'єм / вага',
      'формат відпуску',
      'ефект', 'форма випуску', 'стійкість',
      'матеріал основи', 'стійкість до вологи', 'вантажопідйомність',
      'площа рулону', 'поверхнева щільність', 'максимальне навантаження',
      'основа кріплення', 'ширина рулону',
      'основа',
      'клас зносостійкості', 'склад', 'умови застосування',
      'тип покриття', 'сумісність з поверхнями', 'стандарт',
      'оброблювані поверхні', 'спосіб нанесення', 'інструмент нанесення',
      'тип ефекту', 'спеціальні ефекти',
      'сумісність з ґрунтовками', 'сумісність з грунтовками', 'максимальна температура', 'сумісні матеріали',
      'відтінок', 'сумісність з розчинниками',
      'об\'єм поглинання',
    ]);
    const SKIP_VALUES: Record<string, Set<string>> = {
      'Стан': new Set(['двокомпонентний', 'двокомпонентний шприц']),
    };
    const map = new Map<string, Map<string, string>>();
    const countsMap = new Map<string, Map<string, number>>();

    const add = (label: string, val: string | null | undefined, split = false) => {
      const v = val?.trim();
      if (!v || v === 'Не вказано') return;
      if (!map.has(label)) map.set(label, new Map());
      if (!countsMap.has(label)) countsMap.set(label, new Map());
      const tokens = split ? v.split(/,\s+/).map(t => t.trim()).filter(Boolean) : [v];
      for (const tok of tokens) {
        const key = tok.toLowerCase();
        const cap = tok.charAt(0).toUpperCase() + tok.slice(1);
        const ex = map.get(label)!.get(key);
        if (!ex || (tok[0] === tok[0].toUpperCase() && ex[0] !== ex[0].toUpperCase())) map.get(label)!.set(key, cap);
        countsMap.get(label)!.set(key, (countsMap.get(label)!.get(key) ?? 0) + 1);
      }
    };

    const inInstrumenty = (() => {
      if (!selCat) return false;
      const catMap = new Map(categories.map(c => [c.slug, c]));
      let slug: string | null = selCat;
      while (slug) { if (slug === 'instrumenty') return true; slug = catMap.get(slug)?.parent_slug ?? null; }
      return false;
    })();

    const inMontazhnaPina = (() => {
      if (!selCat) return false;
      const catMap = new Map(categories.map(c => [c.slug, c]));
      let slug: string | null = selCat;
      while (slug) { if (slug === 'montazhna-pina') return true; slug = catMap.get(slug)?.parent_slug ?? null; }
      return false;
    })();

    const inPlastyfikatory = (() => {
      if (!selCat) return false;
      const catMap = new Map(categories.map(c => [c.slug, c]));
      let slug: string | null = selCat;
      while (slug) { if (slug === 'plastyfikatory') return true; slug = catMap.get(slug)?.parent_slug ?? null; }
      return false;
    })();

    const inStrichky = (() => {
      if (!selCat) return false;
      const catMap = new Map(categories.map(c => [c.slug, c]));
      let slug: string | null = selCat;
      while (slug) { if (slug === 'strichky') return true; slug = catMap.get(slug)?.parent_slug ?? null; }
      return false;
    })();

    const inFarby = (() => {
      if (!selCat) return false;
      const catMap = new Map(categories.map(c => [c.slug, c]));
      let slug: string | null = selCat;
      while (slug) { if (slug === 'farby') return true; slug = catMap.get(slug)?.parent_slug ?? null; }
      return false;
    })();

    const inZakhystDerevyny = (() => {
      if (!selCat) return false;
      const catMap = new Map(categories.map(c => [c.slug, c]));
      let slug: string | null = selCat;
      while (slug) { if (slug === 'zakhyst-derevyny') return true; slug = catMap.get(slug)?.parent_slug ?? null; }
      return false;
    })();

    const inKlei = (() => {
      if (!selCat) return false;
      const catMap = new Map(categories.map(c => [c.slug, c]));
      let slug: string | null = selCat;
      while (slug) { if (slug === 'klei') return true; slug = catMap.get(slug)?.parent_slug ?? null; }
      return false;
    })();

    for (const p of catProducts) {
      add('Бренд',  p.brand);
      if (!inInstrumenty) add('Тип', p.product_type);
      add('Колір',  p.color ?? p.characteristics.find(c => /^колір/i.test(c.label))?.value);
      for (const c of p.characteristics ?? []) {
        const label = c.label?.trim();
        if (!label || SKIP_LOWER.has(label.toLowerCase())) continue;
        if (label.toLowerCase().includes('колір')) continue;
        if ((inMontazhnaPina || inPlastyfikatory || inStrichky || inFarby || inZakhystDerevyny || inKlei) && label.toLowerCase() === 'призначення') continue;
        if (SKIP_VALUES[label]?.has(c.value?.trim().toLowerCase())) continue;
        add(label, c.value, true);
      }
    }

    const PRIMARY = new Set(['Бренд', 'Колір']);
    return [...map.entries()]
      .filter(([label, vals]) => vals.size > 1 || PRIMARY.has(label))
      .filter(([, vals]) => vals.size > 0)
      .sort((a, b) => {
        const ap = PRIMARY.has(a[0]), bp = PRIMARY.has(b[0]);
        if (ap !== bp) return ap ? -1 : 1;
        return b[1].size - a[1].size;
      })
      .slice(0, 8)
      .map(([label, vals]) => ({
        label,
        values: [...vals.values()].sort((a, b) => {
          const na = toNum(a), nb = toNum(b);
          if (!isNaN(na) && !isNaN(nb)) return na - nb;
          return a.localeCompare(b, 'uk');
        }),
        counts: countsMap.get(label) ?? new Map<string, number>(),
      }));
  }, [catProducts, selCat, categories]);

  const isPlasticCat = catProducts.length > 0 && catProducts.every(p => /пластифікатор/i.test(p.product_type ?? ''));
  const plasticIsFrost = (p: ProductFull) => /протиморозн/i.test(p.product_type ?? '');
  const plasticIsWarm  = (p: ProductFull) => /теплих підлог/i.test(p.product_type ?? '');

  const filtered = useMemo(() => {
    let list = products;
    if (matchingSlugs)  list = list.filter(p => matchingSlugs.has(p.category_slug ?? ''));
    if (saleOnly)       list = list.filter(p => p.stock?.price_promo != null || (p.stock?.price_retail_old != null && (p.stock?.price_retail ?? 0) > 0));
    if (isPlasticCat && filterPlasticGroup) {
      if (filterPlasticGroup === 'frost')          list = list.filter(plasticIsFrost);
      else if (filterPlasticGroup === 'warm')      list = list.filter(plasticIsWarm);
      else if (filterPlasticGroup === 'universal') list = list.filter(p => !plasticIsFrost(p) && !plasticIsWarm(p));
    }
    if (filterVolumes.length > 0)   list = list.filter(p => filterVolumes.includes(p.volume ?? ''));
    if (filterVolumesKg.length > 0) list = list.filter(p => filterVolumesKg.includes(p.volume ?? ''));
    if (inStockOnly)    list = list.filter(p => p.stock?.stock_status === 'in_stock' || (p.stock?.stock_qty ?? 0) >= 1);
    for (const [label, selectedVals] of Object.entries(filterValues)) {
      if (!selectedVals || selectedVals.length === 0) continue;
      const fvs = new Set(selectedVals.map(v => v.toLowerCase()));
      if (label === 'Бренд')       list = list.filter(p => fvs.has(p.brand.trim().toLowerCase()));
      else if (label === 'Тип')    list = list.filter(p => fvs.has((p.product_type ?? '').trim().toLowerCase()));
      else if (label === 'Колір')  list = list.filter(p => fvs.has((p.color ?? p.characteristics.find(c => /^колір/i.test(c.label))?.value ?? '').toLowerCase()));
      else list = list.filter(p => p.characteristics.some(c => c.label === label && c.value.split(/,\s+/).map(t => t.trim().toLowerCase()).some(tok => fvs.has(tok))));
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.brand.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q)
      );
    }
    return list;
  }, [products, matchingSlugs, saleOnly, filterValues, filterVolumes, filterVolumesKg, inStockOnly, search, filterPlasticGroup, isPlasticCat]);

  const sorted = useMemo(() => {
    if (sortBy === 'default') return filtered;
    return [...filtered].sort((a, b) => {
      if (sortBy === 'price_asc') return (a.stock?.price_retail ?? 0) - (b.stock?.price_retail ?? 0);
      if (sortBy === 'price_desc') return (b.stock?.price_retail ?? 0) - (a.stock?.price_retail ?? 0);
      if (sortBy === 'sale') {
        const sa = a.stock?.price_retail_old != null ? 1 : 0;
        const sb = b.stock?.price_retail_old != null ? 1 : 0;
        return sb - sa;
      }
      return 0;
    });
  }, [filtered, sortBy]);

  useLayoutEffect(() => {
    window.scrollTo({ top: 0 });
  }, [sorted]);

  const countFor = (slug: string) => {
    const children = (childrenOf[slug] ?? []).map(c => c.slug);
    const slugs = new Set([slug, ...children]);
    return products.filter(p => slugs.has(p.category_slug ?? '')).length;
  };

  return (
    <>
    <div className="shop-layout">
      {/* Sidebar */}
      <aside className={`shop-sidebar${mobilePanel ? ' mobile-open' : ''}${mobilePanel === 'cats' ? ' mobile-cats' : ''}${mobilePanel === 'filters' ? ' mobile-filters' : ''}`} ref={sidebarRef}>
        <div className="sidebar-cats-section">
        <h3>{t('Категорії', 'Категории')}</h3>

        <div ref={catsListRef} className="shop-cats-list">
          <button
            className={'shop-cat-item' + (!selCat ? ' active' : '')}
            onClick={() => { selectCat(null); setExpandedCats(new Set()); }}
          >
            <span className="shop-cat-item-label">{t('Всі категорії', 'Все категории')}</span>
          </button>
          {parentCats.map(cat => {
            const children = childrenOf[cat.slug] ?? [];
            const isExpanded = expandedCats.has(cat.slug);
            const isDirectActive = selCat === cat.slug;
            const isParentActive = !isDirectActive && children.some(c => c.slug === selCat || childrenOf[c.slug]?.some(g => g.slug === selCat));
            return (
              <div key={cat.slug} ref={el => { catRefs.current[cat.slug] = el; }} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <button
                  className={'shop-cat-item' + (isDirectActive ? ' active' : isParentActive ? ' parent-active' : '')}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', ...(isExpanded && !isDirectActive ? { background: 'rgba(30,58,95,0.06)', borderRadius: '7px', color: 'var(--text-primary)', fontWeight: 600 } : {}) }}
                  onClick={() => {
                    const expanding = !expandedCats.has(cat.slug);
                    if (children.length > 0) {
                      setExpandedCats(prev => { const next = new Set(prev); next.has(cat.slug) ? next.delete(cat.slug) : next.add(cat.slug); return next; });
                      if (expanding) {
                        if (initialBrand) {
                          router.push(`${shopBase}/${cat.slug}`);
                        } else {
                          // Оновлюємо фільтр БЕЗ скролу сторінки
                          setSelCat(cat.slug);
                          window.history.pushState(null, '', `${shopBase}/${cat.slug}`);
                          setVisibleCount(24);
                          // Тільки сайдбар — після анімації
                          setTimeout(() => scrollCatToTop(cat.slug), 450);
                        }
                      }
                    } else {
                      selectCat(selCat === cat.slug ? null : cat.slug);
                    }
                  }}
                >
                  {(() => { const Icon = CATEGORY_ICONS[cat.slug]; return Icon ? <Icon size={14} strokeWidth={1.8} style={{ flexShrink: 0, opacity: 0.65 }} /> : null; })()}
                  <span className="shop-cat-item-label" style={{ flex: 1, textAlign: 'left' }}>{catDisplayName(cat.slug, cat.name)}</span>
                  {children.length > 0 && (
                    <ChevronDown size={13} style={{ flexShrink: 0, opacity: 0.45, transform: isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.25s cubic-bezier(0.4,0,0.2,1)' }} />
                  )}
                </button>
                <div style={{ overflow: 'hidden', maxHeight: isExpanded ? '2000px' : '0', transition: 'max-height 0.45s cubic-bezier(0.4, 0, 0.2, 1)', marginLeft: '8px', borderLeft: '1px solid rgba(30,58,95,0.2)' }}>
                {children.map(child => {
                  const grandchildren = childrenOf[child.slug] ?? [];
                  const childExpanded = expandedCats.has(child.slug);
                  const isChildDirectActive = selCat === child.slug;
                  const isChildParentActive = !isChildDirectActive && grandchildren.some(g => g.slug === selCat);
                  return (
                    <div key={child.slug} ref={el => { catRefs.current[child.slug] = el; }} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <button
                        className={'shop-cat-item' + (isChildDirectActive ? ' active' : isChildParentActive ? ' parent-active' : '')}
                        style={{ paddingLeft: '12px', fontSize: '13px', width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                        onClick={() => {
                          selectCat(selCat === child.slug ? null : child.slug, cat.slug);
                          if (grandchildren.length > 0) setExpandedCats(prev => { const n = new Set(prev); n.has(child.slug) ? n.delete(child.slug) : n.add(child.slug); return n; });
                        }}
                      >
                        <span className="shop-cat-item-label">{catDisplayName(child.slug, child.name)}</span>
                      </button>
                      <div style={{ overflow: 'hidden', maxHeight: childExpanded ? '1000px' : '0', transition: 'max-height 0.35s cubic-bezier(0.4, 0, 0.2, 1)' }}>
                        {grandchildren.map(gc => (
                          <button
                            key={gc.slug}
                            ref={el => { catRefs.current[gc.slug] = el as unknown as HTMLDivElement; }}
                            className={'shop-cat-item' + (selCat === gc.slug ? ' active' : '')}
                            style={{ paddingLeft: '26px', fontSize: '12px', width: '100%', textAlign: 'left' }}
                            onClick={() => selectCat(selCat === gc.slug ? null : gc.slug, cat.slug)}
                          >
                            <span className="shop-cat-item-label">{catDisplayName(gc.slug, gc.name)}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
                </div>
              </div>
            );
          })}
        </div>


        </div>{/* end sidebar-cats-section */}
        <div ref={filtersRef} className="sidebar-filters-section">
        <button
          className="sidebar-section-divider"
          onClick={() => {
            const s = sidebarRef.current, f = filtersRef.current;
            if (s && f) s.scrollBy({ top: f.getBoundingClientRect().top - s.getBoundingClientRect().top - 16, behavior: 'smooth' });
          }}
        >
          <SlidersHorizontal size={12} strokeWidth={2} />
          {t('Фільтри', 'Фильтры')}
          {activeFilterCount > 0 && <span className="sidebar-filter-badge">{activeFilterCount}</span>}
        </button>

        {(() => {
          const SHOW_LIMIT = 5;
          const toggleCollapse = (key: string) => setCollapsedFilters(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
          const toggleExpand   = (key: string) => setExpandedValues  (prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });

          const renderGroup = (
            key: string,
            label: React.ReactNode,
            items: string[],
            counts: Map<string, number> | null,
            selectedVals: string[],
            onToggle: (v: string) => void,
            formatVal?: (v: string) => string,
          ) => {
            const isCollapsed = collapsedFilters.has(key);
            const isExpanded  = expandedValues.has(key);
            const selectedSet = new Set(selectedVals.map(v => v.toLowerCase()));
            const visible = isExpanded ? items : items.slice(0, SHOW_LIMIT);
            return (
              <div key={key} className="shop-filter-group">
                <button
                  className={'shop-filter-label-btn' + (selectedVals.length > 0 ? ' has-active' : '')}
                  onClick={() => toggleCollapse(key)}
                >
                  <span>{label}</span>
                  {selectedVals.length > 0 && <span className="shop-filter-active-badge">{selectedVals.length}</span>}
                  <ChevronDown size={11} style={{ transform: isCollapsed ? 'rotate(-90deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0 }} />
                </button>
                {!isCollapsed && (
                  <div className="shop-filter-checkboxes">
                    {visible.map(v => {
                      const vkey = v.toLowerCase();
                      const checked = selectedSet.has(vkey);
                      return (
                        <label key={v} className={'shop-filter-check-item' + (checked ? ' checked' : '')} onMouseDown={e => e.preventDefault()}>
                          <input type="checkbox" checked={checked} onChange={() => onToggle(v)} />
                          <span className="shop-filter-check-text">{formatVal ? formatVal(v) : v}</span>
                          {counts && <span className="shop-filter-count">{counts.get(vkey) ?? 0}</span>}
                        </label>
                      );
                    })}
                    {items.length > SHOW_LIMIT && (
                      <button className="shop-filter-show-more" onClick={() => toggleExpand(key)}>
                        {isExpanded ? t('Сховати', 'Скрыть') : `+ ${items.length - SHOW_LIMIT} ${t('ще', 'ещё')}`}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          };

          const toggler = (arr: string[], setArr: React.Dispatch<React.SetStateAction<string[]>>) =>
            (v: string) => setArr(prev => prev.includes(v) ? prev.filter(x => x !== v) : [...prev, v]);

          const charToggler = (label: string) =>
            (v: string) => setFilterValues(prev => {
              const cur = prev[label] ?? [];
              const key = v.toLowerCase();
              const next = cur.map(s => s.toLowerCase()).includes(key)
                ? cur.filter(s => s.toLowerCase() !== key)
                : [...cur, v];
              return { ...prev, [label]: next };
            });

          const charFilterKeys = allFilters.filter(f => !(isPlasticCat && f.label === 'Тип')).map(f => f.label);
          const allKeys = [
            ...(volumesL.length > 0 ? ['__vol'] : []),
            ...(volumesKg.length > 0 ? ['__wt'] : []),
            ...(isPlasticCat ? ['__plastic'] : []),
            ...charFilterKeys,
          ];
          const allCollapsed = allKeys.length > 0 && allKeys.every(k => collapsedFilters.has(k));
          const resetAll = () => {
            setFilterValues({}); setFilterVolumes([]); setFilterVolumesKg([]);
            setFilterPlasticGroup(''); setInStockOnly(false); setSaleOnly(false); setExpandedValues(new Set());
          };

          return (
            <>
              <div className="shop-filter-controls">
                <button
                  className="shop-filter-ctrl-btn"
                  onClick={() => setCollapsedFilters(allCollapsed ? new Set() : new Set(allKeys))}
                >
                  {allCollapsed ? t('Розгорнути все', 'Развернуть все') : t('Згорнути все', 'Свернуть все')}
                </button>
                {activeFilterCount > 0 && (
                  <button className="shop-filter-ctrl-btn reset" onClick={resetAll}>
                    {t('Скинути все', 'Сбросить все')}
                  </button>
                )}
              </div>
              {volumesL.length > 0 && renderGroup('__vol', t("Об'єм", 'Объём'), volumesL, null, filterVolumes, toggler(filterVolumes, setFilterVolumes))}
              {volumesKg.length > 0 && renderGroup('__wt', t('Вага', 'Вес'), volumesKg, null, filterVolumesKg, toggler(filterVolumesKg, setFilterVolumesKg))}
              {isPlasticCat && (() => {
                const plasticItems = [
                  { v: 'universal', label: t('Універсальний', 'Универсальный') },
                  { v: 'frost',     label: t('Протиморозний', 'Противоморозный') },
                  { v: 'warm',      label: t('Для теплих підлог', 'Для тёплых полов') },
                ];
                const isCollapsed = collapsedFilters.has('__plastic');
                return (
                  <div className="shop-filter-group">
                    <button
                      className={'shop-filter-label-btn' + (filterPlasticGroup ? ' has-active' : '')}
                      onClick={() => toggleCollapse('__plastic')}
                    >
                      <span>Тип</span>
                      {filterPlasticGroup && <span className="shop-filter-active-badge">1</span>}
                      <ChevronDown size={11} style={{ transform: isCollapsed ? 'rotate(-90deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0 }} />
                    </button>
                    {!isCollapsed && (
                      <div className="shop-filter-checkboxes">
                        {plasticItems.map(({ v, label }) => (
                          <label key={v} className={'shop-filter-check-item' + (filterPlasticGroup === v ? ' checked' : '')} onMouseDown={e => e.preventDefault()}>
                            <input type="checkbox" checked={filterPlasticGroup === v} onChange={() => setFilterPlasticGroup(prev => prev === v ? '' : v)} />
                            <span className="shop-filter-check-text">{label}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}
              {charFilterKeys.length > 0 && allFilters
                .filter(f => !(isPlasticCat && f.label === 'Тип'))
                .map(({ label, values, counts }) =>
                  renderGroup(label, tFilterLabel(label, lang), values, counts, filterValues[label] ?? [], charToggler(label), v => tFilterValue(v, lang))
                )}
            </>
          );
        })()}
        <label className="shop-filter-check" onMouseDown={e => e.preventDefault()}>
          <input type="checkbox" checked={inStockOnly} onChange={e => setInStockOnly(e.target.checked)} />
          {t('Тільки в наявності', 'Только в наличии')}
        </label>
        <label className="shop-filter-check" onMouseDown={e => e.preventDefault()}>
          <input type="checkbox" checked={saleOnly} onChange={e => setSaleOnly(e.target.checked)} />
          {t('Тільки акційні', 'Только акционные')}
        </label>
        </div>{/* end sidebar-filters-section */}


      </aside>

      {/* Main */}
      <div style={{ minWidth: 0 }}>
        <div className="shop-topbar">
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
            <div className="shop-title">{saleOnly ? t('Акційні товари', 'Акционные товары') : t('Магазин', 'Магазин')}</div>
            <span className="shop-count">{filtered.length} {t('товарів', 'товаров')}</span>
          </div>
          <div className="shop-topbar-actions" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div className="shop-view-toggle">
              <button
                className={'shop-view-toggle-btn' + (gridCols === 2 ? ' active' : '')}
                onClick={() => setGridColsPersist(2)}
                aria-label={t('По 2 в ряд', 'По 2 в ряд')}
              >
                <Grid2x2 size={16} strokeWidth={2} />
              </button>
              <button
                className={'shop-view-toggle-btn' + (gridCols === 1 ? ' active' : '')}
                onClick={() => setGridColsPersist(1)}
                aria-label={t('По 1 в ряд', 'По 1 в ряд')}
              >
                <Rows2 size={16} strokeWidth={2} />
              </button>
            </div>
            <button
              className={'shop-mobile-filter-btn' + (mobilePanel === 'cats' ? ' active' : '')}
              onClick={() => setMobilePanel(v => v === 'cats' ? null : 'cats')}
            >
              <LayoutList size={14} strokeWidth={2} />
              {t('Категорії', 'Категории')}
            </button>
            {(() => {
              const count = Object.values(filterValues).filter(a => a.length > 0).length +
                (filterVolumes.length > 0 ? 1 : 0) + (filterVolumesKg.length > 0 ? 1 : 0) +
                (inStockOnly ? 1 : 0) + (filterPlasticGroup ? 1 : 0);
              return (
                <button
                  className={'shop-mobile-filter-btn' + (mobilePanel === 'filters' ? ' active' : '')}
                  onClick={() => setMobilePanel(v => v === 'filters' ? null : 'filters')}
                >
                  <SlidersHorizontal size={14} strokeWidth={2} />
                  {t('Фільтри', 'Фильтры')}
                  {count > 0 && <span className="shop-mobile-filter-badge">{count}</span>}
                </button>
              );
            })()}
            <button
              onClick={() => setSaleOnly(v => !v)}
              className={saleOnly ? undefined : 'btn-icon'}
              style={{
                height: '34px', padding: '0 14px', borderRadius: '8px', border: '1px solid var(--border)',
                background: saleOnly ? '#EF4444' : 'var(--bg-soft)',
                color: saleOnly ? '#fff' : 'var(--text-secondary)',
                fontSize: '13px', fontWeight: 700, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '5px',
              }}
            >
              🔥 {t('Акція', 'Акция')}
            </button>
            <select
              className="shop-sort-select"
              value={sortBy}
              onChange={e => { setSortBy(e.target.value as typeof sortBy); setVisibleCount(24); }}
            >
              <option value="default">{t('За замовчуванням', 'По умолчанию')}</option>
              <option value="price_asc">{t('Ціна: від низької', 'Цена: по возрастанию')}</option>
              <option value="price_desc">{t('Ціна: від високої', 'Цена: по убыванию')}</option>
              <option value="sale">{t('Спочатку акційні', 'Сначала акционные')}</option>
            </select>
          </div>
        </div>

        <div className={'shop-sticky-bar' + (stickyCompact ? ' is-compact' : '')}>
          <SearchAutocomplete
            value={search}
            onChange={setSearch}
            placeholder={t('Пошук за назвою, артикулом, брендом...', 'Поиск по названию, артикулу, бренду...')}
            wrapperClassName="shop-search"
            iconClassName="shop-search__icon"
          />

          <div className="shop-cats-pills" ref={pillsRef}>
          <button
            className={'shop-cat-pill' + (!selCat ? ' active' : '')}
            onClick={() => { selectCat(null); setExpandedCats(new Set()); }}
          >
            {t('Всі категорії', 'Все категории')}
          </button>
          {parentCats.map(cat => {
            const isActive = selCat === cat.slug || (childrenOf[cat.slug] ?? []).some(c => c.slug === selCat || (childrenOf[c.slug] ?? []).some(g => g.slug === selCat));
            return (
              <button
                key={cat.slug}
                className={'shop-cat-pill' + (isActive ? ' active' : '')}
                onClick={() => {
                  const willNavigate = !!initialBrand || (!!initialCategory && cat.slug !== initialCategory);
                  if (isActive) {
                    selectCat(null);
                    if (!willNavigate) setExpandedCats(new Set());
                  } else {
                    selectCat(cat.slug);
                    // Only update sidebar state in-place; navigating pages handle it via useState init
                    if (!willNavigate) {
                      setExpandedCats(new Set([cat.slug]));
                      setTimeout(() => scrollCatToTop(cat.slug), 500);
                    }
                  }
                }}
              >
                {catDisplayName(cat.slug, cat.name)}
              </button>
            );
          })}
          </div>
        </div>

        {activeChips.length > 0 && (
          <div className="shop-active-filters">
            {activeChips.map(chip => (
              <button key={chip.id} className="shop-filter-chip" onClick={chip.onRemove}>
                {chip.text}
                <X size={12} strokeWidth={2.5} />
              </button>
            ))}
            <button className="shop-filter-chip shop-filter-chip--clear" onClick={clearAllFilters}>
              {t('Очистити всі', 'Очистить все')}
            </button>
          </div>
        )}

        <SalesBanner mode="shop" activeSlugs={matchingSlugs} />
        <div className={'shop-grid' + (gridCols === 1 ? ' list-view' : '')}>
          {sorted.length === 0 && (
            <div className="shop-empty">{t('Нічого не знайдено', 'Ничего не найдено')}</div>
          )}
          {sorted.slice(0, visibleCount).map(p => {
            const pricePromo = p.stock?.price_promo ?? null;
            const price = pricePromo ?? (p.stock?.price_retail ?? null);
            const priceOld = pricePromo
              ? (p.stock?.price_retail ?? null)
              : (p.stock?.price_retail_old ?? null);
            const inStock = p.stock?.stock_status === 'in_stock' || (p.stock?.stock_qty ?? 0) >= 1;
            const salePercent = price && priceOld
              ? Math.round((1 - price / priceOld) * 100)
              : null;
            return (
              <ShopCard
                key={p.sku}
                p={p}
                price={price}
                priceOld={priceOld}
                inStock={inStock}
                salePercent={salePercent}
                isWholesale={isWholesale}
                onWholesaleBlock={() => setShowWholesaleModal(true)}
                isWished={wishSkus.has(p.sku)}
                onToggleWish={() => toggleWish(p.sku)}
                lang={lang}
                onSaveState={saveFilterState}
                rating={reviewStats?.[p.sku]}
              />
            );
          })}
        </div>

        {sorted.length > visibleCount && (
          <div style={{ textAlign: 'center', padding: '32px 0' }}>
            <button
              onClick={() => setVisibleCount(v => v + 24)}
              style={{
                height: '48px', padding: '0 32px', borderRadius: '12px',
                background: '#1E3A5F', color: '#fff', border: 'none',
                fontSize: '14px', fontWeight: 700, cursor: 'pointer',
              }}
            >
              {t('Показати більше', 'Показать больше')} ({sorted.length - visibleCount} {t('залишилось', 'осталось')})
            </button>
          </div>
        )}
      </div>
    </div>

    {/* Category description + FAQ — shown only when category selected via sidebar filter,
        NOT when already on a dedicated /shop/[category] page (it renders this server-side) */}
    {(() => {
      const meta = selCat ? getCategoryMeta(selCat) : null;
      const catName = selCat ? categories.find(c => c.slug === selCat)?.name : null;
      if (!meta || !catName) return null;
      return (
        <div style={{ padding: '0 0 32px' }}>
          <div style={{ padding: '16px 20px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-card)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '8px' }}>
              <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', margin: 0 }}>
                {t('Про категорію', 'О категории')} «{catName}»
              </p>
              {meta.blogSlug && (
                <Link href={lang === 'ru' ? `/ru/blog/${meta.blogSlug}` : `/blog/${meta.blogSlug}`} style={{ fontSize: '12px', color: '#4880B8', fontWeight: 600, whiteSpace: 'nowrap', textDecoration: 'none' }}>
                  {t('Читати статтю →', 'Читать статью →')}
                </Link>
              )}
            </div>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.7, margin: 0 }}>{meta.description}</p>
            {meta.seoText && (
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.7, margin: '8px 0 0' }}>{meta.seoText}</p>
            )}
            {meta.faq && meta.faq.length > 0 && (
              <div style={{ marginTop: '16px', borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
                <p style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {t('Часті запитання', 'Частые вопросы')}
                </p>
                {meta.faq.map((item, i) => (
                  <div key={i} style={{ marginBottom: i < meta.faq!.length - 1 ? '12px' : 0 }}>
                    <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 4px' }}>{item.q}</p>
                    <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.65, margin: 0 }}>{item.a}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      );
    })()}

    <ScrollToTop />

    {/* Wholesale block modal */}
    {showWholesaleModal && (
      <div
        onClick={() => setShowWholesaleModal(false)}
        style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(0,0,0,0.5)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', padding: '24px',
        }}
      >
        <div
          onClick={e => e.stopPropagation()}
          style={{
            background: 'var(--bg-card)', borderRadius: '16px',
            padding: '36px 32px', maxWidth: '420px', width: '100%',
            textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          }}
        >
          <div style={{ fontSize: '36px', marginBottom: '12px' }}>🏢</div>
          <h2 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '10px' }}>
            {t('Ви увійшли як оптовий клієнт', 'Вы вошли как оптовый клиент')}
          </h2>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '24px' }}>
            {t('У магазині вказані роздрібні ціни. Для замовлення за вашими цінами перейдіть до оптового каталогу.', 'В магазине указаны розничные цены. Для заказа по вашим ценам перейдите в оптовый каталог.')}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <a href={lang === 'ru' ? '/ru/catalog' : '/catalog'} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              height: '44px', borderRadius: '10px', background: '#1E3A5F', color: '#fff',
              fontSize: '14px', fontWeight: 700, textDecoration: 'none',
            }}>
              {t('Перейти до оптового каталогу →', 'Перейти в оптовый каталог →')}
            </a>
            <button
              onClick={() => setShowWholesaleModal(false)}
              style={{
                height: '40px', borderRadius: '10px', border: '1px solid var(--border)',
                background: 'transparent', color: 'var(--text-secondary)',
                fontSize: '13px', cursor: 'pointer',
              }}
            >
              {t('Залишитись і переглянути магазин', 'Остаться и просматривать магазин')}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}

'use client';

import React, { useState, useMemo, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Upload, Heart, Eye, Plus, Check, ChevronDown, ChevronRight, ChevronUp, LayoutList, SlidersHorizontal, LayoutGrid, Table2, X } from 'lucide-react';
import { CATEGORY_ICONS } from '../../lib/category-icons';
import SearchAutocomplete from '../components/SearchAutocomplete';
import Link from 'next/link';
import ProductImage from '../components/ProductImage';
import { RatingBadge } from '../components/StarRating';
import ScrollToTop from '../components/ScrollToTop';
import { PROMO } from '../promo.config';
import SalesBanner from '../components/SalesBanner';
import type { ProductFull, Category, ReviewStats } from '../../lib/supabase';
import { useCart } from '../../lib/cart';
import { useWishlist } from '../../lib/wishlist';
import { getSupabaseBrowser } from '../../lib/supabase-browser';
import { getCategoryNameRu } from '../../lib/ru';
import { tFilterLabel, tFilterValue } from '../../lib/translations-ru';

const WHOLESALE_MIN = 3000;

import { getCategoryMeta } from '../../lib/category-descriptions';
import { useStickyCompact } from '../../lib/useStickyCompact';
import './catalog.css';

function CopySkuBtn({ sku, lang }: { sku: string; lang: 'uk' | 'ru' }) {
  const [copied, setCopied] = useState(false);
  function handleCopy(e: React.MouseEvent) {
    e.preventDefault(); e.stopPropagation();
    navigator.clipboard.writeText(sku).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
  }
  return (
    <span onClick={handleCopy} title={lang === 'ru' ? 'Копировать артикул' : 'Копіювати артикул'} style={{ cursor: 'pointer', color: copied ? '#16A34A' : 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '3px', userSelect: 'none' }}>
      {lang === 'ru' ? 'Арт.' : 'Арт.'} {sku}
      {copied
        ? <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        : <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
      }
    </span>
  );
}

type Props = { products: ProductFull[]; categories: Category[]; reviewStats?: ReviewStats; initialSearch?: string; initialCategory?: string; initialSaleOnly?: boolean };

export default function CatalogClient({ products, categories, reviewStats, initialSearch = '', initialCategory = '', initialSaleOnly = false }: Props) {
  const [isWholesale, setIsWholesale] = useState(false);
  const [search,        setSearch]        = useState(initialSearch);
  const [selCat,        setSelCat]        = useState(initialCategory);
  const router   = useRouter();
  const pathname = usePathname();
  const lang     = pathname.startsWith('/ru') ? 'ru' as const : 'uk' as const;
  const t        = (uk: string, ru: string) => lang === 'ru' ? ru : uk;
  const cName    = (name: string, slug: string) => lang === 'ru' ? getCategoryNameRu(slug, name) : name;

  const catsListRef = useRef<HTMLDivElement>(null);
  const catRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const sidebarRef = useRef<HTMLElement>(null);
  const prevSelCat = useRef(initialCategory);
  const pillsRef    = useRef<HTMLDivElement>(null);
  const filtersRef  = useRef<HTMLDivElement>(null);
  const stickyCompact = useStickyCompact();
  useEffect(() => {
    getSupabaseBrowser().auth.getUser().then(({ data }: { data: { user: import('@supabase/supabase-js').User | null } }) => {
      const type = data.user?.user_metadata?.account_type as string | undefined;
      setIsWholesale(['dealer', 'wholesale', 'contractor', 'shop_owner'].includes(type ?? ''));
    });
  }, []);

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
    if (initialCategory) setTimeout(() => scrollCatToTop(initialCategory), 150);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selCat !== prevSelCat.current) {
      prevSelCat.current = selCat;
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
      sidebarRef.current?.scrollTo({ top: 0 });
      if (catsListRef.current) catsListRef.current.scrollTop = 0;
    }
  }, [selCat]);

  const scrollCatToTop = useCallback((slug: string) => {
    const catEl = catRefs.current[slug];
    const container = catsListRef.current;
    if (!catEl || !container) return;
    const offset = catEl.getBoundingClientRect().top - container.getBoundingClientRect().top;
    container.scrollTo({ top: Math.max(0, container.scrollTop + offset - 8), behavior: 'smooth' });
  }, []);

  const selectCat = (slug: string, scrollSlug?: string) => {
    setSelCat(slug);
    router.replace(slug ? `?category=${slug}` : '?', { scroll: false } as never);
    document.documentElement.scrollTop = 0; document.body.scrollTop = 0;
    sidebarRef.current?.scrollTo({ top: 0 });
    if (catsListRef.current) catsListRef.current.scrollTop = 0;
    setVisibleCount(50);
    setMobilePanel(null);
    const target = scrollSlug ?? slug;
    if (target) setTimeout(() => scrollCatToTop(target), 120);
  };
  const [filterValues,     setFilterValues]     = useState<Record<string, string[]>>({});
  const [filterVolumes,    setFilterVolumes]    = useState<string[]>([]);
  const [filterVolumesKg,  setFilterVolumesKg]  = useState<string[]>([]);
  const [collapsedFilters, setCollapsedFilters] = useState<Set<string>>(new Set());
  const [expandedValues,   setExpandedValues]   = useState<Set<string>>(new Set());
  const [inStockOnly,      setInStockOnly]      = useState(false);
  const [saleOnly,      setSaleOnly]      = useState(initialSaleOnly);
  const [visibleCount,  setVisibleCount]  = useState(50);
  const [viewMode, setViewMode] = useState<'table' | 'grid'>(() => {
    if (typeof window === 'undefined') return 'table';
    return (localStorage.getItem('catalog-view') as 'table' | 'grid') ?? 'table';
  });
  function changeViewMode(mode: 'table' | 'grid') {
    setViewMode(mode);
    localStorage.setItem('catalog-view', mode);
  }
  // The pricing table has 8 fixed-width columns and doesn't fit a phone screen — always show cards on mobile
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  const effectiveViewMode = isMobile ? 'grid' : viewMode;
  const [expandedCats, setExpandedCats]  = useState<Set<string>>(() => {
    if (!initialCategory) return new Set<string>();
    const expanded = new Set<string>();
    const catMap = new Map(categories.map(c => [c.slug, c]));
    const childSlugs = new Set(categories.filter(c => c.parent_slug === initialCategory).map(c => c.slug));
    let slug: string | null = initialCategory;
    while (slug) {
      const cat = catMap.get(slug);
      if (cat?.parent_slug) { expanded.add(cat.parent_slug); slug = cat.parent_slug; }
      else break;
    }
    if (childSlugs.size > 0) expanded.add(initialCategory);
    return expanded;
  });
  const [mobilePanel,   setMobilePanel]   = useState<'cats' | 'filters' | null>(null);
  const [quantities,    setQuantities]    = useState<Record<string, number>>({});
  const [inputVals,     setInputVals]     = useState<Record<string, string>>({});
  const [added,         setAdded]         = useState<Record<string, boolean>>({});
  const { addItem, items: cartItems, totalPrice: cartTotal } = useCart();
  const { toggle, isLiked } = useWishlist();
  const inCartSkus = useMemo(() => new Set(cartItems.map(i => i.sku)), [cartItems]);

  const cartPct       = Math.min(100, Math.round((cartTotal / WHOLESALE_MIN) * 100));
  const cartMet       = cartTotal >= WHOLESALE_MIN;
  const cartRemaining = WHOLESALE_MIN - cartTotal;
  const activeFilterCount =
    Object.values(filterValues).filter(a => a.length > 0).length +
    (filterVolumes.length > 0 ? 1 : 0) + (filterVolumesKg.length > 0 ? 1 : 0) +
    (inStockOnly ? 1 : 0) + (saleOnly ? 1 : 0);
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
    if (inStockOnly) chips.push({ id: 'instock', text: t('Тільки в наявності', 'Только в наличии'), onRemove: () => setInStockOnly(false) });
    if (saleOnly) chips.push({ id: 'sale', text: t('Тільки акційні', 'Только акционные'), onRemove: () => setSaleOnly(false) });
    return chips;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterValues, filterVolumes, filterVolumesKg, inStockOnly, saleOnly, lang]);
  const clearAllFilters = () => {
    setFilterValues({}); setFilterVolumes([]); setFilterVolumesKg([]);
    setInStockOnly(false); setSaleOnly(false);
  };

  const badgeRef = useRef<HTMLAnchorElement>(null);
  const [badgeVisible, setBadgeVisible] = useState(true);
  useEffect(() => {
    if (!isWholesale || !badgeRef.current) return;
    const obs = new IntersectionObserver(([e]) => setBadgeVisible(e.isIntersecting), { threshold: 0 });
    obs.observe(badgeRef.current);
    return () => obs.disconnect();
  }, [isWholesale]);

  const [pillEntered, setPillEntered] = useState(false);
  useEffect(() => {
    if (!badgeVisible && isWholesale) {
      const timer = setTimeout(() => setPillEntered(true), 20);
      return () => clearTimeout(timer);
    }
    setPillEntered(false);
  }, [badgeVisible, isWholesale]);

  const prevCartTotalRef = useRef<number>(-1);
  const flashTimeoutRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [cartFlash, setCartFlash] = useState(false);
  useEffect(() => {
    if (prevCartTotalRef.current === -1) { prevCartTotalRef.current = cartTotal; return; }
    if (cartTotal !== prevCartTotalRef.current) {
      prevCartTotalRef.current = cartTotal;
      if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
      setCartFlash(true);
      flashTimeoutRef.current = setTimeout(() => setCartFlash(false), 900);
    }
  }, [cartTotal]);


  const parentCats = useMemo(() => categories.filter(c => !c.parent_slug), [categories]);
  const childrenOf = useMemo(() => {
    const map: Record<string, Category[]> = {};
    categories.filter(c => c.parent_slug).forEach(c => {
      (map[c.parent_slug!] ??= []).push(c);
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

  const allFilters = useMemo(() => {
    const SKIP_LOWER = new Set([
      'колір', 'бренд', 'торгова марка',
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
      'термін зберігання', 'витрата матеріалу', 'витрата', 'витрата фарби', 'витрата ґрунтовки',
      'первинне розширення', 'вторинне розширення', 'вихід піни',
      'міцність клейового з\'єднання',
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
      'матеріал',
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
      add('Бренд', p.brand);
      if (!inInstrumenty) add('Тип', p.product_type);
      add('Колір', p.color ?? p.characteristics.find(c => /^колір/i.test(c.label))?.value);
      for (const c of p.characteristics ?? []) {
        const label = c.label?.trim();
        if (!label || SKIP_LOWER.has(label.toLowerCase()) || label.toLowerCase().includes('колір')) continue;
        if ((inMontazhnaPina || inPlastyfikatory || inStrichky || inFarby || inZakhystDerevyny || inKlei) && label.toLowerCase() === 'призначення') continue;
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

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return products.filter(p => {
      if (q && !p.name.toLowerCase().includes(q) && !p.sku.toLowerCase().includes(q) && !p.brand.toLowerCase().includes(q) && !(lang === 'ru' && ((p as { name_ru?: string | null }).name_ru ?? '').toLowerCase().includes(q))) return false;
      if (matchingSlugs && !matchingSlugs.has(p.category_slug ?? '')) return false;
      if (filterVolumes.length > 0   && !filterVolumes.includes(p.volume ?? ''))   return false;
      if (filterVolumesKg.length > 0 && !filterVolumesKg.includes(p.volume ?? '')) return false;
      if (inStockOnly) {
        const s = p.stock;
        const available = s?.stock_status === 'in_stock' || (s?.stock_qty ?? 0) >= 1;
        if (!available) return false;
      }
      if (saleOnly) {
        const pu = p.stock?.price_unit ?? 0;
        const po = p.stock?.price_old  ?? null;
        const hasPromo = p.stock?.price_promo != null;
        if (!hasPromo && !(po != null && pu > 0 && pu < po)) return false;
      }
      for (const [label, selectedVals] of Object.entries(filterValues)) {
        if (!selectedVals || selectedVals.length === 0) continue;
        const fvs = new Set(selectedVals.map(v => v.toLowerCase()));
        if (label === 'Бренд')      { if (!fvs.has(p.brand.trim().toLowerCase())) return false; }
        else if (label === 'Тип')   { if (!fvs.has((p.product_type ?? '').trim().toLowerCase())) return false; }
        else if (label === 'Колір') { if (!fvs.has((p.color ?? p.characteristics.find(c => /^колір/i.test(c.label))?.value ?? '').toLowerCase())) return false; }
        else { if (!p.characteristics.some(c => c.label === label && c.value.split(/,\s+/).map(t => t.trim().toLowerCase()).some(tok => fvs.has(tok)))) return false; }
      }
      return true;
    });
  }, [products, search, matchingSlugs, filterValues, filterVolumes, filterVolumesKg, inStockOnly, saleOnly]);

  useLayoutEffect(() => {
    window.scrollTo({ top: 0 });
  }, [filtered]);

  const exportToExcel = useCallback(async () => {
    const XLSX = await import('xlsx');
    const rows = filtered.map(p => ({
      [t('Артикул', 'Артикул')]:         p.sku,
      [t('Назва', 'Название')]:          displayName(p),
      [t('Бренд', 'Бренд')]:             p.brand,
      [t('Обʼєм', 'Объём')]:             p.volume ?? '',
      [t('Мін. замовлення', 'Мин. заказ')]: 1,
      [t('Ціна, грн', 'Цена, грн')]:     p.stock?.price_unit ?? '',
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [16, 50, 14, 10, 16, 12].map(w => ({ wch: w }));

    const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1');
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r: 0, c })];
      if (cell) cell.s = { font: { bold: true } };
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, t('Каталог', 'Каталог'));
    XLSX.writeFile(wb, `fixline-catalog-${new Date().toISOString().slice(0,10)}.xlsx`);
  }, [filtered, t]);

  useEffect(() => {
    if (!selCat) return;
    const catMap = new Map(categories.map(c => [c.slug, c]));
    setExpandedCats(prev => {
      const next = new Set(prev);
      let slug: string | null = selCat;
      while (slug) {
        const c = catMap.get(slug);
        if (c?.parent_slug) { next.add(c.parent_slug); slug = c.parent_slug; }
        else break;
      }
      if ((childrenOf[selCat] ?? []).length > 0) next.add(selCat);
      return next;
    });
    setFilterValues({}); setFilterVolumes([]); setFilterVolumesKg([]); setExpandedValues(new Set());
  }, [selCat, categories, childrenOf]);

  const loggedRef = useRef('');
  useEffect(() => {
    if (search.trim().length < 2) return;
    const timer = setTimeout(() => {
      if (search === loggedRef.current) return;
      loggedRef.current = search;
      fetch('/api/search-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: search, resultsCount: filtered.length }),
      });
    }, 800);
    return () => clearTimeout(timer);
  }, [search, filtered.length]);

  function getQty(sku: string, min: number) { return quantities[sku] ?? min; }
  function getInputVal(sku: string, min: number) { return inputVals[sku] ?? String(quantities[sku] ?? min); }
  function setQty(sku: string, min: number, val: number) {
    setQuantities(prev => ({ ...prev, [sku]: Math.max(min, val) }));
  }
  function commitInputVal(sku: string, min: number) {
    const v = parseInt(inputVals[sku] ?? '', 10);
    const valid = !isNaN(v) && v >= min ? v : min;
    setQuantities(prev => ({ ...prev, [sku]: valid }));
    setInputVals(prev => ({ ...prev, [sku]: String(valid) }));
  }
  function handleAddToCart(p: ProductFull, qty: number) {
    addItem({
      sku: p.sku, name: p.name, name_ru: (p as { name_ru?: string | null }).name_ru ?? null,
      brand: p.brand, volume: p.volume,
      price: p.stock?.price_unit ?? 0, min_order: 1,
      nl1: p.nl1 ?? '', nl2: p.nl2 ?? undefined,
      bc: p.bc, ac: p.ac, img_type: p.img_type, imageUrl: p.image ?? undefined,
    }, qty);
    setAdded(prev => ({ ...prev, [p.sku]: true }));
    setTimeout(() => setAdded(prev => ({ ...prev, [p.sku]: false })), 1500);
  }

  const catalogTitle = t('Оптовий каталог', 'Оптовый каталог');
  const homeHref     = lang === 'ru' ? '/ru' : '/';
  const displayName  = (p: ProductFull) =>
    lang === 'ru' ? ((p as { name_ru?: string | null }).name_ru ?? p.name) : p.name;

  return (
    <>
      <div className="page-container">
        <nav aria-label="Breadcrumb" style={{ padding: '12px 0 0', fontSize: '12px', color: '#94A3B8', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          <Link href={homeHref} style={{ color: '#94A3B8', textDecoration: 'none' }}>{t('Головна', 'Главная')}</Link>
          <span>/</span>
          {selCat ? (
            <button onClick={() => selectCat(null as unknown as string)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', fontSize: '13px', padding: 0 }}>
              {catalogTitle}
            </button>
          ) : (
            <span style={{ color: '#475569' }}>{catalogTitle}</span>
          )}
          {selCat && (() => {
            const cat = categories.find(c => c.slug === selCat);
            if (!cat) return null;
            const parent = cat.parent_slug ? categories.find(c => c.slug === cat.parent_slug) : null;
            return (
              <>
                {parent && (
                  <>
                    <span>/</span>
                    <button onClick={() => selectCat(parent.slug)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', fontSize: '13px', padding: 0 }}>
                      {cName(parent.name, parent.slug)}
                    </button>
                  </>
                )}
                <span>/</span>
                <span style={{ color: '#475569' }}>{cName(cat.name, cat.slug)}</span>
              </>
            );
          })()}
        </nav>


        <div className="catalog-page">

          {/* Sidebar */}
          <aside className={`sidebar${mobilePanel ? ' mobile-open' : ''}${mobilePanel === 'cats' ? ' mobile-cats' : ''}${mobilePanel === 'filters' ? ' mobile-filters' : ''}`} ref={sidebarRef}>

            {/* Categories */}
            <div className="sidebar-section sidebar-cats-section">
              <div className="sidebar-heading">{t('Категорії', 'Категории')}</div>
              <div
                ref={catsListRef}
                className="cat-list"
              >
                <div
                  className={'cat-item' + (!selCat ? ' active' : '')}
                  onClick={() => selectCat('')}
                >
                  <span className="cat-item-label">{t('Всі категорії', 'Все категории')}</span>
                </div>
                {parentCats.map(cat => {
                  const children = childrenOf[cat.slug] ?? [];
                  const isExpanded = expandedCats.has(cat.slug);
                  const isDirectActive = selCat === cat.slug;
                  const isParentActive = !isDirectActive && (
                    children.some(c => c.slug === selCat) ||
                    children.some(c => (childrenOf[c.slug] ?? []).some(gc => gc.slug === selCat))
                  );
                  return (
                    <div key={cat.slug} ref={el => { catRefs.current[cat.slug] = el; }}>
                      <div
                        className={'cat-item' + (isDirectActive ? ' active' : isParentActive ? ' parent-active' : '')}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                        onClick={() => {
                          const expanding = !expandedCats.has(cat.slug);
                          if (children.length > 0) {
                            setExpandedCats(prev => { const next = new Set(prev); next.has(cat.slug) ? next.delete(cat.slug) : next.add(cat.slug); return next; });
                            if (expanding) {
                              setSelCat(cat.slug);
                              router.replace(`?category=${cat.slug}`, { scroll: false } as never);
                              setVisibleCount(50);
                              setTimeout(() => scrollCatToTop(cat.slug), 450);
                            }
                          } else {
                            selectCat(selCat === cat.slug ? '' : cat.slug);
                          }
                        }}
                      >
                        {(() => { const Icon = CATEGORY_ICONS[cat.slug]; return Icon ? <Icon size={14} strokeWidth={1.8} style={{ flexShrink: 0, opacity: 0.65 }} /> : null; })()}
                        <span className="cat-item-label" style={{ flex: 1, textAlign: 'left' }}>{cName(cat.name, cat.slug)}</span>
                        {children.length > 0 && (
                          isExpanded
                            ? <ChevronDown size={13} style={{ flexShrink: 0, opacity: 0.45 }} />
                            : <ChevronRight size={13} style={{ flexShrink: 0, opacity: 0.45 }} />
                        )}
                      </div>
                      <div style={{
                        overflow: 'hidden',
                        maxHeight: isExpanded ? '2000px' : '0',
                        transition: 'max-height 0.45s cubic-bezier(0.4, 0, 0.2, 1)',
                        marginLeft: '8px',
                        borderLeft: '2px solid var(--border)',
                      }}>
                        {children.map(child => {
                          const grandchildren = childrenOf[child.slug] ?? [];
                          const isChildExpanded = expandedCats.has(child.slug);
                          const isChildActive = selCat === child.slug;
                          const isChildParentActive = !isChildActive && grandchildren.some(gc => gc.slug === selCat);
                          return (
                            <div key={child.slug} ref={el => { catRefs.current[child.slug] = el; }}>
                              <div
                                className={'cat-item' + (isChildActive ? ' active' : isChildParentActive ? ' parent-active' : '')}
                                style={{ paddingLeft: '10px', fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                                onClick={() => {
                                  if (grandchildren.length > 0) {
                                    const expanding = !expandedCats.has(child.slug);
                                    setExpandedCats(prev => { const next = new Set(prev); next.has(child.slug) ? next.delete(child.slug) : next.add(child.slug); return next; });
                                    if (expanding) selectCat(child.slug, cat.slug);
                                  } else {
                                    selectCat(selCat === child.slug ? '' : child.slug, cat.slug);
                                  }
                                }}
                              >
                                <span className="cat-item-label" style={{ flex: 1 }}>{cName(child.name, child.slug)}</span>
                                {grandchildren.length > 0 && (
                                  isChildExpanded
                                    ? <ChevronDown size={12} style={{ flexShrink: 0, opacity: 0.45 }} />
                                    : <ChevronRight size={12} style={{ flexShrink: 0, opacity: 0.45 }} />
                                )}
                              </div>
                              {grandchildren.length > 0 && (
                                <div style={{
                                  overflow: 'hidden',
                                  maxHeight: isChildExpanded ? '800px' : '0',
                                  transition: 'max-height 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
                                }}>
                                  {grandchildren.map(gc => (
                                    <div
                                      key={gc.slug}
                                      ref={el => { catRefs.current[gc.slug] = el; }}
                                      className={'cat-item' + (selCat === gc.slug ? ' active' : '')}
                                      style={{ paddingLeft: '26px', fontSize: '12px' }}
                                      onClick={() => selectCat(selCat === gc.slug ? '' : gc.slug, child.slug)}
                                    >
                                      <span className="cat-item-label">{cName(gc.name, gc.slug)}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="sidebar-filters-section">
            {/* Filters */}
            <div ref={filtersRef} className="sidebar-section">
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
                  labelNode: React.ReactNode,
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
                    <div key={key} className="filter-group">
                      <button
                        className={'filter-label-btn' + (selectedVals.length > 0 ? ' has-active' : '')}
                        onClick={() => toggleCollapse(key)}
                      >
                        <span>{labelNode}</span>
                        {selectedVals.length > 0 && <span className="filter-active-badge">{selectedVals.length}</span>}
                        <ChevronDown size={11} style={{ transform: isCollapsed ? 'rotate(-90deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0 }} />
                      </button>
                      {!isCollapsed && (
                        <div className="filter-checkboxes">
                          {visible.map(v => {
                            const vkey = v.toLowerCase();
                            const checked = selectedSet.has(vkey);
                            return (
                              <label key={v} className={'filter-check-item' + (checked ? ' checked' : '')} onMouseDown={e => e.preventDefault()}>
                                <input type="checkbox" checked={checked} onChange={() => onToggle(v)} />
                                <span className="filter-check-text">{formatVal ? formatVal(v) : v}</span>
                                {counts && <span className="filter-count">{counts.get(vkey) ?? 0}</span>}
                              </label>
                            );
                          })}
                          {items.length > SHOW_LIMIT && (
                            <button className="filter-show-more" onClick={() => toggleExpand(key)}>
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
                const charToggler = (label: string) => (v: string) => setFilterValues(prev => {
                  const cur = prev[label] ?? [];
                  const key = v.toLowerCase();
                  const next = cur.map(s => s.toLowerCase()).includes(key)
                    ? cur.filter(s => s.toLowerCase() !== key)
                    : [...cur, v];
                  return { ...prev, [label]: next };
                });

                const allKeys = [
                  ...(volumesL.length > 1 ? ['__vol'] : []),
                  ...(volumesKg.length > 1 ? ['__wt'] : []),
                  ...allFilters.map(f => f.label),
                ];
                const allCollapsed = allKeys.length > 0 && allKeys.every(k => collapsedFilters.has(k));
                const resetAll = () => {
                  setFilterValues({}); setFilterVolumes([]); setFilterVolumesKg([]);
                  setInStockOnly(false); setSaleOnly(false); setExpandedValues(new Set());
                };

                return (
                  <>
                    <div className="filter-controls">
                      <button
                        className="filter-ctrl-btn"
                        onClick={() => setCollapsedFilters(allCollapsed ? new Set() : new Set(allKeys))}
                      >
                        {allCollapsed ? t('Розгорнути все', 'Развернуть все') : t('Згорнути все', 'Свернуть все')}
                      </button>
                      {activeFilterCount > 0 && (
                        <button className="filter-ctrl-btn reset" onClick={resetAll}>
                          {t('Скинути все', 'Сбросить все')}
                        </button>
                      )}
                    </div>
                    {volumesL.length > 1 && renderGroup('__vol', t('Обʼєм', 'Объём'), volumesL, null, filterVolumes, toggler(filterVolumes, setFilterVolumes))}
                    {volumesKg.length > 1 && renderGroup('__wt', t('Вага', 'Вес'), volumesKg, null, filterVolumesKg, toggler(filterVolumesKg, setFilterVolumesKg))}
                    {allFilters.map(({ label, values, counts }) =>
                      renderGroup(label, tFilterLabel(label, lang), values, counts, filterValues[label] ?? [], charToggler(label), v => tFilterValue(v, lang))
                    )}
                  </>
                );
              })()}
              <label className="filter-check" onMouseDown={e => e.preventDefault()}>
                <input type="checkbox" checked={inStockOnly} onChange={e => setInStockOnly(e.target.checked)} />
                {t('Тільки в наявності', 'Только в наличии')}
              </label>
              <label className="filter-check" onMouseDown={e => e.preventDefault()}>
                <input type="checkbox" checked={saleOnly} onChange={e => setSaleOnly(e.target.checked)} />
                {t('Тільки акційні', 'Только акционные')}
              </label>
            </div>
            </div>{/* end sidebar-filters-section */}



          </aside>

          {/* Main */}
          <div className="catalog-main">

            {/* Title row */}
            <div className="catalog-title-row">
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
                <h1 className="catalog-title">
                  {selCat ? (cName(categories.find(c => c.slug === selCat)?.name ?? catalogTitle, selCat)) : catalogTitle}
                </h1>
                <p className="catalog-count">{filtered.length} {t('товарів', 'товаров')}</p>
              </div>
              {isWholesale && (
                <a ref={badgeRef} href={lang === 'ru' ? '/ru/cart' : '/cart'} className={`wholesale-min-badge${cartMet ? ' wholesale-min-met' : ''}`}>
                  <div className="wholesale-min-row">
                    <span>{t('Мінімальне замовлення', 'Минимальный заказ')} — <strong>{WHOLESALE_MIN.toLocaleString('uk-UA')} ₴</strong></span>
                    {cartTotal > 0 && (
                      <span className="wholesale-min-status">
                        {cartMet
                          ? t('виконано ✓', 'выполнено ✓')
                          : <>{t('У кошику:', 'В корзине:')} <strong>{cartTotal.toLocaleString('uk-UA')} ₴</strong>&nbsp;·&nbsp;{t('ще', 'ещё')} <strong>{cartRemaining.toLocaleString('uk-UA')} ₴</strong></>
                        }
                      </span>
                    )}
                  </div>
                  <div className="wholesale-min-track">
                    <div className="wholesale-min-fill" style={{ width: `${cartPct}%` }} />
                  </div>
                </a>
              )}
              <div className="catalog-actions">
                {/* Mobile only: two panel buttons */}
                <button
                  className={'catalog-mobile-btn' + (mobilePanel === 'cats' ? ' active' : '')}
                  onClick={() => setMobilePanel(v => v === 'cats' ? null : 'cats')}
                >
                  <LayoutList size={14} strokeWidth={2} />
                  {t('Категорії', 'Категории')}
                </button>
                {(() => {
                  const count = Object.values(filterValues).filter(a => a.length > 0).length +
                    (filterVolumes.length > 0 ? 1 : 0) + (filterVolumesKg.length > 0 ? 1 : 0) + (inStockOnly ? 1 : 0);
                  return (
                    <button
                      className={'catalog-mobile-btn' + (mobilePanel === 'filters' ? ' active' : '')}
                      onClick={() => setMobilePanel(v => v === 'filters' ? null : 'filters')}
                    >
                      <SlidersHorizontal size={14} strokeWidth={2} />
                      {t('Фільтри', 'Фильтры')}
                      {count > 0 && <span className="catalog-mobile-badge">{count}</span>}
                    </button>
                  );
                })()}
                {/* Desktop only */}
                <button
                  className="catalog-desktop-btn"
                  onClick={() => setSaleOnly(v => !v)}
                  style={{
                    height: '34px', padding: '0 14px', borderRadius: '8px', border: '1px solid var(--border)',
                    background: saleOnly ? '#EF4444' : 'var(--bg-soft)',
                    color: saleOnly ? '#fff' : 'var(--text-secondary)',
                    fontSize: '13px', fontWeight: 700, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: '5px',
                  }}
                >
                  🔥 {t('Акції', 'Акции')}
                </button>
                <button className="catalog-desktop-btn action-btn excel" onClick={exportToExcel}>
                  <Upload size={14} strokeWidth={2} />
                  {t('Завантажити Excel', 'Скачать Excel')}
                </button>
                <div className="catalog-view-toggle">
                  <button
                    className={'catalog-view-btn' + (viewMode === 'table' ? ' active' : '')}
                    title={t('Таблиця', 'Таблица')}
                    onClick={() => changeViewMode('table')}
                  >
                    <Table2 size={15} strokeWidth={2} />
                  </button>
                  <button
                    className={'catalog-view-btn' + (viewMode === 'grid' ? ' active' : '')}
                    title={t('Карточки', 'Карточки')}
                    onClick={() => changeViewMode('grid')}
                  >
                    <LayoutGrid size={15} strokeWidth={2} />
                  </button>
                </div>
              </div>
            </div>

            {/* Sticky search + category pills */}
            <div className={'catalog-sticky-bar' + (stickyCompact ? ' is-compact' : '')}>
              <SearchAutocomplete
                value={search}
                onChange={setSearch}
                placeholder={t('Пошук за назвою, артикулом, брендом...', 'Поиск по названию, артикулу, бренду...')}
                wrapperClassName="search-bar"
                iconClassName="search-icon"
              />
              <div className="catalog-cats-pills" ref={pillsRef}>
                <button
                  className={'catalog-cat-pill' + (!selCat ? ' active' : '')}
                  onClick={() => { setSelCat(''); router.replace('?', { scroll: false } as never); setVisibleCount(50); }}
                >
                  {t('Всі категорії', 'Все категории')}
                </button>
                {parentCats.map(cat => {
                  const isActive = selCat === cat.slug || (childrenOf[cat.slug] ?? []).some(c => c.slug === selCat);
                  return (
                    <button
                      key={cat.slug}
                      className={'catalog-cat-pill' + (isActive ? ' active' : '')}
                      onClick={() => {
                        const next = isActive ? '' : cat.slug;
                        setSelCat(next);
                        router.replace(next ? `?category=${next}` : '?', { scroll: false } as never);
                        setExpandedCats(new Set(next ? [next] : []));
                        setVisibleCount(50);
                        if (next) setTimeout(() => scrollCatToTop(next), 500);
                      }}
                    >
                      {cName(cat.name, cat.slug)}
                    </button>
                  );
                })}
              </div>
            </div>

            {activeChips.length > 0 && (
              <div className="catalog-active-filters">
                {activeChips.map(chip => (
                  <button key={chip.id} className="catalog-filter-chip" onClick={chip.onRemove}>
                    {chip.text}
                    <X size={12} strokeWidth={2.5} />
                  </button>
                ))}
                <button className="catalog-filter-chip catalog-filter-chip--clear" onClick={clearAllFilters}>
                  {t('Очистити всі', 'Очистить все')}
                </button>
              </div>
            )}

            <SalesBanner mode="catalog" activeSlugs={matchingSlugs} />

            {/* Grid view */}
            {effectiveViewMode === 'grid' && (
              filtered.length === 0 ? (
                <div className="product-table-wrap"><div className="empty-state"><h3>{t('Нічого не знайдено', 'Ничего не найдено')}</h3><p>{t('Спробуйте змінити фільтри або пошуковий запит', 'Попробуйте изменить фильтры или поисковый запрос')}</p></div></div>
              ) : (
                <>
                  <div className="catalog-grid">
                    {filtered.slice(0, visibleCount).map(p => {
                      const priceUnit    = p.stock?.price_unit  ?? 0;
                      const pricePromo   = p.stock?.price_promo != null ? Number(p.stock.price_promo) : null;
                      const hasPromoDisc = pricePromo != null && pricePromo < priceUnit;
                      const displayPrice = hasPromoDisc ? pricePromo : priceUnit;
                      const priceOld     = hasPromoDisc ? priceUnit : (p.stock?.price_old ?? null);
                      const stockQty     = p.stock?.stock_qty  ?? 0;
                      const inStock      = p.stock?.stock_status === 'in_stock' || stockQty >= 1;
                      const isSale       = priceOld != null && displayPrice > 0 && displayPrice < priceOld;
                      const qty          = getQty(p.sku, 1);
                      return (
                        <div key={p.sku} className="catalog-card">
                          <Link href={`${lang === 'ru' ? '/ru' : ''}/product/${p.sku}`} className="catalog-card__img-wrap">
                            <div className="catalog-card__badge-stack">
                              {isSale && <span className="catalog-card__badge">{t('АКЦІЯ', 'АКЦИЯ')}</span>}
                              {p.is_hit && <span className="catalog-card__badge catalog-card__badge--hit">{t('ХІТ', 'ХИТ')}</span>}
                              {p.is_new && <span className="catalog-card__badge catalog-card__badge--new">{t('НОВИНКА', 'НОВИНКА')}</span>}
                            </div>
                            <ProductImage
                              brand={p.brand} nl1={p.nl1 ?? ''} nl2={p.nl2 ?? undefined}
                              volume={p.volume ?? ''} bc={p.bc} ac={p.ac} type={p.img_type}
                              imageUrl={p.image ?? undefined}
                            />
                          </Link>
                          <div className="catalog-card__body">
                            <Link href={`${lang === 'ru' ? '/ru' : ''}/product/${p.sku}`} className="catalog-card__name">{displayName(p)}</Link>
                            <div className="catalog-card__meta">
                              {/* This group truncates as a unit (color badge is the flexible/ellipsis one) so
                                  the rating badge stays fully visible at the right edge instead of wrapping
                                  or getting squeezed by a long color name. */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flex: 1, minWidth: 0, overflow: 'hidden' }}>
                                <span>{p.brand}</span>
                                {p.volume && <span className="catalog-card__vol">{p.volume}</span>}
                                {(() => { const c = p.color ?? p.characteristics?.find(ch => /^Колір/i.test(ch.label))?.value ?? null; return c ? <span className="catalog-card__vol catalog-card__vol--color">{tFilterValue(c, lang)}</span> : null; })()}
                              </div>
                              {reviewStats?.[p.sku] && (
                                <span style={{ flexShrink: 0 }}>
                                  <RatingBadge avg={reviewStats[p.sku].avg} count={reviewStats[p.sku].count} size={11} />
                                </span>
                              )}
                            </div>
                            <div className="catalog-card__bottom">
                            <div className="catalog-card__bottom-left">
                              <span className={'catalog-card__stock' + (inStock ? '' : ' out')}>
                                <span className="catalog-card__dot" />
                                {inStock ? t('В наявності', 'В наличии') : t('Немає', 'Нет')}
                              </span>
                              {priceUnit > 0 ? (
                                <div className="catalog-card__price">
                                  {isSale && <span className="catalog-card__price-old">{Number(priceOld).toFixed(2)} грн</span>}
                                  <span>{displayPrice.toFixed(2)} <em>грн</em></span>
                                </div>
                              ) : (
                                <div className="catalog-card__price-na">{t('За запитом', 'По запросу')}</div>
                              )}
                            </div>
                            <div className="catalog-card__actions">
                              <input
                                className="qty-input"
                                type="number" min={1}
                                value={getInputVal(p.sku, 1)}
                                onChange={e => setInputVals(prev => ({ ...prev, [p.sku]: e.target.value }))}
                                onBlur={() => commitInputVal(p.sku, 1)}
                                onClick={e => e.preventDefault()}
                              />
                              <button
                                className={'action-icon-btn primary' + (added[p.sku] ? ' added' : '')}
                                disabled={!inStock}
                                onClick={e => { e.preventDefault(); handleAddToCart(p, qty); }}
                                style={!inStock ? { opacity: 0.4 } : undefined}
                              >
                                {added[p.sku] ? <Check size={14} strokeWidth={2.5} /> : <Plus size={14} strokeWidth={2.5} />}
                              </button>
                              <button
                                className="action-icon-btn"
                                onClick={() => toggle(p.sku)}
                                style={{ color: isLiked(p.sku) ? '#EF4444' : undefined, background: isLiked(p.sku) ? '#FEF2F2' : undefined, borderColor: isLiked(p.sku) ? '#FECACA' : undefined }}
                              >
                                <Heart size={13} strokeWidth={2} fill={isLiked(p.sku) ? '#EF4444' : 'none'} />
                              </button>
                            </div>
                          </div>
                          <div className="catalog-card__pack-row">
                            <span>{t('уп.', 'уп.')} {p.pack_qty} {t('шт', 'шт')}</span>
                            <CopySkuBtn sku={p.sku} lang={lang} />
                          </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {filtered.length > visibleCount && (
                    <div style={{ textAlign: 'center', padding: '32px 0' }}>
                      <button onClick={() => setVisibleCount(v => v + 50)} style={{ height: '48px', padding: '0 32px', borderRadius: '12px', background: '#1E3A5F', color: '#fff', border: 'none', fontSize: '14px', fontWeight: 700, cursor: 'pointer' }}>
                        {t('Показати більше', 'Показать ещё')} ({filtered.length - visibleCount} {t('залишилось', 'осталось')})
                      </button>
                    </div>
                  )}
                </>
              )
            )}

            {/* Table */}
            {effectiveViewMode === 'table' && (filtered.length === 0 ? (
              <div className="product-table-wrap">
                <div className="empty-state">
                  <h3>{t('Нічого не знайдено', 'Ничего не найдено')}</h3>
                  <p>{t('Спробуйте змінити фільтри або пошуковий запит', 'Попробуйте изменить фильтры или поисковый запрос')}</p>
                </div>
              </div>
            ) : (
              <div className="product-table-wrap">
                <table className="product-table">
                  <colgroup>
                    <col style={{ width: '100px' }} />
                    <col />
                    <col style={{ width: '72px' }} />
                    <col style={{ width: '120px' }} />
                    <col style={{ width: '110px' }} />
                    <col style={{ width: '115px' }} />
                    <col style={{ width: '80px' }} />
                    <col style={{ width: '136px' }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>{t('Фото', 'Фото')}</th>
                      <th>{t('Назва продукту', 'Название продукта')}</th>
                      <th>{t('Обʼєм', 'Объём')}</th>
                      <th>{t('Наявність', 'Наличие')}</th>
                      <th>{t('Ціна', 'Цена')}</th>
                      <th>{t('Уп-ка', 'Уп-ка')}</th>
                      <th>{t('К-ть', 'К-во')}</th>
                      <th>{t('Дії', 'Действия')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.slice(0, visibleCount).map(p => {
                      const priceUnit    = p.stock?.price_unit  ?? 0;
                      const pricePromo   = p.stock?.price_promo != null ? Number(p.stock.price_promo) : null;
                      const hasPromoDisc = pricePromo != null && pricePromo < priceUnit;
                      const displayPrice = hasPromoDisc ? pricePromo : priceUnit;
                      const priceOld     = hasPromoDisc ? priceUnit : (p.stock?.price_old ?? null);
                      const stockQty     = p.stock?.stock_qty    ?? 0;
                      const stockSt      = p.stock?.stock_status;
                      const inStock      = stockSt === 'in_stock' || stockQty >= 1;
                      const isSale       = priceOld != null && displayPrice > 0 && displayPrice < priceOld;
                      const qty          = getQty(p.sku, 1);
                      const packStr   = `${p.pack_qty} ${t('шт', 'шт')}`;

                      return (
                        <tr key={p.sku} style={{ position: 'relative' }}>
                          <td>
                            <Link href={`${lang === 'ru' ? '/ru' : ''}/product/${p.sku}`} className="tr-link" aria-label={displayName(p)} />
                            <div className="cell-photo">
                              <ProductImage
                                brand={p.brand} nl1={p.nl1 ?? ''} nl2={p.nl2 ?? undefined}
                                volume={p.volume ?? ''} bc={p.bc} ac={p.ac} type={p.img_type}
                                imageUrl={p.image ?? undefined}
                              />
                            </div>
                          </td>
                          <td>
                            <div className="cell-meta">{p.brand} · {p.sku}</div>
                            <div className="cell-name">
                              {displayName(p)}
                              {isSale && <span className="badge-sale">{t('АКЦІЯ', 'АКЦИЯ')}</span>}
                            </div>
                            {(() => {
                              const colorVal = p.color ?? p.characteristics.find(c => /^Колір/i.test(c.label))?.value ?? null;
                              return (p.product_type || colorVal) ? (
                                <div className="cell-chars">
                                  {p.product_type && <span className="cell-char">{tFilterValue(p.product_type, lang)}</span>}
                                  {colorVal       && <span className="cell-char">{t('Колір', 'Цвет')}: {tFilterValue(colorVal, lang)}</span>}
                                </div>
                              ) : null;
                            })()}
                          </td>
                          <td><span className="cell-text">{p.volume ?? '—'}</span></td>
                          <td>
                            <span className={'stock-badge ' + (inStock ? 'in' : 'out')}>
                              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor', flexShrink: 0 }} />
                              {inStock ? t('в наявності', 'в наличии') : t('Немає', 'Нет')}
                            </span>
                          </td>
                          <td>
                            {priceUnit > 0 ? (
                              <div>
                                {isSale && <div className="price-old">{Number(priceOld).toFixed(2)} грн</div>}
                                <div className={isSale ? 'price-new' : 'price-only'}>{displayPrice.toFixed(2)} грн</div>
                              </div>
                            ) : (
                              <span style={{ fontSize: 13, color: '#94A3B8' }}>{t('За запитом', 'По запросу')}</span>
                            )}
                          </td>
                          <td><span className="min-qty">{packStr}</span></td>
                          <td style={{ position: 'relative', zIndex: 1 }}>
                            <input
                              className="qty-input"
                              type="number"
                              value={getInputVal(p.sku, 1)}
                              min={1}
                              placeholder={t('Мін.', 'Мин.')}
                              onChange={e => setInputVals(prev => ({ ...prev, [p.sku]: e.target.value }))}
                              onBlur={() => commitInputVal(p.sku, 1)}
                            />
                          </td>
                          <td style={{ position: 'relative', zIndex: 1, paddingLeft: '10px', paddingRight: '14px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px' }}>
                            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                              <button
                                className={'action-icon-btn primary' + (added[p.sku] ? ' added' : '')}
                                title={inStock ? t('В кошик', 'В корзину') : t('Немає в наявності', 'Нет в наличии')}
                                disabled={!inStock}
                                onClick={e => { e.preventDefault(); e.stopPropagation(); handleAddToCart(p, qty); }}
                                style={!inStock ? { opacity: 0.4, cursor: 'default' } : undefined}
                              >
                                {added[p.sku] ? <Check size={14} strokeWidth={2.5} /> : <Plus size={14} strokeWidth={2.5} />}
                              </button>
                              <button
                                className="action-icon-btn"
                                title={t('Обране', 'Избранное')}
                                onClick={() => toggle(p.sku)}
                                style={{
                                  color: isLiked(p.sku) ? '#EF4444' : undefined,
                                  background: isLiked(p.sku) ? '#FEF2F2' : undefined,
                                  borderColor: isLiked(p.sku) ? '#FECACA' : undefined,
                                }}
                              >
                                <Heart size={13} strokeWidth={2} fill={isLiked(p.sku) ? '#EF4444' : 'none'} />
                              </button>
                              <Link href={`${lang === 'ru' ? '/ru' : ''}/product/${p.sku}`} className="action-icon-btn" title={t('Переглянути', 'Просмотреть')} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Eye size={13} strokeWidth={2} />
                              </Link>
                            </div>
                            {inCartSkus.has(p.sku) && (() => {
                              const cartQty = cartItems.find(i => i.sku === p.sku)?.qty ?? 0;
                              return (
                                <span style={{ fontSize: '11px', fontWeight: 600, color: '#16A34A', whiteSpace: 'nowrap' }}>
                                  {t('додано', 'добавлено')} {cartQty} {t('шт', 'шт')}
                                </span>
                              );
                            })()}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ))}

            {effectiveViewMode === 'table' && filtered.length > visibleCount && (
              <div style={{ textAlign: 'center', padding: '32px 0' }}>
                <button
                  onClick={() => setVisibleCount(v => v + 50)}
                  style={{
                    height: '48px', padding: '0 32px', borderRadius: '12px',
                    background: '#1E3A5F', color: '#fff', border: 'none',
                    fontSize: '14px', fontWeight: 700, cursor: 'pointer',
                  }}
                >
                  {t('Показати більше', 'Показать ещё')} ({filtered.length - visibleCount} {t('залишилось', 'осталось')})
                </button>
              </div>
            )}

          </div>
        </div>
      </div>

      {(() => {
        const meta = selCat ? getCategoryMeta(selCat) : null;
        const catNameStr = selCat ? cName(categories.find(c => c.slug === selCat)?.name ?? '', selCat) : null;
        if (!meta || !catNameStr) return null;
        return (
          <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '0 20px 32px' }}>
            <div style={{ padding: '16px 20px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-card)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '8px' }}>
                <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', margin: 0 }}>
                  {t('Про категорію', 'О категории')} «{catNameStr}»
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
                    {t('Часті запитання', 'Часто задаваемые вопросы')}
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
      {isWholesale && !badgeVisible && (
        <a href={lang === 'ru' ? '/ru/cart' : '/cart'} className={`wholesale-float-bar${pillEntered ? ' entered' : ''}${cartFlash ? ' flash' : ''}`}>
          <span className="wholesale-float-label">{t('мін. замовлення', 'мин. заказ')}</span>
          <div className="wholesale-float-track">
            <div className="wholesale-float-fill" style={{
              width: `${cartPct}%`,
              backgroundColor: `hsl(${Math.round(cartPct * 1.2)}, 72%, 44%)`,
            }} />
          </div>
          <span className="wholesale-float-amount">
            {cartMet
              ? <span style={{ color: '#16A34A', fontWeight: 600 }}>✓</span>
              : <>{cartTotal.toLocaleString('uk-UA')} / <strong>{WHOLESALE_MIN.toLocaleString('uk-UA')} ₴</strong></>
            }
          </span>
        </a>
      )}
      <ScrollToTop />
    </>
  );
}

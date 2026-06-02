'use client';

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Upload, Heart, Eye, Plus, Check, ChevronDown, ChevronUp, LayoutList, SlidersHorizontal, LayoutGrid, Table2 } from 'lucide-react';
import SearchAutocomplete from '../components/SearchAutocomplete';
import Link from 'next/link';
import ProductImage from '../components/ProductImage';
import ScrollToTop from '../components/ScrollToTop';
import { PROMO } from '../promo.config';
import type { ProductFull, Category } from '../../lib/supabase';
import { useCart } from '../../lib/cart';
import { useWishlist } from '../../lib/wishlist';
import { getSupabaseBrowser } from '../../lib/supabase-browser';

const WHOLESALE_MIN = 3000;
import { getCategoryMeta } from '../../lib/category-descriptions';
import './catalog.css';

type Props = { products: ProductFull[]; categories: Category[]; initialSearch?: string; initialCategory?: string; initialSaleOnly?: boolean };

export default function CatalogClient({ products, categories, initialSearch = '', initialCategory = '', initialSaleOnly = false }: Props) {
  const [isWholesale, setIsWholesale] = useState(false);
  const [search,        setSearch]        = useState(initialSearch);
  const [selCat,        setSelCat]        = useState(initialCategory);
  const router = useRouter();
  const catsListRef = useRef<HTMLDivElement>(null);
  const catRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const sidebarRef = useRef<HTMLElement>(null);
  const prevSelCat = useRef(initialCategory);
  const pillsRef    = useRef<HTMLDivElement>(null);
  const filtersRef  = useRef<HTMLDivElement>(null);
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
      const catsList = catsListRef.current;
      e.preventDefault();
      if (catsList) {
        const catsRect = catsList.getBoundingClientRect();
        if (e.clientX >= catsRect.left && e.clientX <= catsRect.right &&
            e.clientY >= catsRect.top  && e.clientY <= catsRect.bottom) {
          if (catsList.scrollHeight > catsList.clientHeight) {
            const atTop = catsList.scrollTop <= 0;
            if (e.deltaY < 0 && atTop) { sidebar.scrollTop += e.deltaY; return; }
            catsList.scrollTop += e.deltaY;
            return;
          }
        }
      }
      sidebar.scrollTop += e.deltaY;
    };
    // Listener тільки на сайдбар — товари скролять без затримки
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

  // Scroll page + sidebar to top on any category change (including parent expand)
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
    // Скролимо кат-ліст щоб категорія була видима зверху — сайдбар не чіпаємо
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
  const [filterValues,   setFilterValues]   = useState<Record<string, string>>({});
  const [filterVolume,   setFilterVolume]   = useState('');
  const [filterVolumeKg, setFilterVolumeKg] = useState('');
  const [inStockOnly,   setInStockOnly]   = useState(false);
  const [saleOnly,      setSaleOnly]      = useState(initialSaleOnly);
  const [visibleCount,  setVisibleCount]  = useState(50);
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
  const [expandedCats, setExpandedCats]  = useState<Set<string>>(() => {
    if (!initialCategory) return new Set<string>();
    const expanded = new Set<string>();
    const catMap = new Map(categories.map(c => [c.slug, c]));
    let slug: string | null = initialCategory;
    while (slug) {
      const cat = catMap.get(slug);
      if (cat?.parent_slug) { expanded.add(cat.parent_slug); slug = cat.parent_slug; }
      else break;
    }
    return expanded;
  });
  const [catsOpen,      setCatsOpen]      = useState(false);
  const catsOpenRef = useRef(false);
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
    Object.values(filterValues).filter(Boolean).length +
    (filterVolume ? 1 : 0) + (filterVolumeKg ? 1 : 0) +
    (inStockOnly ? 1 : 0) + (saleOnly ? 1 : 0);

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
      const t = setTimeout(() => setPillEntered(true), 20);
      return () => clearTimeout(t);
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
      'назва продукту', 'марка', 'розмір упаковки', 'розфасування',
      'мінімальна температура застосування', 'максимальна температура застосування',
      'мінімальна температура експлуатації', 'максимальна температура експлуатації',
      'мінімальна температура зберігання',   'максимальна температура зберігання',
      'час висихання поверхні', 'час висихання', 'час повного затвердіння',
      'час початкового схоплення', 'час поверхневого висихання',
      'термін зберігання', 'витрата матеріалу', 'витрата', 'витрата фарби', 'витрата ґрунтовки',
      'первинне розширення', 'вторинне розширення', 'вихід піни',
      'міцність клейового з\'єднання',
    ]);
    const map = new Map<string, Map<string, string>>();
    const add = (label: string, val: string | null | undefined) => {
      const v = val?.trim();
      if (!v || v === 'Не вказано') return;
      if (!map.has(label)) map.set(label, new Map());
      const key = v.toLowerCase();
      const ex = map.get(label)!.get(key);
      if (!ex || (v[0] === v[0].toUpperCase() && ex[0] !== ex[0].toUpperCase())) map.get(label)!.set(key, v);
    };
    for (const p of catProducts) {
      add('Бренд', p.brand);
      add('Тип',   p.product_type);
      add('Колір', p.color ?? p.characteristics.find(c => /^колір/i.test(c.label))?.value);
      for (const c of p.characteristics ?? []) {
        const label = c.label?.trim();
        if (!label || SKIP_LOWER.has(label.toLowerCase()) || label.toLowerCase().includes('колір')) continue;
        add(label, c.value);
      }
    }
    const PRIMARY = new Set(['Бренд', 'Тип', 'Колір']);
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
      }));
  }, [catProducts]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return products.filter(p => {
      if (q && !p.name.toLowerCase().includes(q) && !p.sku.toLowerCase().includes(q) && !p.brand.toLowerCase().includes(q)) return false;
      if (matchingSlugs && !matchingSlugs.has(p.category_slug ?? '')) return false;
      if (filterVolume   && p.volume !== filterVolume)   return false;
      if (filterVolumeKg && p.volume !== filterVolumeKg) return false;
      if (inStockOnly) {
        const s = p.stock;
        const available = s?.stock_status === 'in_stock' || (s?.stock_qty ?? 0) >= 1;
        if (!available) return false;
      }
      if (saleOnly) {
        const pu = p.stock?.price_unit ?? 0;
        const po = p.stock?.price_old  ?? null;
        if (!(po != null && pu > 0 && pu < po)) return false;
      }
      for (const [label, val] of Object.entries(filterValues)) {
        if (!val) continue;
        const fv = val.toLowerCase();
        if (label === 'Бренд')      { if (p.brand.trim().toLowerCase() !== fv) return false; }
        else if (label === 'Тип')   { if ((p.product_type ?? '').trim().toLowerCase() !== fv) return false; }
        else if (label === 'Колір') { if ((p.color ?? p.characteristics.find(c => /^колір/i.test(c.label))?.value ?? '').toLowerCase() !== fv) return false; }
        else { if (!p.characteristics.some(c => c.label === label && c.value.trim().toLowerCase() === fv)) return false; }
      }
      return true;
    });
  }, [products, search, matchingSlugs, filterValues, filterVolume, filterVolumeKg, inStockOnly, saleOnly]);

  const exportToExcel = useCallback(async () => {
    const XLSX = await import('xlsx');
    const rows = filtered.map(p => ({
      'Артикул':         p.sku,
      'Назва':           p.name,
      'Бренд':           p.brand,
      'Обʼєм':           p.volume ?? '',
      'Мін. замовлення': 1,
      'Ціна, грн':       p.stock?.price_unit ?? '',
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [16, 50, 14, 10, 16, 12].map(w => ({ wch: w }));

    // Bold header
    const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1');
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r: 0, c })];
      if (cell) cell.s = { font: { bold: true } };
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Каталог');
    XLSX.writeFile(wb, `fixline-catalog-${new Date().toISOString().slice(0,10)}.xlsx`);
  }, [filtered]);

  useEffect(() => {
    if (!selCat) return;
    const cat = categories.find(c => c.slug === selCat);
    if (cat?.parent_slug) {
      setExpandedCats(prev => new Set([...prev, cat.parent_slug!]));
    } else if ((childrenOf[selCat] ?? []).length > 0) {
      setExpandedCats(prev => new Set([...prev, selCat]));
    }
    setFilterValues({}); setFilterVolume(''); setFilterVolumeKg('');
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
      sku: p.sku, name: p.name, brand: p.brand, volume: p.volume,
      price: p.stock?.price_unit ?? 0, min_order: 1,
      nl1: p.nl1 ?? '', nl2: p.nl2 ?? undefined,
      bc: p.bc, ac: p.ac, img_type: p.img_type, imageUrl: p.image ?? undefined,
    }, qty);
    setAdded(prev => ({ ...prev, [p.sku]: true }));
    setTimeout(() => setAdded(prev => ({ ...prev, [p.sku]: false })), 1500);
  }

  return (
    <>
      <div className="page-container">
        <nav aria-label="Breadcrumb" style={{ padding: '12px 0 0', fontSize: '12px', color: '#94A3B8', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          <Link href="/" style={{ color: '#94A3B8', textDecoration: 'none' }}>Головна</Link>
          <span>/</span>
          {selCat ? (
            <button onClick={() => selectCat(null as unknown as string)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', fontSize: '13px', padding: 0 }}>
              Оптовий каталог
            </button>
          ) : (
            <span style={{ color: '#475569' }}>Оптовий каталог</span>
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
                      {parent.name}
                    </button>
                  </>
                )}
                <span>/</span>
                <span style={{ color: '#475569' }}>{cat.name}</span>
              </>
            );
          })()}
        </nav>


        <div className="catalog-page">

          {/* Sidebar */}
          <aside className={`sidebar${mobilePanel ? ' mobile-open' : ''}${mobilePanel === 'cats' ? ' mobile-cats' : ''}${mobilePanel === 'filters' ? ' mobile-filters' : ''}`} ref={sidebarRef}>

            {/* Categories */}
            <div className="sidebar-section sidebar-cats-section">
              <div className="sidebar-heading">Категорії</div>
              <div
                ref={catsListRef}
                className="cat-list"
                style={{
                  maxHeight: catsOpen ? 'calc(100vh - 220px)' : '370px',
                  overflowY: 'auto',
                  scrollbarWidth: 'none',
                }}
              >
                <div
                  className={'cat-item' + (!selCat ? ' active' : '')}
                  onClick={() => selectCat('')}
                >
                  Всі категорії
                </div>
                {parentCats.map(cat => {
                  const children = childrenOf[cat.slug] ?? [];
                  const isExpanded = expandedCats.has(cat.slug);
                  const isDirectActive = selCat === cat.slug;
                  const isParentActive = !isDirectActive && children.some(c => c.slug === selCat);
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
                        <span>{cat.name}</span>
                        {children.length > 0 && (
                          isExpanded
                            ? <ChevronUp size={13} style={{ flexShrink: 0, opacity: 0.5 }} />
                            : <ChevronDown size={13} style={{ flexShrink: 0, opacity: 0.5 }} />
                        )}
                      </div>
                      <div style={{
                        overflow: 'hidden',
                        maxHeight: isExpanded ? '2000px' : '0',
                        transition: 'max-height 0.45s cubic-bezier(0.4, 0, 0.2, 1)',
                      }}>
                        {children.map(child => (
                          <div
                            key={child.slug}
                            ref={el => { catRefs.current[child.slug] = el; }}
                            className={'cat-item' + (selCat === child.slug ? ' active' : '')}
                            style={{ paddingLeft: '20px', fontSize: '13px' }}
                            onClick={() => selectCat(selCat === child.slug ? '' : child.slug, cat.slug)}
                          >
                            {child.name}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
              {parentCats.length > 10 && (
                <button
                  onClick={() => { setCatsOpen(o => { catsOpenRef.current = !o; return !o; }); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '4px',
                    width: '100%', background: 'none', border: 'none', cursor: 'pointer',
                    padding: '6px 10px', marginTop: '2px', borderRadius: '8px',
                    fontSize: '13px', fontWeight: 600, color: '#4880B8',
                  }}
                >
                  {catsOpen
                    ? <><ChevronUp size={13} strokeWidth={2} />Згорнути</>
                    : <><ChevronDown size={13} strokeWidth={2} />Показати всі</>}
                </button>
              )}
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
                Фільтри
                {activeFilterCount > 0 && <span className="sidebar-filter-badge">{activeFilterCount}</span>}
              </button>

              {volumesL.length > 1 && (
                <div className="filter-group">
                  <div className="filter-label">Об&apos;єм</div>
                  <select className={'filter-select' + (filterVolume ? ' active' : '')} value={filterVolume} onChange={e => setFilterVolume(e.target.value)}>
                    <option value="">Всі</option>
                    {volumesL.map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
              )}
              {volumesKg.length > 1 && (
                <div className="filter-group">
                  <div className="filter-label">Вага</div>
                  <select className={'filter-select' + (filterVolumeKg ? ' active' : '')} value={filterVolumeKg} onChange={e => setFilterVolumeKg(e.target.value)}>
                    <option value="">Всі</option>
                    {volumesKg.map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
              )}
              {allFilters.map(({ label, values }) => (
                <div key={label} className="filter-group">
                  <div className="filter-label">{label}</div>
                  <select
                    className={'filter-select' + (filterValues[label] ? ' active' : '')}
                    value={filterValues[label] ?? ''}
                    onChange={e => setFilterValues(prev => ({ ...prev, [label]: e.target.value }))}
                  >
                    <option value="">{label === 'Колір' ? 'Всі кольори' : label === 'Бренд' ? 'Всі бренди' : 'Всі'}</option>
                    {values.map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
              ))}
              <label className="filter-check">
                <input type="checkbox" checked={inStockOnly} onChange={e => setInStockOnly(e.target.checked)} />
                Тільки в наявності
              </label>
              <label className="filter-check">
                <input type="checkbox" checked={saleOnly} onChange={e => setSaleOnly(e.target.checked)} />
                Тільки акційні
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
                  {selCat ? (categories.find(c => c.slug === selCat)?.name ?? 'Оптовий каталог') : 'Оптовий каталог'}
                </h1>
                <p className="catalog-count">{filtered.length} товарів</p>
              </div>
              {!isWholesale && PROMO.banner.active && !saleOnly && (
                <Link href={`/catalog?category=${PROMO.banner.categorySlug}&sale=1`} className="promo-chip">
                  ☀️ <strong>−{PROMO.topBar.discount}</strong>&nbsp;{PROMO.topBar.text}
                </Link>
              )}
              {isWholesale && (
                <a ref={badgeRef} href="/cart" className={`wholesale-min-badge${cartMet ? ' wholesale-min-met' : ''}`}>
                  <div className="wholesale-min-row">
                    <span>Мінімальне замовлення — <strong>{WHOLESALE_MIN.toLocaleString('uk-UA')} ₴</strong></span>
                    {cartTotal > 0 && (
                      <span className="wholesale-min-status">
                        {cartMet
                          ? 'виконано ✓'
                          : <>У кошику: <strong>{cartTotal.toLocaleString('uk-UA')} ₴</strong>&nbsp;·&nbsp;ще <strong>{cartRemaining.toLocaleString('uk-UA')} ₴</strong></>
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
                  Категорії
                </button>
                {(() => {
                  const count = Object.values(filterValues).filter(Boolean).length +
                    (filterVolume ? 1 : 0) + (filterVolumeKg ? 1 : 0) + (inStockOnly ? 1 : 0);
                  return (
                    <button
                      className={'catalog-mobile-btn' + (mobilePanel === 'filters' ? ' active' : '')}
                      onClick={() => setMobilePanel(v => v === 'filters' ? null : 'filters')}
                    >
                      <SlidersHorizontal size={14} strokeWidth={2} />
                      Фільтри
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
                  🔥 Акції
                </button>
                <button className="catalog-desktop-btn action-btn excel" onClick={exportToExcel}>
                  <Upload size={14} strokeWidth={2} />
                  Завантажити Excel
                </button>
                <div className="catalog-view-toggle">
                  <button
                    className={'catalog-view-btn' + (viewMode === 'table' ? ' active' : '')}
                    title="Таблиця"
                    onClick={() => setViewMode('table')}
                  >
                    <Table2 size={15} strokeWidth={2} />
                  </button>
                  <button
                    className={'catalog-view-btn' + (viewMode === 'grid' ? ' active' : '')}
                    title="Карточки"
                    onClick={() => setViewMode('grid')}
                  >
                    <LayoutGrid size={15} strokeWidth={2} />
                  </button>
                </div>
              </div>
            </div>

            {/* Sticky search + category pills */}
            <div className="catalog-sticky-bar">
              <SearchAutocomplete
                value={search}
                onChange={setSearch}
                placeholder="Пошук за назвою, артикулом, брендом..."
                wrapperClassName="search-bar"
                iconClassName="search-icon"
              />
              <div className="catalog-cats-pills" ref={pillsRef}>
                <button
                  className={'catalog-cat-pill' + (!selCat ? ' active' : '')}
                  onClick={() => { setSelCat(''); router.replace('?', { scroll: false } as never); setVisibleCount(50); }}
                >
                  Всі категорії
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
                      {cat.name}
                    </button>
                  );
                })}
              </div>
            </div>


            {/* Grid view */}
            {viewMode === 'grid' && (
              filtered.length === 0 ? (
                <div className="product-table-wrap"><div className="empty-state"><h3>Нічого не знайдено</h3><p>Спробуйте змінити фільтри або пошуковий запит</p></div></div>
              ) : (
                <>
                  <div className="catalog-grid">
                    {filtered.slice(0, visibleCount).map(p => {
                      const priceUnit = p.stock?.price_unit ?? 0;
                      const priceOld  = p.stock?.price_old  ?? null;
                      const stockQty  = p.stock?.stock_qty  ?? 0;
                      const inStock   = p.stock?.stock_status === 'in_stock' || stockQty >= 1;
                      const isSale    = priceOld != null && priceUnit > 0 && priceUnit < priceOld;
                      const qty       = getQty(p.sku, 1);
                      return (
                        <div key={p.sku} className="catalog-card">
                          <Link href={`/product/${p.sku}`} className="catalog-card__img-wrap">
                            {isSale && <span className="catalog-card__badge">АКЦІЯ</span>}
                            <ProductImage
                              brand={p.brand} nl1={p.nl1 ?? ''} nl2={p.nl2 ?? undefined}
                              volume={p.volume ?? ''} bc={p.bc} ac={p.ac} type={p.img_type}
                              imageUrl={p.image ?? undefined}
                            />
                          </Link>
                          <div className="catalog-card__body">
                            <Link href={`/product/${p.sku}`} className="catalog-card__name">{p.name}</Link>
                            <div className="catalog-card__meta">
                              <span>{p.brand}</span>
                              {p.volume && <span className="catalog-card__vol">{p.volume}</span>}
                              <span>Арт. {p.sku}</span>
                            </div>
                            <div className="catalog-card__bottom">
                            <div className="catalog-card__bottom-left">
                              <span className={'catalog-card__stock' + (inStock ? '' : ' out')}>
                                <span className="catalog-card__dot" />
                                {inStock ? 'В наявності' : 'Немає'}
                              </span>
                              {priceUnit > 0 ? (
                                <div className="catalog-card__price">
                                  {isSale && <span className="catalog-card__price-old">{Number(priceOld).toFixed(2)} грн</span>}
                                  <span>{Number(priceUnit).toFixed(2)} <em>грн</em></span>
                                </div>
                              ) : (
                                <div className="catalog-card__price-na">За запитом</div>
                              )}
                              <div className="catalog-card__pack">уп. {p.pack_qty} шт</div>
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
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {filtered.length > visibleCount && (
                    <div style={{ textAlign: 'center', padding: '32px 0' }}>
                      <button onClick={() => setVisibleCount(v => v + 50)} style={{ height: '48px', padding: '0 32px', borderRadius: '12px', background: '#1E3A5F', color: '#fff', border: 'none', fontSize: '14px', fontWeight: 700, cursor: 'pointer' }}>
                        Показати більше ({filtered.length - visibleCount} залишилось)
                      </button>
                    </div>
                  )}
                </>
              )
            )}

            {/* Table */}
            {viewMode === 'table' && (filtered.length === 0 ? (
              <div className="product-table-wrap">
                <div className="empty-state">
                  <h3>Нічого не знайдено</h3>
                  <p>Спробуйте змінити фільтри або пошуковий запит</p>
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
                      <th>Фото</th>
                      <th>Назва продукту</th>
                      <th>Об&apos;єм</th>
                      <th>Наявність</th>
                      <th>Ціна</th>
                      <th>Уп-ка</th>
                      <th>К-ть</th>
                      <th>Дії</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.slice(0, visibleCount).map(p => {
                      const priceUnit = p.stock?.price_unit ?? 0;
                      const priceOld  = p.stock?.price_old  ?? null;
                      const stockQty  = p.stock?.stock_qty    ?? 0;
                      const stockSt   = p.stock?.stock_status;
                      const inStock   = stockSt === 'in_stock' || stockQty >= 1;
                      const isSale    = priceOld != null && priceUnit > 0 && priceUnit < priceOld;
                      const qty       = getQty(p.sku, 1);
                      const packStr   = `${p.pack_qty} шт`;

                      return (
                        <tr key={p.sku} style={{ position: 'relative' }}>
                          <td>
                            <Link href={`/product/${p.sku}`} className="tr-link" aria-label={p.name} />
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
                              {p.name}
                              {isSale && <span className="badge-sale">АКЦІЯ</span>}
                            </div>
                            {(() => {
                              const colorVal = p.color ?? p.characteristics.find(c => /^Колір/i.test(c.label))?.value ?? null;
                              return (p.product_type || colorVal) ? (
                                <div className="cell-chars">
                                  {p.product_type && <span className="cell-char">{p.product_type}</span>}
                                  {colorVal       && <span className="cell-char">Колір: {colorVal}</span>}
                                </div>
                              ) : null;
                            })()}
                          </td>
                          <td><span className="cell-text">{p.volume ?? '—'}</span></td>
                          <td>
                            <span className={'stock-badge ' + (inStock ? 'in' : 'out')}>
                              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor', flexShrink: 0 }} />
                              {inStock ? 'в наявності' : 'Немає'}
                            </span>
                          </td>
                          <td>
                            {priceUnit > 0 ? (
                              <div>
                                {isSale && <div className="price-old">{Number(priceOld).toFixed(2)} грн</div>}
                                <div className={isSale ? 'price-new' : 'price-only'}>{Number(priceUnit).toFixed(2)} грн</div>
                              </div>
                            ) : (
                              <span style={{ fontSize: 13, color: '#94A3B8' }}>За запитом</span>
                            )}
                          </td>
                          <td><span className="min-qty">{packStr}</span></td>
                          <td style={{ position: 'relative', zIndex: 1 }}>
                            <input
                              className="qty-input"
                              type="number"
                              value={getInputVal(p.sku, 1)}
                              min={1}
                              placeholder="Мін."
                              onChange={e => setInputVals(prev => ({ ...prev, [p.sku]: e.target.value }))}
                              onBlur={() => commitInputVal(p.sku, 1)}
                            />
                          </td>
                          <td style={{ position: 'relative', zIndex: 1, paddingLeft: '10px', paddingRight: '14px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px' }}>
                            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                              <button
                                className={'action-icon-btn primary' + (added[p.sku] ? ' added' : '')}
                                title={inStock ? 'В кошик' : 'Немає в наявності'}
                                disabled={!inStock}
                                onClick={e => { e.preventDefault(); e.stopPropagation(); handleAddToCart(p, qty); }}
                                style={!inStock ? { opacity: 0.4, cursor: 'default' } : undefined}
                              >
                                {added[p.sku] ? <Check size={14} strokeWidth={2.5} /> : <Plus size={14} strokeWidth={2.5} />}
                              </button>
                              <button
                                className="action-icon-btn"
                                title="Обране"
                                onClick={() => toggle(p.sku)}
                                style={{
                                  color: isLiked(p.sku) ? '#EF4444' : undefined,
                                  background: isLiked(p.sku) ? '#FEF2F2' : undefined,
                                  borderColor: isLiked(p.sku) ? '#FECACA' : undefined,
                                }}
                              >
                                <Heart size={13} strokeWidth={2} fill={isLiked(p.sku) ? '#EF4444' : 'none'} />
                              </button>
                              <Link href={`/product/${p.sku}`} className="action-icon-btn" title="Переглянути" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Eye size={13} strokeWidth={2} />
                              </Link>
                            </div>
                            {inCartSkus.has(p.sku) && (() => {
                              const cartQty = cartItems.find(i => i.sku === p.sku)?.qty ?? 0;
                              return (
                                <span style={{ fontSize: '11px', fontWeight: 600, color: '#16A34A', whiteSpace: 'nowrap' }}>
                                  додано {cartQty} шт
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

            {viewMode === 'table' && filtered.length > visibleCount && (
              <div style={{ textAlign: 'center', padding: '32px 0' }}>
                <button
                  onClick={() => setVisibleCount(v => v + 50)}
                  style={{
                    height: '48px', padding: '0 32px', borderRadius: '12px',
                    background: '#1E3A5F', color: '#fff', border: 'none',
                    fontSize: '14px', fontWeight: 700, cursor: 'pointer',
                  }}
                >
                  Показати більше ({filtered.length - visibleCount} залишилось)
                </button>
              </div>
            )}

          </div>
        </div>
      </div>

      {(() => {
        const meta = selCat ? getCategoryMeta(selCat) : null;
        const catName = selCat ? categories.find(c => c.slug === selCat)?.name : null;
        if (!meta || !catName) return null;
        return (
          <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '0 20px 32px' }}>
            <div style={{ padding: '16px 20px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-card)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '8px' }}>
                <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', margin: 0 }}>
                  Про категорію «{catName}»
                </p>
                {meta.blogSlug && (
                  <Link href={`/blog/${meta.blogSlug}`} style={{ fontSize: '12px', color: '#4880B8', fontWeight: 600, whiteSpace: 'nowrap', textDecoration: 'none' }}>
                    Читати статтю →
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
                    Часті запитання
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
        <a href="/cart" className={`wholesale-float-bar${pillEntered ? ' entered' : ''}${cartFlash ? ' flash' : ''}`}>
          <span className="wholesale-float-label">мін. замовлення</span>
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

'use client';

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Upload, Heart, Eye, Plus, Check, ChevronDown, ChevronRight, ChevronUp, LayoutList, SlidersHorizontal } from 'lucide-react';
import Link from 'next/link';
import ProductImage from '../components/ProductImage';
import type { ProductFull, Category } from '../../lib/supabase';
import { useCart } from '../../lib/cart';
import { useWishlist } from '../../lib/wishlist';
import Footer from '../components/Footer';
import { getCategoryMeta } from '../../lib/category-descriptions';
import './catalog.css';

type Props = { products: ProductFull[]; categories: Category[]; initialSearch?: string; initialCategory?: string; initialSaleOnly?: boolean };

export default function CatalogClient({ products, categories, initialSearch = '', initialCategory = '', initialSaleOnly = false }: Props) {
  const [search,        setSearch]        = useState(initialSearch);
  const [selCat,        setSelCat]        = useState(initialCategory);
  const router = useRouter();
  const catsListRef = useRef<HTMLDivElement>(null);
  const catRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const sidebarRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      const sidebar = sidebarRef.current;
      const catsList = catsListRef.current;
      if (!sidebar) return;
      const sidebarRect = sidebar.getBoundingClientRect();
      // If mouse is to the right of the sidebar — let the page scroll normally
      if (e.clientX > sidebarRect.right) return;
      e.preventDefault();
      // If mouse is over the cats list — scroll it first
      if (catsList) {
        const catsRect = catsList.getBoundingClientRect();
        if (e.clientX >= catsRect.left && e.clientX <= catsRect.right &&
            e.clientY >= catsRect.top  && e.clientY <= catsRect.bottom) {
          catsList.scrollTop += e.deltaY;
          return;
        }
      }
      sidebar.scrollTop += e.deltaY;
    };
    document.addEventListener('wheel', handleWheel, { passive: false });
    return () => document.removeEventListener('wheel', handleWheel);
  }, []);

  useEffect(() => {
    if (initialCategory) setTimeout(() => scrollCatToTop(initialCategory), 150);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const scrollCatToTop = useCallback((slug: string) => {
    const catEl = catRefs.current[slug];
    const container = catsListRef.current;
    if (!catEl || !container) return;
    const scrollEl = container.scrollHeight > container.clientHeight ? container : sidebarRef.current;
    if (!scrollEl) return;
    const elTop = catEl.getBoundingClientRect().top;
    const scrollElTop = scrollEl.getBoundingClientRect().top;
    scrollEl.scrollTo({ top: scrollEl.scrollTop + (elTop - scrollElTop), behavior: 'smooth' });
  }, []);

  const selectCat = (slug: string, scrollSlug?: string) => {
    setSelCat(slug);
    router.replace(slug ? `?category=${slug}` : '?', { scroll: false } as never);
    window.scrollTo(0, 0);
    sidebarRef.current?.scrollTo({ top: 0 });
    setVisibleCount(50);
    setMobilePanel(null);
    const target = scrollSlug ?? slug;
    if (target) setTimeout(() => scrollCatToTop(target), 50);
  };
  const [filterValues,   setFilterValues]   = useState<Record<string, string>>({});
  const [filterVolume,   setFilterVolume]   = useState('');
  const [filterVolumeKg, setFilterVolumeKg] = useState('');
  const [inStockOnly,   setInStockOnly]   = useState(false);
  const [saleOnly,      setSaleOnly]      = useState(initialSaleOnly);
  const [visibleCount,  setVisibleCount]  = useState(50);
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
  const [mobilePanel,   setMobilePanel]   = useState<'cats' | 'filters' | null>(null);
  const [quantities,    setQuantities]    = useState<Record<string, number>>({});
  const [inputVals,     setInputVals]     = useState<Record<string, string>>({});
  const [added,         setAdded]         = useState<Record<string, boolean>>({});
  const { addItem, items: cartItems } = useCart();
  const { toggle, isLiked } = useWishlist();
  const inCartSkus = useMemo(() => new Set(cartItems.map(i => i.sku)), [cartItems]);

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
      if (inStockOnly   && (p.stock?.stock_qty ?? 0) < p.min_order) return false;
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
      'Мін. замовлення': p.min_order,
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
      price: p.stock?.price_unit ?? 0, min_order: p.min_order,
      nl1: p.nl1 ?? '', nl2: p.nl2 ?? undefined,
      bc: p.bc, ac: p.ac, img_type: p.img_type, imageUrl: p.image ?? undefined,
    }, qty);
    setAdded(prev => ({ ...prev, [p.sku]: true }));
    setTimeout(() => setAdded(prev => ({ ...prev, [p.sku]: false })), 1500);
  }

  return (
    <>
      <div style={{ background: 'var(--bg-page)', minHeight: '100vh' }}>
      <div className="page-container">
        <nav aria-label="Breadcrumb" style={{ padding: '32px 0 0', fontSize: '13px', color: '#94A3B8', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
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
                  maxHeight: catsOpen ? 'none' : '370px',
                  overflowY: catsOpen ? 'visible' : 'auto',
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
                          if (children.length > 0 && window.innerWidth <= 768) {
                            setExpandedCats(prev => { const next = new Set(prev); next.has(cat.slug) ? next.delete(cat.slug) : next.add(cat.slug); return next; });
                            setTimeout(() => scrollCatToTop(cat.slug), 50);
                          } else if (children.length > 0 && !expandedCats.has(cat.slug)) {
                            setExpandedCats(prev => { const next = new Set(prev); next.add(cat.slug); return next; });
                            selectCat(cat.slug);
                          } else {
                            selectCat(selCat === cat.slug ? '' : cat.slug);
                            if (children.length > 0) setExpandedCats(prev => {
                              const next = new Set(prev);
                              next.has(cat.slug) ? next.delete(cat.slug) : next.add(cat.slug);
                              return next;
                            });
                          }
                        }}
                      >
                        <span>{cat.name}</span>
                        {children.length > 0 && (
                          isExpanded
                            ? <ChevronDown size={13} strokeWidth={2} style={{ flexShrink: 0, opacity: 0.5 }} />
                            : <ChevronRight size={13} strokeWidth={2} style={{ flexShrink: 0, opacity: 0.5 }} />
                        )}
                      </div>
                      {isExpanded && children.map(child => (
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
                  );
                })}
              </div>
              {parentCats.length > 10 && (
                <button
                  onClick={() => setCatsOpen(o => !o)}
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
            <hr className="sidebar-divider" />

            {/* Filters */}
            <div className="sidebar-section">
              <div className="sidebar-heading">Фільтри</div>

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
                <h1 className="catalog-title">Оптовий каталог</h1>
                <p className="catalog-count">{filtered.length} товарів</p>
              </div>
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
              </div>
            </div>

            {/* Search */}
            <div className="search-bar">
              <Search size={16} className="search-icon" />
              <input
                type="text"
                placeholder="Пошук за назвою, артикулом, брендом..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>


            {/* Table */}
            {filtered.length === 0 ? (
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
                      <th>Мін. к-ть</th>
                      <th>К-ть</th>
                      <th>Дії</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.slice(0, visibleCount).map(p => {
                      const priceUnit = p.stock?.price_unit ?? 0;
                      const priceOld  = p.stock?.price_old  ?? null;
                      const stockQty  = p.stock?.stock_qty  ?? 0;
                      const inStock   = stockQty >= p.min_order;
                      const isSale    = priceOld != null && priceUnit > 0 && priceUnit < priceOld;
                      const qty       = getQty(p.sku, p.min_order);
                      const packFrac  = p.min_order / p.pack_qty;
                      const packStr   = Number.isInteger(packFrac)
                        ? `${p.min_order} рс / ${packFrac} уп`
                        : `${p.min_order} рс / ${packFrac.toFixed(1)} уп`;

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
                                {isSale && <div className="price-old">{priceOld} грн</div>}
                                <div className={isSale ? 'price-new' : 'price-only'}>{priceUnit} грн</div>
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
                              value={getInputVal(p.sku, p.min_order)}
                              min={p.min_order}
                              placeholder="Мін."
                              onChange={e => setInputVals(prev => ({ ...prev, [p.sku]: e.target.value }))}
                              onBlur={() => commitInputVal(p.sku, p.min_order)}
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
            )}

            {filtered.length > visibleCount && (
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
      </div>

      {(() => {
        const meta = selCat ? getCategoryMeta(selCat) : null;
        const catName = selCat ? categories.find(c => c.slug === selCat)?.name : null;
        if (!meta || !catName) return null;
        return (
          <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '0 20px 32px' }}>
            <details>
              <summary style={{
                fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)',
                cursor: 'pointer', userSelect: 'none', listStyle: 'none',
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                padding: '7px 12px', borderRadius: '8px',
                border: '1px solid var(--border)', background: 'var(--bg-card)',
              }}>
                <span>ℹ️ Про категорію «{catName}»</span>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>▼</span>
              </summary>
              <div style={{ padding: '12px 0 0', borderTop: '1px solid var(--border)', marginTop: '8px' }}>
                <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.7, margin: 0 }}>{meta.description}</p>
                {meta.seoText && <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.7, margin: '8px 0 0' }}>{meta.seoText}</p>}
              </div>
            </details>
          </div>
        );
      })()}
      <Footer />
    </>
  );
}

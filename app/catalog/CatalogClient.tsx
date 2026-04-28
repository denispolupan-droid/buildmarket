'use client';

import { useState, useMemo, useEffect, useRef, useCallback, Fragment } from 'react';
import { Search, Upload, Heart, Eye, Plus, Check, ChevronDown, ChevronRight, ChevronUp } from 'lucide-react';
import Link from 'next/link';
import ProductImage from '../components/ProductImage';
import type { ProductFull, Category } from '../../lib/supabase';
import { useCart } from '../../lib/cart';
import { useWishlist } from '../../lib/wishlist';
import Footer from '../components/Footer';
import './catalog.css';

type Props = { products: ProductFull[]; categories: Category[]; initialSearch?: string; initialCategory?: string; initialSaleOnly?: boolean };

export default function CatalogClient({ products, categories, initialSearch = '', initialCategory = '', initialSaleOnly = false }: Props) {
  const [search,        setSearch]        = useState(initialSearch);
  const [selCat,        setSelCat]        = useState(initialCategory);
  const [filterBrand,   setFilterBrand]   = useState('');
  const [filterType,    setFilterType]    = useState('');
  const [filterVolume,  setFilterVolume]  = useState('');
  const [filterColor,   setFilterColor]   = useState('');
  const [inStockOnly,   setInStockOnly]   = useState(false);
  const [saleOnly,      setSaleOnly]      = useState(initialSaleOnly);
  const [expandedCats, setExpandedCats]  = useState<Set<string>>(new Set());
  const [catsOpen,      setCatsOpen]      = useState(false);
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

  const brands  = useMemo(() => ['', ...[...new Set(products.map(p => p.brand))]], [products]);
  const types   = useMemo(() => ['', ...[...new Set(products.map(p => p.product_type).filter(Boolean))]] as string[], [products]);
  const volumes = useMemo(() => ['', ...[...new Set(products.map(p => p.volume).filter(Boolean))]] as string[], [products]);
  const colors  = useMemo(() => ['', ...[...new Set(products.map(p => p.color).filter(Boolean))]] as string[], [products]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return products.filter(p => {
      if (q && !p.name.toLowerCase().includes(q) && !p.sku.toLowerCase().includes(q) && !p.brand.toLowerCase().includes(q)) return false;
      if (matchingSlugs && !matchingSlugs.has(p.category_slug ?? '')) return false;
      if (filterBrand   && p.brand          !== filterBrand)    return false;
      if (filterType    && p.product_type   !== filterType)     return false;
      if (filterVolume  && p.volume         !== filterVolume)   return false;
      if (filterColor   && p.color          !== filterColor)    return false;
      if (inStockOnly   && (p.stock?.stock_qty ?? 0) < p.min_order) return false;
      if (saleOnly) {
        const pu = p.stock?.price_unit ?? 0;
        const po = p.stock?.price_old  ?? null;
        if (!(po != null && pu > 0 && pu < po)) return false;
      }
      return true;
    });
  }, [products, search, matchingSlugs, filterBrand, filterType, filterVolume, filterColor, inStockOnly, saleOnly]);

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
      <div style={{ background: '#fff', minHeight: '100vh' }}>
      <div className="page-container">
        <nav aria-label="Breadcrumb" style={{ padding: '16px 0 0', fontSize: '13px', color: '#94A3B8', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <a href="/" style={{ color: '#94A3B8', textDecoration: 'none' }}>Головна</a>
          <span>/</span>
          <span style={{ color: '#475569' }}>Оптовий каталог</span>
        </nav>
        <div className="catalog-page">

          {/* Sidebar */}
          <aside className="sidebar">

            {/* Categories */}
            <div className="sidebar-section">
              <div className="sidebar-heading">Категорії</div>
              <div
                className="cat-list"
                style={{
                  maxHeight: catsOpen ? 'none' : '370px',
                  overflowY: catsOpen ? 'visible' : 'auto',
                  scrollbarWidth: 'none',
                }}
              >
                <div
                  className={'cat-item' + (!selCat ? ' active' : '')}
                  onClick={() => setSelCat('')}
                >
                  Всі категорії
                </div>
                {parentCats.map(cat => {
                  const children = childrenOf[cat.slug] ?? [];
                  const isExpanded = expandedCats.has(cat.slug);
                  const isActive = selCat === cat.slug || children.some(c => c.slug === selCat);
                  return (
                    <Fragment key={cat.slug}>
                      <div
                        className={'cat-item' + (isActive ? ' active' : '')}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                        onClick={() => {
                          setSelCat(selCat === cat.slug ? '' : cat.slug);
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                          if (children.length > 0) setExpandedCats(prev => {
                            const next = new Set(prev);
                            next.has(cat.slug) ? next.delete(cat.slug) : next.add(cat.slug);
                            return next;
                          });
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
                          className={'cat-item' + (selCat === child.slug ? ' active' : '')}
                          style={{ paddingLeft: '20px', fontSize: '13px' }}
                          onClick={() => { setSelCat(selCat === child.slug ? '' : child.slug); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                        >
                          {child.name}
                        </div>
                      ))}
                    </Fragment>
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

            <hr className="sidebar-divider" />

            {/* Filters */}
            <div className="sidebar-section">
              <div className="sidebar-heading">Фільтри</div>

              <div className="filter-group">
                <div className="filter-label">Бренд</div>
                <select
                  className={'filter-select' + (filterBrand ? ' active' : '')}
                  value={filterBrand}
                  onChange={e => setFilterBrand(e.target.value)}
                >
                  <option value="">Всі бренди</option>
                  {brands.filter(Boolean).map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>

              <div className="filter-group">
                <div className="filter-label">Тип</div>
                <select
                  className={'filter-select' + (filterType ? ' active' : '')}
                  value={filterType}
                  onChange={e => setFilterType(e.target.value)}
                >
                  <option value="">Всі типи</option>
                  {types.filter(Boolean).map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>

              <div className="filter-group">
                <div className="filter-label">Об&apos;єм</div>
                <select
                  className={'filter-select' + (filterVolume ? ' active' : '')}
                  value={filterVolume}
                  onChange={e => setFilterVolume(e.target.value)}
                >
                  <option value="">Всі об&apos;єми</option>
                  {volumes.filter(Boolean).map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>

              <div className="filter-group">
                <div className="filter-label">Колір</div>
                <select
                  className={'filter-select' + (filterColor ? ' active' : '')}
                  value={filterColor}
                  onChange={e => setFilterColor(e.target.value)}
                >
                  <option value="">Всі кольори</option>
                  {colors.filter(Boolean).map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              <label className="filter-check">
                <input type="checkbox" checked={inStockOnly} onChange={e => setInStockOnly(e.target.checked)} />
                Тільки в наявності
              </label>
              <label className="filter-check">
                <input type="checkbox" checked={saleOnly} onChange={e => setSaleOnly(e.target.checked)} />
                Тільки акційні
              </label>
            </div>

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
                <button
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
                <button className="action-btn excel" onClick={exportToExcel}>
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
                    {filtered.map(p => {
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
                            {(p.product_type || p.color) && (
                              <div className="cell-chars">
                                {p.product_type && <span className="cell-char">{p.product_type}</span>}
                                {p.color        && <span className="cell-char">{p.color}</span>}
                              </div>
                            )}
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

          </div>
        </div>
      </div>
      </div>

      <Footer />
    </>
  );
}

'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { Search, Upload, AlertCircle, Heart, Eye, Plus } from 'lucide-react';
// Search kept for the search-bar icon
import ProductImage from '../components/ProductImage';
import type { ProductFull, Category } from '../../lib/supabase';
import Footer from '../components/Footer';

const css = `
  .catalog-page { display: grid; grid-template-columns: 256px 1fr; gap: 28px; padding: 28px 0 48px; align-items: start; }

  /* ── Sidebar ── */
  .sidebar { background: #fff; border: 1px solid #E2E8F0; border-radius: 14px; padding: 20px 16px; }
  .sidebar-section { margin-bottom: 24px; }
  .sidebar-section:last-child { margin-bottom: 0; }
  .sidebar-divider { border: none; border-top: 1px solid #F1F5F9; margin: 20px 0; }
  .sidebar-heading { font-size: 15px; font-weight: 700; color: #0F172A; margin-bottom: 12px; }
  .cat-list { display: flex; flex-direction: column; gap: 2px; }
  .cat-item {
    padding: 8px 12px; border-radius: 8px; cursor: pointer; user-select: none;
    font-size: 14px; font-weight: 500; color: #374151; transition: all 0.12s;
  }
  .cat-item:hover { background: #F8FAFC; color: #0F172A; }
  .cat-item.active { background: #E8EEF5; color: #1E3A5F; font-weight: 600; }
  .filter-label { font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 6px; }
  .filter-group { margin-bottom: 14px; }
  .filter-group:last-of-type { margin-bottom: 0; }
  .filter-select {
    width: 100%; height: 36px; padding: 0 10px;
    border: 1px solid #E2E8F0; border-radius: 8px;
    background: #fff; color: #475569; font-size: 14px; outline: none;
    appearance: auto; transition: border-color 0.15s, background 0.15s;
  }
  .filter-select:focus { border-color: #1E3A5F; }
  .filter-select.active { border-color: #1E3A5F; background: #E8EEF5; color: #1E3A5F; font-weight: 600; }
  .filter-check { display: flex; align-items: center; gap: 8px; font-size: 14px; color: #475569; cursor: pointer; margin-top: 14px; }
  .filter-check input { accent-color: #3DBFB8; width: 15px; height: 15px; }

  /* ── Main content ── */
  .catalog-main { min-width: 0; }
  .catalog-title-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 16px; }
  .catalog-title { font-size: 24px; font-weight: 800; color: #0F172A; }
  .catalog-count { font-size: 14px; color: #94A3B8; margin-top: 4px; }
  .catalog-actions { display: flex; gap: 8px; flex-shrink: 0; }
  .action-btn {
    display: inline-flex; align-items: center; gap: 6px;
    height: 36px; padding: 0 14px; border-radius: 8px;
    border: 1px solid #E2E8F0; background: #fff;
    color: #475569; font-size: 13px; font-weight: 600;
    white-space: nowrap; transition: background 0.15s;
  }
  .action-btn:hover { background: #F8FAFC; }

  /* ── Search ── */
  .search-bar { position: relative; margin-bottom: 12px; }
  .search-bar input {
    width: 100%; height: 42px; padding: 0 16px 0 42px;
    border: 1px solid #E2E8F0; border-radius: 10px; background: #fff;
    font-size: 14px; color: #0F172A; outline: none; transition: border-color 0.15s;
  }
  .search-bar input:focus { border-color: #2563EB; }
  .search-bar input::placeholder { color: #94A3B8; }
  .search-icon { position: absolute; left: 14px; top: 50%; transform: translateY(-50%); color: #94A3B8; pointer-events: none; }

  /* ── Login notice ── */
  .login-notice {
    display: flex; align-items: flex-start; gap: 10px;
    background: #FFFBEB; border: 1px solid #FDE68A; border-radius: 10px;
    padding: 12px 16px; margin-bottom: 16px;
  }
  .login-notice__icon { color: #D97706; flex-shrink: 0; margin-top: 1px; }
  .login-notice__title { font-size: 14px; font-weight: 600; color: #92400E; margin-bottom: 3px; }
  .login-notice__text { font-size: 13px; color: #B45309; line-height: 1.5; }
  .login-notice__link { color: #2563EB; font-weight: 600; }

  /* ── Table ── */
  .product-table-wrap { background: #fff; border: 1px solid #E2E8F0; border-radius: 12px; overflow: hidden; }
  .product-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  .product-table th {
    padding: 10px 10px; background: #1E293B; border-bottom: none;
    font-size: 11px; font-weight: 700; color: #94A3B8; text-transform: uppercase;
    letter-spacing: 0.5px; text-align: left; white-space: nowrap; overflow: hidden;
  }
  .product-table th:first-child { border-radius: 11px 0 0 0; }
  .product-table th:last-child { border-radius: 0 11px 0 0; }
  .product-table td { padding: 8px 10px; border-bottom: 1px solid #F1F5F9; vertical-align: middle; height: 100px; }
  .product-table tr:last-child td { border-bottom: none; }
  .product-table tr:hover td { background: #EFF4FA; }
  .tr-link { position: absolute; inset: 0; }

  .cell-photo { width: 84px; height: 84px; background: #F8FAFC; border-radius: 8px; overflow: visible; display: flex; align-items: center; justify-content: center; font-size: 11px; color: #94A3B8; flex-shrink: 0; position: relative; z-index: 0; cursor: zoom-in; }
  .cell-photo > * { transition: transform 0.28s ease; border-radius: 8px; }
  .cell-photo:hover { z-index: 20; }
  .cell-photo:hover > * { transform: scale(2.2); box-shadow: 0 12px 36px rgba(0,0,0,0.25); }
  .cell-sku { font-size: 12px; font-weight: 700; color: #475569; white-space: nowrap; }
  .cell-name { font-size: 14px; font-weight: 700; color: #0F172A; margin-bottom: 3px; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .badge-sale { background: #FEF3C7; color: #D97706; font-size: 11px; font-weight: 700; padding: 2px 7px; border-radius: 6px; white-space: nowrap; }
  .badge-type { background: #F1F5F9; color: #475569; font-size: 12px; padding: 2px 8px; border-radius: 6px; white-space: nowrap; }
  .cell-text { font-size: 13px; color: #475569; white-space: nowrap; }
  .stock-badge { display: inline-flex; align-items: center; gap: 5px; padding: 3px 9px; border-radius: 20px; font-size: 12px; font-weight: 600; white-space: nowrap; }
  .stock-badge.in { background: #DCFCE7; color: #15803D; }
  .stock-badge.out { background: #FEE2E2; color: #DC2626; }
  .price-old { font-size: 12px; color: #EF4444; text-decoration: line-through; white-space: nowrap; font-weight: 600; }
  .price-new { font-size: 15px; font-weight: 700; color: #16A34A; white-space: nowrap; }
  .price-only { font-size: 15px; font-weight: 700; color: #0F172A; white-space: nowrap; }
  .min-qty { font-size: 12px; color: #475569; white-space: nowrap; }

  /* Qty + actions */
  .qty-input {
    width: 64px; height: 32px; padding: 0 8px;
    border: 1px solid #E2E8F0; border-radius: 7px; background: #fff;
    font-size: 13px; font-weight: 600; color: #0F172A; text-align: center; outline: none;
  }
  .qty-input:focus { border-color: #2563EB; }
  .action-icon-btn {
    width: 32px; height: 32px; border-radius: 7px; border: 1px solid #E2E8F0;
    background: #fff; display: flex; align-items: center; justify-content: center;
    color: #64748B; flex-shrink: 0; transition: all 0.15s;
  }
  .action-icon-btn:hover { border-color: #CBD5E1; background: #F8FAFC; }
  .action-icon-btn.primary { background: #2563EB; border-color: #2563EB; color: #fff; }
  .action-icon-btn.primary:hover { background: #1D4ED8; }

  /* ── Empty ── */
  .empty-state { padding: 60px 20px; text-align: center; }
  .empty-state h3 { font-size: 16px; font-weight: 700; color: #0F172A; margin-bottom: 6px; }
  .empty-state p { font-size: 14px; color: #94A3B8; }
`;

type Props = { products: ProductFull[]; categories: Category[]; initialSearch?: string; initialCategory?: string };

export default function CatalogClient({ products, categories, initialSearch = '', initialCategory = '' }: Props) {
  const [search,        setSearch]        = useState(initialSearch);
  const [selCat,        setSelCat]        = useState(initialCategory);
  const [filterBrand,   setFilterBrand]   = useState('');
  const [filterType,    setFilterType]    = useState('');
  const [filterVolume,  setFilterVolume]  = useState('');
  const [filterColor,   setFilterColor]   = useState('');
  const [inStockOnly,   setInStockOnly]   = useState(false);
  const [quantities,    setQuantities]    = useState<Record<string, number>>({});

  const brands  = useMemo(() => ['', ...[...new Set(products.map(p => p.brand))]], [products]);
  const types   = useMemo(() => ['', ...[...new Set(products.map(p => p.product_type).filter(Boolean))]] as string[], [products]);
  const volumes = useMemo(() => ['', ...[...new Set(products.map(p => p.volume).filter(Boolean))]] as string[], [products]);
  const colors  = useMemo(() => ['', ...[...new Set(products.map(p => p.color).filter(Boolean))]] as string[], [products]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return products.filter(p => {
      if (q && !p.name.toLowerCase().includes(q) && !p.sku.toLowerCase().includes(q) && !p.brand.toLowerCase().includes(q)) return false;
      if (selCat        && p.category_slug !== selCat)          return false;
      if (filterBrand   && p.brand          !== filterBrand)    return false;
      if (filterType    && p.product_type   !== filterType)     return false;
      if (filterVolume  && p.volume         !== filterVolume)   return false;
      if (filterColor   && p.color          !== filterColor)    return false;
      if (inStockOnly   && (p.stock?.stock_qty ?? 0) < p.min_order) return false;
      return true;
    });
  }, [products, search, selCat, filterBrand, filterType, filterVolume, filterColor, inStockOnly]);

  function getQty(sku: string, min: number) { return quantities[sku] ?? min; }
  function setQty(sku: string, min: number, val: number) {
    setQuantities(prev => ({ ...prev, [sku]: Math.max(min, val) }));
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div style={{ background: '#fff', minHeight: '100vh' }}>
      <div className="page-container">
        <div className="catalog-page">

          {/* Sidebar */}
          <aside className="sidebar">

            {/* Categories */}
            <div className="sidebar-section">
              <div className="sidebar-heading">Категорії</div>
              <div className="cat-list">
                <div
                  className={'cat-item' + (!selCat ? ' active' : '')}
                  onClick={() => setSelCat('')}
                >
                  Всі категорії
                </div>
                {categories.map(cat => (
                  <div
                    key={cat.slug}
                    className={'cat-item' + (selCat === cat.slug ? ' active' : '')}
                    onClick={() => setSelCat(selCat === cat.slug ? '' : cat.slug)}
                  >
                    {cat.name}
                  </div>
                ))}
              </div>
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
            </div>

          </aside>

          {/* Main */}
          <div className="catalog-main">

            {/* Title row */}
            <div className="catalog-title-row">
              <div>
                <h1 className="catalog-title">Каталог продукції</h1>
                <p className="catalog-count">{filtered.length} товарів</p>
              </div>
              <div className="catalog-actions">
                <button className="action-btn">
                  <Upload size={14} strokeWidth={2} />
                  Імпорт Excel
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

            {/* Login notice */}
            <div className="login-notice">
              <AlertCircle size={16} className="login-notice__icon" />
              <div>
                <div className="login-notice__title">Для перегляду цін потрібно увійти</div>
                <div className="login-notice__text">
                  Будь ласка,{' '}
                  <Link href="/login" className="login-notice__link">увійдіть</Link>
                  , щоб побачити персоналізовані ціни залежно від типу вашого облікового запису.
                </div>
              </div>
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
                    <col style={{ width: '96px' }} />
                    <col style={{ width: '88px' }} />
                    <col />
                    <col style={{ width: '80px' }} />
                    <col style={{ width: '130px' }} />
                    <col style={{ width: '68px' }} />
                    <col style={{ width: '90px' }} />
                    <col style={{ width: '100px' }} />
                    <col style={{ width: '105px' }} />
                    <col style={{ width: '76px' }} />
                    <col style={{ width: '84px' }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>Фото</th>
                      <th>Артикул</th>
                      <th>Назва продукту</th>
                      <th>Бренд</th>
                      <th>Тип</th>
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
                              />
                            </div>
                          </td>
                          <td><span className="cell-sku">{p.sku}</span></td>
                          <td>
                            <div className="cell-name">
                              {p.name}
                              {isSale && <span className="badge-sale">АКЦІЯ</span>}
                            </div>
                          </td>
                          <td><span className="cell-text">{p.brand}</span></td>
                          <td>
                            {p.product_type
                              ? <span className="badge-type">{p.product_type}</span>
                              : <span className="cell-text">—</span>}
                          </td>
                          <td><span className="cell-text">{p.volume ?? '—'}</span></td>
                          <td>
                            <span className={'stock-badge ' + (inStock ? 'in' : 'out')}>
                              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor', flexShrink: 0 }} />
                              {inStock ? `${stockQty} рс` : 'Немає'}
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
                              value={qty}
                              min={p.min_order}
                              placeholder="Мін."
                              onChange={e => {
                                const v = parseInt(e.target.value, 10);
                                if (!isNaN(v)) setQty(p.sku, p.min_order, v);
                              }}
                            />
                          </td>
                          <td style={{ position: 'relative', zIndex: 1 }}>
                            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                              <button className="action-icon-btn primary" title="В кошик">
                                <Plus size={14} strokeWidth={2.5} />
                              </button>
                              <button className="action-icon-btn" title="Обране">
                                <Heart size={13} strokeWidth={2} />
                              </button>
                              <Link href={`/product/${p.sku}`} className="action-icon-btn" title="Переглянути" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Eye size={13} strokeWidth={2} />
                              </Link>
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

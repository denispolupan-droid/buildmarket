'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Search, Plus, Heart, ChevronDown, ChevronUp, ChevronRight } from 'lucide-react';
import ProductImage from '../components/ProductImage';
import { useCart } from '../../lib/cart';
import { useWishlist } from '../../lib/wishlist';
import type { ProductFull, Category } from '../../lib/supabase';

type Props = {
  products: ProductFull[];
  categories: Category[];
  initialSaleOnly?: boolean;
  initialCategory?: string;
  initialBrand?: string;
};

export default function ShopClient({ products, categories, initialSaleOnly = false, initialCategory, initialBrand }: Props) {
  const [search,       setSearch]       = useState('');
  const [selCat,       setSelCat]       = useState<string | null>(initialCategory ?? null);
  const [saleOnly,     setSaleOnly]     = useState(initialSaleOnly);
  const [filterBrand,  setFilterBrand]  = useState(initialBrand ?? '');
  const [filterType,   setFilterType]   = useState('');
  const [filterVolume, setFilterVolume] = useState('');
  const [filterColor,  setFilterColor]  = useState('');
  const [inStockOnly,  setInStockOnly]  = useState(false);
  const [catsOpen,     setCatsOpen]     = useState(false);
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());
  const router = useRouter();

  const selectCat = (slug: string | null) => {
    setSelCat(slug);
    router.replace(slug ? `?category=${slug}` : '?', { scroll: false } as never);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const { addItem } = useCart();
  const { skus: wishSkus, toggle: toggleWish } = useWishlist();

  const brands  = useMemo(() => [...new Set(products.map(p => p.brand))].sort(), [products]);
  const types   = useMemo(() => [...new Set(products.map(p => p.product_type).filter(Boolean))].sort() as string[], [products]);
  const volumes = useMemo(() => [...new Set(products.map(p => p.volume).filter(Boolean))].sort() as string[], [products]);
  const colors  = useMemo(() => [...new Set(products.map(p => p.color).filter(Boolean))].sort() as string[], [products]);

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

  const filtered = useMemo(() => {
    let list = products;
    if (matchingSlugs)  list = list.filter(p => matchingSlugs.has(p.category_slug ?? ''));
    if (saleOnly)       list = list.filter(p => p.stock?.price_retail_old != null && (p.stock?.price_retail ?? 0) > 0);
    if (filterBrand)    list = list.filter(p => p.brand === filterBrand);
    if (filterType)     list = list.filter(p => p.product_type === filterType);
    if (filterVolume)   list = list.filter(p => p.volume === filterVolume);
    if (filterColor)    list = list.filter(p => p.color === filterColor);
    if (inStockOnly)    list = list.filter(p => (p.stock?.stock_qty ?? 0) >= 1);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.brand.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q)
      );
    }
    return list;
  }, [products, matchingSlugs, saleOnly, filterBrand, filterType, filterVolume, filterColor, inStockOnly, search]);

  const countFor = (slug: string) => {
    const children = (childrenOf[slug] ?? []).map(c => c.slug);
    const slugs = new Set([slug, ...children]);
    return products.filter(p => slugs.has(p.category_slug ?? '')).length;
  };

  return (
    <div className="shop-layout">
      {/* Sidebar */}
      <aside className="shop-sidebar">
        <h3>Категорії</h3>

        <div style={{
          maxHeight: catsOpen ? 'none' : '370px',
          overflowY: catsOpen ? 'visible' : 'auto',
          transition: 'max-height 0.2s ease',
          scrollbarWidth: 'none',
        }} className="shop-cats-list">
          <button
            className={'shop-cat-item' + (!selCat ? ' active' : '')}
            onClick={() => { selectCat(null); setExpandedCats(new Set()); }}
          >
            Всі категорії
          </button>
          {parentCats.map(cat => {
            const children = childrenOf[cat.slug] ?? [];
            const isExpanded = expandedCats.has(cat.slug);
            const isActive = selCat === cat.slug || children.some(c => c.slug === selCat);
            return (
              <div key={cat.slug} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <button
                  className={'shop-cat-item' + (isActive ? ' active' : '')}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}
                  onClick={() => {
                    selectCat(selCat === cat.slug ? null : cat.slug);
                    if (children.length > 0) {
                      setExpandedCats(prev => {
                        const next = new Set(prev);
                        next.has(cat.slug) ? next.delete(cat.slug) : next.add(cat.slug);
                        return next;
                      });
                    }
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                >
                  <span>{cat.name}</span>
                  {children.length > 0 && (
                    isExpanded
                      ? <ChevronDown size={12} strokeWidth={2} style={{ flexShrink: 0, opacity: 0.5 }} />
                      : <ChevronRight size={12} strokeWidth={2} style={{ flexShrink: 0, opacity: 0.5 }} />
                  )}
                </button>
                {isExpanded && children.map(child => {
                  const grandchildren = childrenOf[child.slug] ?? [];
                  const childExpanded = expandedCats.has(child.slug);
                  const childActive = selCat === child.slug || grandchildren.some(g => g.slug === selCat);
                  return (
                    <div key={child.slug} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <button
                        className={'shop-cat-item' + (childActive ? ' active' : '')}
                        style={{ paddingLeft: '22px', fontSize: '13px', width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                        onClick={() => {
                          selectCat(selCat === child.slug ? null : child.slug);
                          if (grandchildren.length > 0) setExpandedCats(prev => { const n = new Set(prev); n.has(child.slug) ? n.delete(child.slug) : n.add(child.slug); return n; });
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                      >
                        <span>{child.name}</span>
                        {grandchildren.length > 0 && (childExpanded
                          ? <ChevronDown size={11} strokeWidth={2} style={{ flexShrink: 0, opacity: 0.4 }} />
                          : <ChevronRight size={11} strokeWidth={2} style={{ flexShrink: 0, opacity: 0.4 }} />
                        )}
                      </button>
                      {childExpanded && grandchildren.map(gc => (
                        <button
                          key={gc.slug}
                          className={'shop-cat-item' + (selCat === gc.slug ? ' active' : '')}
                          style={{ paddingLeft: '36px', fontSize: '12px', width: '100%', textAlign: 'left' }}
                          onClick={() => selectCat(selCat === gc.slug ? null : gc.slug)}
                        >
                          {gc.name}
                        </button>
                      ))}
                    </div>
                  );
                })}
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
              padding: '6px 10px', marginTop: '0', borderRadius: '8px',
              fontSize: '13px', fontWeight: 600, color: '#4880B8',
            }}
          >
            {catsOpen
              ? <><ChevronUp size={13} strokeWidth={2} />Згорнути</>
              : <><ChevronDown size={13} strokeWidth={2} />Показати всі</>}
          </button>
        )}

        <hr className="shop-sidebar__divider" />
        <p className="shop-sidebar__heading">Фільтри</p>

        {brands.length > 0 && (
          <div className="shop-filter-group">
            <div className="shop-filter-label">Бренд</div>
            <select className={'shop-filter-select' + (filterBrand ? ' active' : '')} value={filterBrand} onChange={e => setFilterBrand(e.target.value)}>
              <option value="">Всі бренди</option>
              {brands.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
        )}
        {types.length > 0 && (
          <div className="shop-filter-group">
            <div className="shop-filter-label">Тип</div>
            <select className={'shop-filter-select' + (filterType ? ' active' : '')} value={filterType} onChange={e => setFilterType(e.target.value)}>
              <option value="">Всі типи</option>
              {types.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        )}
        {volumes.length > 0 && (
          <div className="shop-filter-group">
            <div className="shop-filter-label">Об&apos;єм</div>
            <select className={'shop-filter-select' + (filterVolume ? ' active' : '')} value={filterVolume} onChange={e => setFilterVolume(e.target.value)}>
              <option value="">Всі об&apos;єми</option>
              {volumes.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
        )}
        {colors.length > 0 && (
          <div className="shop-filter-group">
            <div className="shop-filter-label">Колір</div>
            <select className={'shop-filter-select' + (filterColor ? ' active' : '')} value={filterColor} onChange={e => setFilterColor(e.target.value)}>
              <option value="">Всі кольори</option>
              {colors.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        )}
        <label className="shop-filter-check">
          <input type="checkbox" checked={inStockOnly} onChange={e => setInStockOnly(e.target.checked)} />
          Тільки в наявності
        </label>
        <label className="shop-filter-check">
          <input type="checkbox" checked={saleOnly} onChange={e => setSaleOnly(e.target.checked)} />
          Тільки акційні
        </label>
      </aside>

      {/* Main */}
      <div>
        <div className="shop-topbar">
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
            <h1 className="shop-title">{saleOnly ? 'Акційні товари' : 'Магазин'}</h1>
            <span className="shop-count">{filtered.length} товарів</span>
          </div>
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
            🔥 Акція
          </button>
        </div>

        <div className="shop-search">
          <Search size={16} className="shop-search__icon" />
          <input
            placeholder="Пошук за назвою, артикулом, брендом..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <div className="shop-grid">
          {filtered.length === 0 && (
            <div className="shop-empty">Нічого не знайдено</div>
          )}
          {filtered.map(p => {
            const price = p.stock?.price_retail ?? null;
            const priceOld = p.stock?.price_retail_old ?? null;
            const inStock = (p.stock?.stock_qty ?? 0) >= 1;
            const salePercent = price && priceOld
              ? Math.round((1 - price / priceOld) * 100)
              : null;

            return (
              <div key={p.sku} className="shop-card">
                <Link href={`/product/${p.sku}?from=shop`} className="shop-card__clickable">
                  <div className="shop-card__img">
                    {salePercent && salePercent > 0 && (
                      <span className="shop-card__badge-sale">-{salePercent}%</span>
                    )}
                    <ProductImage
                      brand={p.brand}
                      nl1={p.nl1 ?? ''}
                      nl2={p.nl2 ?? undefined}
                      volume={p.volume ?? ''}
                      bc={p.bc}
                      ac={p.ac}
                      type={p.img_type}
                      variant="front"
                      imageUrl={p.image ?? undefined}
                    />
                  </div>
                  <div className="shop-card__body">
                    <div className="shop-card__brand">{p.brand}</div>
                    <div className="shop-card__name">
                      {p.name}{p.volume ? ` ${p.volume}` : ''}
                    </div>
                    <div className="shop-card__badges">
                      {p.product_type && <span className="shop-card__tag">{p.product_type}</span>}
                      {p.color && <span className="shop-card__tag">{p.color}</span>}
                    </div>
                    <div className={'shop-card__stock' + (inStock ? '' : ' out')}>
                      <span className="shop-card__stock-dot" />
                      {inStock ? 'В наявності' : 'Немає'}
                    </div>
                  </div>
                </Link>

                <div className="shop-card__footer">
                  <div className="shop-card__price-wrap">
                    {priceOld && <span className="shop-card__price-old">{priceOld} грн</span>}
                    {price
                      ? <div className="shop-card__price">{price} <span>грн</span></div>
                      : <div className="shop-card__price-na">Ціна за запитом</div>
                    }
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      className={'shop-card__wish' + (wishSkus.has(p.sku) ? ' active' : '')}
                      aria-label={wishSkus.has(p.sku) ? 'Прибрати з обраного' : 'Додати в обране'}
                      onClick={() => toggleWish(p.sku)}
                    >
                      <Heart size={15} fill={wishSkus.has(p.sku) ? '#EF4444' : 'none'} strokeWidth={2} />
                    </button>
                    <button
                      className="shop-card__btn"
                      disabled={!inStock}
                      onClick={() => addItem({
                        sku: p.sku,
                        name: p.name,
                        brand: p.brand,
                        volume: p.volume ?? null,
                        price: price ?? 0,
                        min_order: 1,
                        nl1: p.nl1 ?? '',
                        nl2: p.nl2 ?? undefined,
                        bc: p.bc,
                        ac: p.ac,
                        img_type: p.img_type,
                        imageUrl: p.image ?? undefined,
                      }, 1)}
                    >
                      <Plus size={15} strokeWidth={2.5} />
                      В кошик
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

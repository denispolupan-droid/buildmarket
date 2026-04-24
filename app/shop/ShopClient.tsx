'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { Search, ShoppingCart, Heart } from 'lucide-react';
import ProductImage from '../components/ProductImage';
import { useCart } from '../../lib/cart';
import { useWishlist } from '../../lib/wishlist';
import type { ProductFull, Category } from '../../lib/supabase';

type Props = {
  products: ProductFull[];
  categories: Category[];
  initialSaleOnly?: boolean;
};

export default function ShopClient({ products, categories, initialSaleOnly = false }: Props) {
  const [search, setSearch] = useState('');
  const [selCat, setSelCat] = useState<string | null>(null);
  const [saleOnly, setSaleOnly] = useState(initialSaleOnly);
  const { addItem } = useCart();
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

  const filtered = useMemo(() => {
    let list = products;
    if (matchingSlugs) list = list.filter(p => matchingSlugs.has(p.category_slug ?? ''));
    if (saleOnly) list = list.filter(p => p.stock?.price_retail_old != null && (p.stock?.price_retail ?? 0) > 0);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.brand.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q)
      );
    }
    return list;
  }, [products, matchingSlugs, saleOnly, search]);

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
        <button
          className={'shop-cat-item' + (!selCat ? ' active' : '')}
          onClick={() => setSelCat(null)}
        >
          Всі категорії
          <span className="shop-cat-count">{products.length}</span>
        </button>
        {parentCats.map(cat => (
          <button
            key={cat.slug}
            className={'shop-cat-item' + (selCat === cat.slug ? ' active' : '')}
            onClick={() => setSelCat(selCat === cat.slug ? null : cat.slug)}
          >
            {cat.name}
            <span className="shop-cat-count">{countFor(cat.slug)}</span>
          </button>
        ))}
      </aside>

      {/* Main */}
      <div>
        <div className="shop-search">
          <Search size={16} className="shop-search__icon" />
          <input
            placeholder="Пошук за назвою, артикулом, брендом..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <div className="shop-topbar">
          <h1 className="shop-title">{saleOnly ? 'Акційні товари' : 'Магазин'}</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              onClick={() => setSaleOnly(v => !v)}
              style={{
                height: '34px', padding: '0 14px', borderRadius: '8px', border: 'none',
                background: saleOnly ? '#EF4444' : 'var(--bg-soft)',
                color: saleOnly ? '#fff' : 'var(--text-secondary)',
                fontSize: '13px', fontWeight: 700, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '5px',
              }}
            >
              🔥 Акція
            </button>
            <span className="shop-count">{filtered.length} товарів</span>
          </div>
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
                      }, 1)}
                    >
                      <ShoppingCart size={14} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} />
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

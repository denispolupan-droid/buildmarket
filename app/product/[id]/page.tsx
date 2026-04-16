import Link from 'next/link';
import { notFound } from 'next/navigation';
import ProductImage from '../../components/ProductImage';
import { getProductBySku, getProducts, getCategories } from '../../../lib/supabase';
import ProductTabs from './ProductTabs';
import ProductOrderPanel from './ProductOrderPanel';
import Footer from '../../components/Footer';

const css = `
  /* ── Breadcrumb ── */
  .breadcrumb { padding: 16px 0; display: flex; align-items: center; gap: 8px; font-size: 14px; color: #475569; }
  .breadcrumb a { color: #475569; font-weight: 500; }
  .breadcrumb a:hover { color: #0F172A; }
  .breadcrumb span:last-child { color: #0F172A; font-weight: 600; }

  /* ── Product main layout ── */
  .product-layout { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; padding-bottom: 40px; align-items: stretch; }

  /* ── Gallery card ── */
  .product-gallery {
    background: #F8FAFC; border: 1px solid var(--border); border-radius: 20px;
    padding: 20px; display: flex; flex-direction: column;
  }
  .product-gallery__main {
    height: 380px; flex-shrink: 0; background: var(--bg-soft); border-radius: 14px;
    display: flex; align-items: center; justify-content: center;
    margin-bottom: 16px; position: relative; overflow: hidden;
  }
  .product-gallery__badge {
    position: absolute; top: 12px; left: 12px;
    background: #EF4444; color: #fff; border-radius: 8px;
    padding: 4px 10px; font-size: 13px; font-weight: 700;
  }
  .product-gallery__fav {
    position: absolute; top: 12px; right: 12px;
    width: 36px; height: 36px; border: 1px solid var(--border); border-radius: 50%;
    background: #fff; display: flex; align-items: center; justify-content: center;
    color: var(--text-muted); font-size: 18px; cursor: pointer;
  }
  .product-gallery__fav:hover { color: #EF4444; border-color: #FECACA; }
  .product-gallery__thumbs { display: flex; gap: 10px; margin-top: auto; padding-top: 16px; }
  .product-gallery__thumb {
    width: 76px; height: 76px; background: var(--bg-soft); border-radius: 12px;
    border: 2px solid transparent; display: flex; align-items: center;
    justify-content: center; cursor: pointer; transition: border-color 0.15s; overflow: hidden;
  }
  .product-gallery__thumb:hover { border-color: #2563EB; }
  .product-gallery__thumb.is-active { border-color: #2563EB; }

  /* ── Product info card ── */
  .product-info {
    background: #fff; border: 1px solid var(--border); border-radius: 20px;
    padding: 24px; display: flex; flex-direction: column;
  }
  .product-info__brand { font-size: 12px; color: #7A8798; margin-bottom: 6px; }
  .product-info__title { font-size: 22px; font-weight: 700; color: var(--text-primary); line-height: 1.25; margin-bottom: 10px; }
  .product-info__badges { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 10px; }
  .badge { height: 26px; padding: 0 12px; border-radius: 13px; background: var(--bg-soft); font-size: 12px; color: var(--text-secondary); display: inline-flex; align-items: center; }
  .product-info__stock { font-size: 13px; color: var(--text-secondary); display: flex; align-items: center; gap: 7px; margin-bottom: 4px; }
  .stock-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--status-instock); flex-shrink: 0; }
  .stock-dot.out { background: #C0392B; }
  .stock-dot.order { background: #D8B14A; }
  .product-info__sku { font-size: 12px; color: var(--text-muted); margin-bottom: 2px; }
  .product-info__divider { border: none; border-top: 1px solid var(--border); margin: 14px 0; }

  /* price */
  .product-info__price-unit { font-size: 28px; font-weight: 700; color: var(--text-primary); line-height: 1; margin-bottom: 4px; }
  .product-info__price-row-sub { display: flex; align-items: baseline; gap: 10px; }
  .product-info__price-old { font-size: 13px; color: #97A3B3; text-decoration: line-through; }
  .product-info__price-pack { font-size: 13px; font-weight: 600; color: var(--text-secondary); }

  /* qty stepper */
  .product-info__qty-row { display: flex; align-items: center; gap: 12px; margin-top: 14px; flex-wrap: wrap; }
  .qty-label { font-size: 13px; color: var(--text-secondary); white-space: nowrap; }
  .qty-stepper { display: flex; align-items: stretch; border: 1px solid var(--border); border-radius: 10px; overflow: hidden; }
  .qty-stepper__btn { width: 38px; height: 38px; border: none; background: var(--bg-soft); color: var(--text-primary); font-size: 18px; font-weight: 500; display: flex; align-items: center; justify-content: center; }
  .qty-stepper__btn:hover { background: var(--border); }
  .qty-stepper__val { width: 52px; height: 38px; border: none; border-left: 1px solid var(--border); border-right: 1px solid var(--border); background: #fff; text-align: center; font-size: 15px; font-weight: 600; color: var(--text-primary); outline: none; }
  .qty-subtotal { font-size: 13px; color: var(--text-secondary); }
  .qty-subtotal strong { color: var(--text-primary); font-size: 16px; font-weight: 700; }
  .product-info__min-order { font-size: 12px; color: var(--text-muted); margin-top: 6px; }

  /* buttons */
  .product-info__btn-row { display: flex; align-items: center; gap: 10px; margin-top: 14px; }
  .btn-order { flex: 1; height: 44px; border: none; border-radius: 10px; background: #2563EB; color: #fff; font-size: 15px; font-weight: 700; cursor: pointer; }
  .btn-order:hover { background: #1D4ED8; }
  .btn-fav { width: 44px; height: 44px; border: 1px solid var(--border); border-radius: 50%; background: #fff; display: flex; align-items: center; justify-content: center; color: var(--text-muted); font-size: 18px; flex-shrink: 0; cursor: pointer; }
  .btn-fav:hover { color: #EF4444; border-color: #FECACA; background: #FEF2F2; }

  /* meta */
  .product-info__meta { margin-top: 14px; display: flex; flex-direction: column; gap: 5px; }
  .product-info__meta-row { display: flex; gap: 8px; font-size: 13px; }
  .product-info__meta-label { color: var(--text-muted); min-width: 110px; flex-shrink: 0; }
  .product-info__meta-value { color: var(--text-primary); font-weight: 500; }

  /* ── Tabs ── */
  .product-tabs { background: #fff; border: 1px solid var(--border); border-radius: 20px; margin-bottom: 32px; overflow: hidden; }
  .product-tabs__nav { display: flex; border-bottom: 1px solid var(--border); }
  .product-tabs__tab { padding: 18px 28px; font-size: 15px; font-weight: 500; color: var(--text-secondary); border: none; background: none; border-bottom: 3px solid transparent; margin-bottom: -1px; cursor: pointer; }
  .product-tabs__tab.is-active { color: #1E3A5F; font-weight: 700; border-bottom-color: #2563EB; }
  .product-tabs__content { padding: 32px; }
  .product-tabs__desc { font-size: 15px; line-height: 1.8; color: var(--text-secondary); white-space: pre-line; }
  .chars-table { width: 100%; border-collapse: collapse; }
  .chars-table tr:nth-child(odd) td { background: var(--bg-soft); }
  .chars-table td { padding: 11px 16px; font-size: 14px; color: var(--text-primary); border: 1px solid var(--border); }
  .chars-table td:first-child { color: var(--text-secondary); width: 42%; font-weight: 500; }

  /* ── Related ── */
  .section-title { font-size: 22px; font-weight: 700; color: var(--text-primary); margin-bottom: 20px; }
  .products-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 24px; }
  .product-card { position: relative; background: #fff; border: 1px solid var(--border); border-radius: 14px; padding: 16px; display: flex; flex-direction: column; transition: box-shadow 0.2s; }
  .product-card:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.08); }
  .product-card__link { position: absolute; inset: 0; z-index: 0; border-radius: 20px; }
  .product-card__image-wrap { position: relative; height: 180px; display: flex; align-items: center; justify-content: center; margin-bottom: 16px; background: var(--bg-soft); border-radius: 14px; }
  .product-card__fav { position: absolute; top: 10px; right: 10px; width: 32px; height: 32px; border: 1px solid var(--border); border-radius: 50%; background: #fff; display: flex; align-items: center; justify-content: center; color: var(--text-muted); position: relative; z-index: 1; }
  .product-card__brand { font-size: 13px; color: #7A8798; margin-bottom: 6px; position: relative; }
  .product-card__title { font-size: 16px; font-weight: 700; color: var(--text-primary); margin-bottom: 6px; line-height: 1.35; position: relative; }
  .product-card__volume { font-size: 14px; color: var(--text-secondary); margin-bottom: 10px; position: relative; }
  .product-card__price-row { display: flex; flex-direction: column; gap: 4px; margin: 10px 0 14px; position: relative; }
  .product-card__price-unit { font-size: 20px; font-weight: 700; color: var(--text-primary); }
  .product-card__price-pack { font-size: 15px; font-weight: 600; color: var(--text-secondary); }
  .product-card__button { margin-top: auto; width: 140px; height: 44px; border: none; border-radius: 10px; background: #2563EB; color: #fff; font-size: 14px; font-weight: 700; position: relative; z-index: 1; cursor: pointer; }
  .product-card__button:hover { background: #1D4ED8; }

  /* ── Footer ── */
  .site-footer { margin-top: 48px; padding: 40px 0 0; background: #fff; border-top: 1px solid var(--border); }
  .footer-grid { display: grid; grid-template-columns: 1.2fr 1fr 1fr 1fr; gap: 32px; }
  .footer-logo { height: 48px; mix-blend-mode: multiply; margin-bottom: 12px; }
  .footer-slogan { font-size: 14px; color: var(--text-secondary); margin-bottom: 10px; }
  .footer-phone { font-size: 15px; font-weight: 600; color: var(--text-primary); display: block; margin-bottom: 6px; }
  .footer-address { font-size: 13px; color: var(--text-muted); }
  .footer-title { margin-bottom: 14px; font-size: 16px; font-weight: 700; color: var(--text-primary); }
  .footer-links { display: flex; flex-direction: column; gap: 10px; }
  .footer-links a { color: var(--text-secondary); font-size: 14px; }
  .footer-bottom { margin-top: 32px; padding: 18px 0; border-top: 1px solid var(--border); font-size: 14px; color: var(--text-muted); }
`;

function stockLabel(stockQty: number, minOrder: number) {
  return stockQty >= minOrder ? 'В наявності' : 'Немає в наявності';
}

function stockDot(stockQty: number, minOrder: number) {
  return stockQty >= minOrder ? 'stock-dot' : 'stock-dot out';
}

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: sku } = await params;

  const [product, allInCategory, categories] = await Promise.all([
    getProductBySku(sku),
    getProducts({ category: undefined }),
    getCategories(),
  ]);

  if (!product) notFound();

  const priceUnit = product.stock?.price_unit ?? 0;
  const priceOld  = product.stock?.price_old  ?? null;
  const stockQty  = product.stock?.stock_qty  ?? 0;
  const pricePack = priceUnit * product.pack_qty;

  const related = allInCategory
    .filter((p) => p.sku !== product.sku && p.category_slug === product.category_slug)
    .slice(0, 3);

  const categoryName = categories.find((c) => c.slug === product.category_slug)?.name ?? 'Каталог';

  return (
    <>
      <style dangerouslySetInnerHTML={{__html: css}} />
      <div style={{ background: '#fff', minHeight: '100vh' }}>
      <div className="page-container" style={{paddingTop: '8px', paddingBottom: '48px'}}>

        <div className="breadcrumb">
          <Link href="/">Головна</Link>
          <span>›</span>
          <Link href="/catalog">{categoryName}</Link>
          <span>›</span>
          <span>{product.name}</span>
        </div>

        <div className="product-layout">

          {/* Галерея */}
          <div className="product-gallery">
            <div className="product-gallery__main">
              <ProductImage brand={product.brand} nl1={product.nl1 ?? ''} nl2={product.nl2 ?? undefined}
                            volume={product.volume ?? ''} bc={product.bc} ac={product.ac}
                            type={product.img_type} variant="front" />
              {priceOld && priceUnit > 0 && (
                <span className="product-gallery__badge">
                  -{Math.round((1 - priceUnit / priceOld) * 100)}%
                </span>
              )}
              <button className="product-gallery__fav">♡</button>
            </div>
            <div className="product-gallery__thumbs">
              {(['front','angle','label','angle'] as const).map((variant, i) => (
                <div key={i} className={"product-gallery__thumb" + (i === 0 ? " is-active" : "")}>
                  <ProductImage brand={product.brand} nl1={product.nl1 ?? ''} nl2={product.nl2 ?? undefined}
                                volume={product.volume ?? ''} bc={product.bc} ac={product.ac}
                                type={product.img_type} variant={variant} />
                </div>
              ))}
            </div>
          </div>

          {/* Інформація */}
          <div className="product-info">
            <div className="product-info__brand">{product.brand}</div>
            <h1 className="product-info__title">{product.name}</h1>

            <div className="product-info__badges">
              {product.volume       && <span className="badge">{product.volume}</span>}
              {product.product_type && <span className="badge">{product.product_type}</span>}
              {product.color        && <span className="badge">{product.color}</span>}
            </div>

            <div className="product-info__stock">
              <span className={stockDot(stockQty, product.min_order)}></span>
              {stockLabel(stockQty, product.min_order)}
            </div>
            <div className="product-info__sku">Артикул: {product.sku}</div>

            <hr className="product-info__divider" />

            {priceUnit > 0 ? (
              <>
                <div className="product-info__price-unit">{priceUnit} грн / шт</div>
                <div className="product-info__price-row-sub">
                  {priceOld && <span className="product-info__price-old">{priceOld} грн</span>}
                  <span className="product-info__price-pack">
                    {pricePack.toLocaleString('uk-UA')} грн / уп ({product.pack_qty} шт)
                  </span>
                </div>
              </>
            ) : (
              <div className="product-info__price-unit" style={{fontSize:'20px',color:'var(--text-muted)'}}>Ціна за запитом</div>
            )}

            <hr className="product-info__divider" />

            <ProductOrderPanel
              priceUnit={priceUnit}
              minOrder={product.min_order}
            />

            <hr className="product-info__divider" />
            <div className="product-info__meta">
              <div className="product-info__meta-row">
                <span className="product-info__meta-label">Категорія:</span>
                <span className="product-info__meta-value">
                  <Link href="/catalog" style={{color:'var(--brand-main)'}}>{categoryName}</Link>
                </span>
              </div>
              <div className="product-info__meta-row">
                <span className="product-info__meta-label">Бренд:</span>
                <span className="product-info__meta-value">{product.brand}</span>
              </div>
              <div className="product-info__meta-row">
                <span className="product-info__meta-label">Упаковка:</span>
                <span className="product-info__meta-value">{product.pack_qty} шт</span>
              </div>
              <div className="product-info__meta-row">
                <span className="product-info__meta-label">Доставка:</span>
                <span className="product-info__meta-value">Нова Пошта, Укрпошта, самовивіз</span>
              </div>
            </div>
          </div>
        </div>

        <ProductTabs
          description={product.description}
          characteristics={product.characteristics}
        />

        {/* Схожі товари */}
        {related.length > 0 && (
          <>
            <h2 className="section-title">Схожі товари</h2>
            <div className="products-grid">
              {related.map((p) => {
                const relPrice = p.stock?.price_unit ?? 0;
                const relPricePack = (relPrice * p.pack_qty).toLocaleString('uk-UA');
                return (
                  <div key={p.sku} className="product-card">
                    <Link href={`/product/${p.sku}`} className="product-card__link" aria-label={p.name} />
                    <div className="product-card__image-wrap">
                      <ProductImage brand={p.brand} nl1={p.nl1 ?? ''} nl2={p.nl2 ?? undefined}
                                    volume={p.volume ?? ''} bc={p.bc} ac={p.ac} type={p.img_type} />
                      <button className="product-card__fav">&#9825;</button>
                    </div>
                    <div className="product-card__brand">{p.brand}</div>
                    <div className="product-card__title">{p.name}</div>
                    <div className="product-card__volume">{p.volume}</div>
                    <div className="product-card__price-row">
                      {relPrice > 0 ? (
                        <>
                          <span className="product-card__price-unit">{relPrice} грн / шт</span>
                          <span className="product-card__price-pack">{relPricePack} грн / уп</span>
                        </>
                      ) : (
                        <span className="product-card__price-unit" style={{fontSize:'15px',color:'var(--text-muted)'}}>Ціна за запитом</span>
                      )}
                    </div>
                    <button className="product-card__button">В кошик</button>
                  </div>
                );
              })}
            </div>
          </>
        )}

      </div>
      </div>

      <Footer />
    </>
  );
}

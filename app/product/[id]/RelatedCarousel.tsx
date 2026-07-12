'use client';

import { useState, useRef } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Plus, Heart } from 'lucide-react';
import ProductImage from '../../components/ProductImage';
import { RatingBadge } from '../../components/StarRating';
import { useCart } from '../../../lib/cart';
import { useWishlist } from '../../../lib/wishlist';
import type { ProductFull, ReviewStats } from '../../../lib/supabase';
import { tFilterValue } from '../../../lib/translations-ru';

const VISIBLE = 5;
const GAP = 16;

export default function RelatedCarousel({ products, retail = false, reviewStats }: { products: ProductFull[]; retail?: boolean; reviewStats?: ReviewStats }) {
  const pathname = usePathname();
  const lang = pathname.startsWith('/ru') ? 'ru' : 'uk';
  const t = (uk: string, ru: string) => lang === 'ru' ? ru : uk;
  const [cur, setCur] = useState(0);
  const [offset, setOffset] = useState(0);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [inputVals,  setInputVals]  = useState<Record<string, string>>({});
  const wrapRef = useRef<HTMLDivElement>(null);
  const { addItem } = useCart();
  const { toggle, isLiked } = useWishlist();

  function getQty(sku: string, min: number) { return quantities[sku] ?? min; }
  function getInputVal(sku: string, min: number) { return inputVals[sku] ?? String(min); }
  function commitInput(sku: string, min: number) {
    const v = parseInt(inputVals[sku] ?? '', 10);
    const safe = isNaN(v) || v < min ? min : v;
    setQuantities(prev => ({ ...prev, [sku]: safe }));
    setInputVals(prev => ({ ...prev, [sku]: String(safe) }));
  }

  const maxIndex = Math.max(0, products.length - VISIBLE);

  function moveTo(idx: number) {
    const next = Math.max(0, Math.min(maxIndex, idx));
    if (wrapRef.current) {
      const w    = wrapRef.current.offsetWidth;
      const step = (w - (VISIBLE - 1) * GAP) / VISIBLE + GAP;
      setOffset(next * step);
    }
    setCur(next);
  }

  if (products.length === 0) return null;

  const arrowStyle = (enabled: boolean): React.CSSProperties => ({
    width: '40px', height: '40px', borderRadius: '50%',
    background: '#fff', border: '1px solid #E2E8F0',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: enabled ? '#475569' : '#CBD5E1',
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
    cursor: enabled ? 'pointer' : 'default',
    flexShrink: 0,
  });

  return (
    <div style={{ position: 'relative' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <h2 className="section-title" style={{ margin: 0 }}>{t('Схожі товари', 'Похожие товары')}</h2>
        <div className="related-carousel-arrows" style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => moveTo(cur - 1)} disabled={cur === 0} style={arrowStyle(cur > 0)}>
            <ChevronLeft size={18} strokeWidth={2} />
          </button>
          <button onClick={() => moveTo(cur + 1)} disabled={cur >= maxIndex} style={arrowStyle(cur < maxIndex)}>
            <ChevronRight size={18} strokeWidth={2} />
          </button>
        </div>
      </div>

      {/* Track */}
      <div ref={wrapRef} className="related-carousel-wrap" style={{ overflowX: 'hidden', overflowY: 'visible', paddingBottom: '8px', marginBottom: '-8px' }}>
        <div className="related-carousel-track" style={{
          display: 'flex', gap: `${GAP}px`,
          transform: `translateX(-${offset}px)`,
          transition: 'transform 0.38s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
        }}>
          {products.map(p => {
            const relPromo    = retail ? (p.stock?.price_promo ?? null) : null;
            const relPrice    = retail ? (relPromo ?? p.stock?.price_retail ?? 0) : (p.stock?.price_unit ?? 0);
            const relPriceOld = retail ? (relPromo ? (p.stock?.price_retail ?? null) : (p.stock?.price_retail_old ?? null)) : (p.stock?.price_old ?? null);
            const relStock    = p.stock?.stock_qty  ?? 0;
            const stockStatus = p.stock?.stock_status;
            const relMinOrder = retail ? 1 : p.min_order;
            const isSale      = relPriceOld != null && relPrice > 0 && relPrice < relPriceOld;
            const inStock     = stockStatus === 'in_stock' ? true
                              : stockStatus === 'out_of_stock' ? false
                              : relStock >= relMinOrder;
            const packFrac    = relMinOrder / p.pack_qty;
            const packStr     = packFrac % 1 === 0 ? `${packFrac}` : packFrac.toFixed(1);
            const specs: { label: string; value: string }[] = [];
            const colorVal = p.color ?? p.characteristics.find(c => /^Колір/i.test(c.label))?.value ?? null;
            if (p.volume) specs.push({ label: /кг|г$/.test(p.volume) ? t('Вага', 'Вес') : t("Об'єм", 'Объём'), value: p.volume });
            if (colorVal) specs.push({ label: t('Колір', 'Цвет'), value: tFilterValue(colorVal, lang) });

            const relDisplayName = lang === 'ru' ? (p.name_ru ?? p.name) : p.name;
            return (
              <div
                key={p.sku}
                className="product-card"
                style={{ flex: `0 0 calc((100% - ${(VISIBLE - 1) * GAP + 2}px) / ${VISIBLE})` }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '6px', marginBottom: '10px' }}>
                  <Link href={`${lang === 'ru' ? '/ru' : ''}/product/${p.sku}${retail ? '?from=shop' : ''}`} className="pc-name" style={{ textDecoration: 'none', color: 'inherit' }} title={relDisplayName}>{relDisplayName}</Link>
                  {isSale && <span style={{ flexShrink: 0, background: '#EF4444', color: '#fff', fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '5px', whiteSpace: 'nowrap' }}>−{Math.round((1 - relPrice / relPriceOld!) * 100)}%</span>}
                </div>

                <Link href={`${lang === 'ru' ? '/ru' : ''}/product/${p.sku}${retail ? '?from=shop' : ''}`} className="pc-top" style={{ textDecoration: 'none', display: 'flex' }}>
                  <div className="pc-img">
                    <ProductImage brand={p.brand} nl1={p.nl1 ?? ''} nl2={p.nl2 ?? undefined}
                                  volume={p.volume ?? ''} bc={p.bc} ac={p.ac} type={p.img_type}
                                  imageUrl={p.image ?? undefined} />
                  </div>
                  <div className="pc-info">
                    <div className="pc-sku">{t('Арт.', 'Арт.')} {p.sku}</div>
                    {/* Fixed-height slot regardless of whether this product has reviews —
                        otherwise cards with/without a badge fall out of row alignment. */}
                    <div style={{ height: '15px', marginBottom: '4px', display: 'flex', alignItems: 'center' }}>
                      {reviewStats?.[p.sku] && <RatingBadge avg={reviewStats[p.sku].avg} count={reviewStats[p.sku].count} size={11} />}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '5px' }}>
                      {isSale && relPriceOld && <span className="pc-price-old">{relPriceOld} грн</span>}
                      {relPrice > 0
                        ? <span className="pc-price">{relPrice} грн</span>
                        : <span style={{ fontSize: 13, color: '#94A3B8' }}>{t('За запитом', 'По запросу')}</span>}
                    </div>
                    {inStock
                      ? <div style={{ fontSize: '11px', color: '#15803D', fontWeight: 600, marginBottom: '3px' }}>● {t('в наявності', 'в наличии')}</div>
                      : <div style={{ fontSize: '11px', color: '#DC2626', fontWeight: 600, marginBottom: '3px' }}>● {t('немає', 'нет')}</div>}
                    <div style={{ fontSize: '11px', color: '#64748B' }}>{t('В упаковці:', 'В упаковке:')} {p.pack_qty} шт</div>
                  </div>
                </Link>

                {specs.length > 0 && (
                  <div className="pc-tags">
                    {specs.slice(0, 3).map(s => <span key={s.label} className="pc-tag" title={`${s.label}: ${s.value}`}>{s.label}: {s.value}</span>)}
                    {specs.length > 3 && <span className="pc-tag" style={{ color: '#94A3B8' }}>+{specs.length - 3}</span>}
                  </div>
                )}

                {!retail && (
                  <>
                    <div className="pc-minorder">{t('Мінімальне замовлення', 'Минимальный заказ')}</div>
                    <div className="pc-minorder-val">{relMinOrder} рс / {packStr} уп</div>
                  </>
                )}

                <div className="pc-actions">
                  <input
                    type="number"
                    value={getInputVal(p.sku, relMinOrder)}
                    min={relMinOrder}
                    disabled={!inStock}
                    onChange={e => setInputVals(prev => ({ ...prev, [p.sku]: e.target.value }))}
                    onBlur={() => commitInput(p.sku, relMinOrder)}
                    onKeyDown={e => e.key === 'Enter' && commitInput(p.sku, relMinOrder)}
                    style={{ width: '48px', height: '38px', borderRadius: '8px', border: '1px solid #E2E8F0', background: '#fff', textAlign: 'center', fontSize: '13px', fontWeight: 700, color: '#0F172A', outline: 'none' }}
                  />
                  <button
                    className="pc-btn-cart"
                    disabled={!inStock}
                    style={!inStock ? { opacity: 0.4, cursor: 'default' } : undefined}
                    onClick={() => inStock && addItem({ sku: p.sku, name: p.name, name_ru: p.name_ru ?? null, brand: p.brand, volume: p.volume, price: relPrice, min_order: relMinOrder, nl1: p.nl1 ?? '', nl2: p.nl2 ?? undefined, bc: p.bc, ac: p.ac, img_type: p.img_type, imageUrl: p.image ?? undefined, is_promo: retail && !!(p.stock?.price_promo) }, getQty(p.sku, relMinOrder))}
                  >
                    <Plus size={13} strokeWidth={2.5} /> {t('В кошик', 'В корзину')}
                  </button>
                  <button
                    className="pc-btn-icon"
                    onClick={() => toggle(p.sku)}
                    style={{
                      color: isLiked(p.sku) ? '#EF4444' : undefined,
                      background: isLiked(p.sku) ? '#FEF2F2' : undefined,
                      borderColor: isLiked(p.sku) ? '#FECACA' : undefined,
                    }}
                  >
                    <Heart size={13} strokeWidth={2} fill={isLiked(p.sku) ? '#EF4444' : 'none'} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Dots */}
      {maxIndex > 0 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: '6px', marginTop: '16px' }}>
          {Array.from({ length: maxIndex + 1 }).map((_, i) => (
            <button key={i} onClick={() => moveTo(i)} style={{
              width: i === cur ? '24px' : '8px', height: '8px', borderRadius: '4px',
              background: i === cur ? '#1E3A5F' : '#CBD5E1',
              border: 'none', padding: 0, cursor: 'pointer',
              transition: 'all 0.3s ease',
            }} />
          ))}
        </div>
      )}
    </div>
  );
}

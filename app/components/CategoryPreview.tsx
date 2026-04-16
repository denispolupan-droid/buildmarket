'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Heart, Eye, Plus } from 'lucide-react';
import ProductImage from './ProductImage';
import { CAT_COLORS, CAT_ICONS } from './CategoryCarousel';
import type { ProductFull, Category } from '../../lib/supabase';

function getCatBullets(name: string, slug: string): string[] {
  const n = (name + ' ' + slug).toLowerCase();
  if (n.includes('silicone') || n.includes('sealant') || n.includes('герметик'))
    return [
      'Силіконові герметики (універсальні, санітарні, високотемпературні)',
      'Акрилові герметики (під фарбування, для внутрішніх робіт)',
      'Поліуретанові герметики',
      'Спеціалізовані формули для різних застосувань',
    ];
  if (n.includes('foam') || n.includes('піна'))
    return [
      'Однокомпонентні піни (побутові та професійні)',
      'Двокомпонентні піни для промислового використання',
      'Вогнестійкі монтажні піни класу В1',
      'Зимові формули: застосування до −10°C',
    ];
  if (n.includes('adhesive') || n.includes('клей'))
    return [
      'Монтажні клеї для важких матеріалів',
      'Контактні клеї швидкого схоплювання',
      'Конструкційні клеї підвищеної міцності',
      'Спеціальні клеї (для дзеркал, полістиролу)',
    ];
  if (n.includes('acrylic'))
    return [
      'Акрилові герметики для внутрішніх робіт',
      'Варіанти під фарбування та безбарвні',
      'Еластичні акрилові шпаклівки',
      'Герметики для вікон і дверей',
    ];
  return [
    'Широкий вибір продукції для будівництва',
    'Оптові ціни для дилерів та підрядників',
    'Технічна документація та сертифікати',
    'Консультація спеціаліста за запитом',
  ];
}

type Props = {
  categories: Category[];
  products: ProductFull[];
  selectedSlug: string;
};

const navBtnStyle: React.CSSProperties = {
  width: '32px', height: '32px', borderRadius: '8px',
  border: '1px solid #E2E8F0', background: '#fff',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  color: '#64748B', flexShrink: 0, cursor: 'pointer',
};

const actionBtnStyle: React.CSSProperties = {
  width: '44px', height: '44px', borderRadius: '10px',
  border: '1px solid #E2E8F0', background: '#fff',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  color: '#64748B', flexShrink: 0, cursor: 'pointer',
};

export default function CategoryPreview({ categories, products, selectedSlug }: Props) {
  const [prodIdx, setProdIdx] = useState(0);
  const [qty, setQty]         = useState(1);
  const [liked, setLiked]     = useState(false);

  const catIndex    = categories.findIndex(c => c.slug === selectedSlug);
  const category    = categories[catIndex] ?? categories[0];
  const iconColor   = CAT_COLORS[(catIndex + 1) % CAT_COLORS.length];
  const Icon        = CAT_ICONS[(catIndex + 1) % CAT_ICONS.length];
  const bullets     = category ? getCatBullets(category.name, category.slug) : [];
  const catProducts = products.filter(p => p.category_slug === selectedSlug).slice(0, 8);
  const total       = catProducts.length;

  useEffect(() => {
    setProdIdx(0);
    setLiked(false);
    setQty(catProducts[0]?.min_order ?? 1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSlug]);

  const product   = catProducts[prodIdx] ?? null;
  const priceUnit = product?.stock?.price_unit ?? 0;
  const priceOld  = product?.stock?.price_old  ?? null;
  const stockQty  = product?.stock?.stock_qty  ?? 0;
  const isSale    = priceOld != null && priceUnit > 0 && priceUnit < priceOld;
  const discount  = isSale ? Math.round((1 - priceUnit / priceOld!) * 100) : 0;
  const packFrac  = product ? (product.min_order / product.pack_qty) : 0;
  const packStr   = packFrac % 1 === 0 ? `${packFrac}` : packFrac.toFixed(1);

  function prev() {
    const i = Math.max(0, prodIdx - 1);
    setProdIdx(i);
    setQty(catProducts[i]?.min_order ?? 1);
    setLiked(false);
  }
  function next() {
    const i = Math.min(total - 1, prodIdx + 1);
    setProdIdx(i);
    setQty(catProducts[i]?.min_order ?? 1);
    setLiked(false);
  }

  // Specs: fixed fields first, then characteristics that don't duplicate them
  const specs: { label: string; value: string }[] = [];
  if (product?.volume)       specs.push({ label: "Об'єм",  value: product.volume });
  if (product?.color)        specs.push({ label: 'Колір',  value: product.color });
  if (product?.product_type) specs.push({ label: 'Тип',    value: product.product_type });

  const fixedLabels = new Set(specs.map(s => s.label.toLowerCase()));
  product?.characteristics.forEach(c => {
    if (!fixedLabels.has(c.label.toLowerCase())) {
      specs.push({ label: c.label, value: c.value });
    }
  });

  if (!category) return null;

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1fr 1fr',
      background: '#F0F9FF',
      border: '1px solid #E2E8F0', borderRadius: '18px',
      overflow: 'hidden', marginTop: '16px',
      boxShadow: '0 2px 12px rgba(0,0,0,0.05)',
      maxWidth: '860px', margin: '16px auto 0',
    }}>

      {/* ── Left panel ── */}
      <div style={{
        padding: '32px 28px',
        borderRight: '1px solid #E2E8F0',
        display: 'flex', flexDirection: 'column',
      }}>

        {/* Icon + category name */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '24px' }}>
          <div style={{
            width: '52px', height: '52px', borderRadius: '14px', flexShrink: 0,
            background: iconColor,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Icon size={26} color="#fff" strokeWidth={1.75} />
          </div>
          <h2 style={{ fontSize: '20px', fontWeight: 800, color: '#0F172A', lineHeight: 1.2 }}>
            {category.name}
          </h2>
        </div>

        {/* Bullets */}
        <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '28px', flex: 1 }}>
          {bullets.map((b, i) => (
            <li key={i} style={{ display: 'flex', gap: '8px', fontSize: '14px', color: '#374151', lineHeight: 1.55 }}>
              <span style={{ color: '#2563EB', fontWeight: 700, flexShrink: 0 }}>•</span>
              {b}
            </li>
          ))}
        </ul>

        {/* CTA */}
        <Link href={`/catalog?category=${category.slug}`} style={{
          display: 'inline-flex', alignItems: 'center', gap: '8px',
          height: '44px', padding: '0 22px', borderRadius: '10px',
          background: '#2563EB', color: '#fff', fontSize: '14px', fontWeight: 700,
          alignSelf: 'flex-start',
        }}>
          Перейти до категорії →
        </Link>
      </div>

      {/* ── Right panel ── */}
      <div style={{ background: '#fff', padding: '24px 24px' }}>

        {/* Header: label + navigation */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
            Приклади товарів
          </span>

          {/* Always visible navigation */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              onClick={prev}
              disabled={prodIdx === 0}
              style={{
                ...navBtnStyle,
                color: prodIdx === 0 ? '#CBD5E1' : '#475569',
                cursor: prodIdx === 0 ? 'default' : 'pointer',
              }}
            >
              <ChevronLeft size={15} strokeWidth={2} />
            </button>
            <span style={{
              fontSize: '13px', fontWeight: 600, color: '#475569',
              minWidth: '40px', textAlign: 'center',
              background: '#F1F5F9', borderRadius: '6px', padding: '3px 8px',
            }}>
              {total > 0 ? `${prodIdx + 1} / ${total}` : '—'}
            </span>
            <button
              onClick={next}
              disabled={prodIdx >= total - 1}
              style={{
                ...navBtnStyle,
                color: prodIdx >= total - 1 ? '#CBD5E1' : '#475569',
                cursor: prodIdx >= total - 1 ? 'default' : 'pointer',
              }}
            >
              <ChevronRight size={15} strokeWidth={2} />
            </button>
          </div>
        </div>

        {/* Product card */}
        {product ? (
          <div style={{
            background: '#F8FAFC', borderRadius: '14px', padding: '20px',
            border: '1px solid #F1F5F9',
          }}>

            {/* Top: image + info */}
            <div style={{ display: 'flex', gap: '16px', marginBottom: '16px', alignItems: 'flex-start' }}>
              {/* Image */}
              <div style={{
                width: '100px', height: '100px', flexShrink: 0,
                background: '#fff', borderRadius: '10px', border: '1px solid #E2E8F0',
                overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <ProductImage
                  brand={product.brand} nl1={product.nl1 ?? ''} nl2={product.nl2 ?? undefined}
                  volume={product.volume ?? ''} bc={product.bc} ac={product.ac} type={product.img_type}
                />
              </div>

              {/* Name / SKU / Price */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', marginBottom: '4px' }}>
                  <span style={{ fontSize: '15px', fontWeight: 700, color: '#0F172A', lineHeight: 1.3 }}>
                    {product.name}
                  </span>
                  {isSale && (
                    <span style={{
                      flexShrink: 0, background: '#EF4444', color: '#fff',
                      fontSize: '11px', fontWeight: 700, padding: '3px 8px', borderRadius: '6px',
                      whiteSpace: 'nowrap',
                    }}>
                      АКЦІЯ −{discount}%
                    </span>
                  )}
                </div>

                <div style={{ fontSize: '12px', color: '#94A3B8', marginBottom: '10px' }}>
                  {product.sku}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  {isSale && priceOld && (
                    <span style={{ fontSize: '13px', color: '#94A3B8', textDecoration: 'line-through' }}>
                      {priceOld} грн
                    </span>
                  )}
                  {priceUnit > 0 ? (
                    <span style={{ fontSize: '26px', fontWeight: 800, color: '#0F172A', lineHeight: 1 }}>
                      {priceUnit} грн
                    </span>
                  ) : (
                    <span style={{ fontSize: '14px', color: '#94A3B8' }}>За запитом</span>
                  )}
                  {stockQty > 0 && (
                    <span style={{
                      background: '#DCFCE7', color: '#15803D',
                      fontSize: '12px', fontWeight: 600, padding: '3px 10px', borderRadius: '20px',
                    }}>
                      {stockQty} шт
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Specs grid */}
            {specs.length > 0 && (
              <div style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 24px',
                marginBottom: '12px', paddingBottom: '14px',
                borderBottom: '1px solid #E2E8F0',
              }}>
                {specs.slice(0, 6).map(s => (
                  <div key={s.label}>
                    <div style={{ fontSize: '11px', color: '#94A3B8', marginBottom: '2px' }}>{s.label}</div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#0F172A' }}>{s.value}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Min order */}
            <div style={{ marginBottom: '14px' }}>
              <div style={{ fontSize: '12px', color: '#94A3B8', marginBottom: '2px' }}>Мінімальне замовлення</div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#2563EB' }}>
                {product.min_order} рс / {packStr} уп
              </div>
            </div>

            {/* Actions: heart | qty | В кошик | eye */}
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button
                onClick={() => setLiked(l => !l)}
                style={{
                  ...actionBtnStyle,
                  color: liked ? '#EF4444' : '#64748B',
                  background: liked ? '#FEF2F2' : '#fff',
                  border: `1px solid ${liked ? '#FECACA' : '#E2E8F0'}`,
                }}
              >
                <Heart size={16} strokeWidth={2} fill={liked ? '#EF4444' : 'none'} />
              </button>

              <input
                type="number"
                value={qty}
                min={product.min_order}
                onChange={e => {
                  const v = parseInt(e.target.value, 10);
                  if (!isNaN(v) && v >= product.min_order) setQty(v);
                }}
                style={{
                  width: '64px', height: '44px', borderRadius: '10px',
                  border: '1px solid #E2E8F0', background: '#fff',
                  textAlign: 'center', fontSize: '15px', fontWeight: 700,
                  color: '#0F172A', outline: 'none',
                }}
              />

              <button style={{
                flex: 1, height: '44px', borderRadius: '10px',
                background: '#2563EB', color: '#fff', border: 'none',
                fontSize: '14px', fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                cursor: 'pointer',
              }}>
                <Plus size={15} strokeWidth={2.5} /> В кошик
              </button>

              <Link href={`/product/${product.sku}`} style={{ ...actionBtnStyle, textDecoration: 'none' }}>
                <Eye size={15} strokeWidth={2} />
              </Link>
            </div>

          </div>
        ) : (
          <div style={{
            background: '#F8FAFC', borderRadius: '14px', padding: '48px 24px',
            textAlign: 'center', border: '1px solid #F1F5F9',
          }}>
            <div style={{ fontSize: '15px', color: '#94A3B8' }}>Немає товарів у цій категорії</div>
          </div>
        )}
      </div>
    </div>
  );
}

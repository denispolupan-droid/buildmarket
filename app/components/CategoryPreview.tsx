'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Heart, Eye, Plus, Check } from 'lucide-react';
import ProductImage from './ProductImage';
import { getCatIcon, getCatColor, catDescription } from './CategoryCarousel';
import { useCart } from '../../lib/cart';
import { useWishlist } from '../../lib/wishlist';
import type { ProductFull, Category } from '../../lib/supabase';
import type { UserRole } from '../../lib/user-role';

const CAT_BULLETS: Record<string, string[]> = {
  'germetyky':          ['Силіконові — універсальні та санітарні','Акрилові — під фарбування, для внутрішніх робіт','Поліуретанові та нейтральні','МС-полімерні та жаростійкі'],
  'montazhna-pina':     ['Піна під пістолет — для проф. застосування','Побутова піна — зручне нанесення','Вогнезахисна піна класу В1','Піна-клей та очисники піни'],
  'klei':               ['Рідкі цвяхи та монтажний клей','Клей для шпалер з індикатором','ПВА та столярний клей (D2-D4)','Суперклей, епоксидний, контактний'],
  'farby':              ['Водоемульсійні фасадні та інтер\'єрні','Алкідні фарби та емалі','Лаки, просочення, колоранти','Розчинники та перетворювачі іржі'],
  'gruntivky':          ['Ґрунтовки готові та концентрати','Шпаклівки гіпсові та цементні','Бетоноконтакт та адгезійна ґрунт-фарба','Антигрибкові засоби'],
  'hidroizolyatsiya':   ['Бітумні та гідроізол. мастики','Праймери для бітумних покриттів','Ізоляційні стрічки та мембрани','Для покрівель, фундаментів, санвузлів'],
  'kriplennya':         ['Дюбелі нейлонові та металеві','Анкери для бетону та цегли','Шурупи та саморізи для ГК','Покриття: оцинковане, фосфатоване'],
  'instrumenty':        ['Пістолети для герметика та піни','Шпателі та кельми','Кисті, валики та малярні інструменти','Шліфувальний та вимірювальний інструмент'],
  'strichky':           ['Герметизуюча бутилова стрічка','Малярна стрічка для чистих меж','Стрічка для швів та серпянка','Звукоізоляційна стрічка Knauf'],
  'plastyfikatory':     ['Пластифікатори для бетону та розчинів','Протиморозні добавки','Замінник вапна','Для теплої підлоги'],
  'vologopoglinachi':   ['Поглиначі вологи Ceresit Stop Волога','Таблетки змінні Aero 360°','Різні аромати та об\'єми','Для приміщень до 20 м²'],
  'zamazky-dlya-shviv': ['Цементні затирки Ceresit CE33 (шов 1-6 мм)','Еластичні CE40 (шов до 20 мм)','50+ кольорів у асортименті','Для керамічної плитки та мозаїки'],
  'zakhyst-derevyny':   ['Антисептики від грибка та комах','Морилки та тонуючі засоби','Захисні покриття Lotus','Для зовнішніх та внутрішніх робіт'],
};

function getCatBullets(name: string, slug: string): string[] {
  return CAT_BULLETS[slug] ?? [
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
  role: UserRole;
};

const navBtnStyle: React.CSSProperties = {
  width: '32px', height: '32px', borderRadius: '8px',
  border: '1px solid var(--border)', background: 'var(--bg-card)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  color: 'var(--text-secondary)', flexShrink: 0, cursor: 'pointer',
};

const actionBtnStyle: React.CSSProperties = {
  width: '44px', height: '44px', borderRadius: '10px',
  border: '1px solid var(--border)', background: 'var(--bg-card)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  color: '#64748B', flexShrink: 0, cursor: 'pointer',
};

export default function CategoryPreview({ categories, products, selectedSlug, role }: Props) {
  const isRetail = role !== 'wholesale';
  const [prodIdx, setProdIdx] = useState(0);
  const [qty, setQty]         = useState(1);
  const [inputVal, setInputVal] = useState('1');
  const [cartAdded, setCartAdded] = useState(false);
  const { addItem } = useCart();
  const { toggle, isLiked } = useWishlist();

  const catIndex    = categories.findIndex(c => c.slug === selectedSlug);
  const category    = categories[catIndex] ?? categories[0];
  const iconColor   = getCatColor(category?.slug ?? '', catIndex + 1);
  const Icon        = getCatIcon(category?.slug ?? '', catIndex + 1);
  const bullets     = category ? getCatBullets(category.name, category.slug) : [];

  // Підкатегорії обраної категорії
  const subCats = categories.filter(c => c.parent_slug === selectedSlug);
  // Якщо є підкатегорії — беремо по 1 товару з кожної; інакше — товари категорії напряму
  const catProducts = subCats.length > 0
    ? subCats.flatMap(sub => products.filter(p => p.category_slug === sub.slug).slice(0, 1))
    : products.filter(p => p.category_slug === selectedSlug).slice(0, 8);
  const total       = catProducts.length;

  const minOrder = isRetail ? 1 : (catProducts[0]?.min_order ?? 1);

  useEffect(() => {
    setProdIdx(0);
    const m = isRetail ? 1 : (catProducts[0]?.min_order ?? 1);
    setQty(m); setInputVal(String(m));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSlug]);

  const product   = catProducts[prodIdx] ?? null;
  const priceUnit = isRetail ? (product?.stock?.price_retail ?? 0)     : (product?.stock?.price_unit ?? 0);
  const priceOld  = isRetail ? (product?.stock?.price_retail_old ?? null) : (product?.stock?.price_old  ?? null);
  const stockQty  = product?.stock?.stock_qty  ?? 0;
  const isSale    = priceOld != null && priceUnit > 0 && priceUnit < priceOld;
  const discount  = isSale ? Math.round((1 - priceUnit / priceOld!) * 100) : 0;
  const curMinOrder = isRetail ? 1 : (product?.min_order ?? 1);
  const packFrac  = product ? (curMinOrder / product.pack_qty) : 0;
  const packStr   = packFrac % 1 === 0 ? `${packFrac}` : packFrac.toFixed(1);
  const catHref   = isRetail ? `/shop?category=${category?.slug}` : `/catalog?category=${category?.slug}`;
  const prodHref  = (sku: string) => isRetail ? `/product/${sku}?from=shop` : `/product/${sku}`;

  function prev() {
    const i = Math.max(0, prodIdx - 1);
    setProdIdx(i);
    const m = isRetail ? 1 : (catProducts[i]?.min_order ?? 1);
    setQty(m); setInputVal(String(m));
    setCartAdded(false);
  }
  function next() {
    const i = Math.min(total - 1, prodIdx + 1);
    setProdIdx(i);
    const m = isRetail ? 1 : (catProducts[i]?.min_order ?? 1);
    setQty(m); setInputVal(String(m));
    setCartAdded(false);
  }
  function handleAddToCart() {
    if (!product) return;
    addItem({
      sku: product.sku, name: product.name, brand: product.brand, volume: product.volume,
      price: priceUnit, min_order: curMinOrder,
      nl1: product.nl1 ?? '', nl2: product.nl2 ?? undefined,
      bc: product.bc, ac: product.ac, img_type: product.img_type, imageUrl: product.image ?? undefined,
    }, qty);
    setCartAdded(true);
    setTimeout(() => setCartAdded(false), 1500);
  }

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
      background: 'var(--bg-soft)',
      overflow: 'hidden',
      height: '100%',
    }}>

      {/* ── Left panel ── */}
      <div style={{
        padding: '32px 28px',
        borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column',
        background: 'var(--bg-page)',
        overflowY: 'auto', scrollbarWidth: 'none',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '24px' }}>
          <div style={{
            width: '52px', height: '52px', borderRadius: '14px', flexShrink: 0,
            background: iconColor,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Icon size={26} color="#fff" strokeWidth={1.75} />
          </div>
          <h2 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.2 }}>
            {category.name}
          </h2>
        </div>

        <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '28px', flex: 1 }}>
          {bullets.map((b, i) => (
            <li key={i} style={{ display: 'flex', gap: '8px', fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.55 }}>
              <span style={{ color: '#4880B8', fontWeight: 700, flexShrink: 0 }}>•</span>
              {b}
            </li>
          ))}
        </ul>

        <Link href={catHref} style={{
          display: 'inline-flex', alignItems: 'center', gap: '6px',
          fontSize: '13px', fontWeight: 600, color: '#4880B8',
          textDecoration: 'none', marginTop: 'auto',
        }}>
          {isRetail ? 'Всі товари магазину →' : 'Всі товари каталогу →'}
        </Link>
      </div>

      {/* ── Right panel ── */}
      <div style={{ background: 'var(--bg-card)', padding: '24px', overflowY: 'auto', scrollbarWidth: 'none' }}>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
            Приклади товарів
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button onClick={prev} disabled={prodIdx === 0} style={{
              ...navBtnStyle,
              color: prodIdx === 0 ? '#CBD5E1' : '#475569',
              cursor: prodIdx === 0 ? 'default' : 'pointer',
            }}>
              <ChevronLeft size={15} strokeWidth={2} />
            </button>
            <span style={{
              fontSize: '13px', fontWeight: 600, color: '#475569',
              minWidth: '40px', textAlign: 'center',
              background: 'var(--bg-soft)', borderRadius: '6px', padding: '3px 8px',
            }}>
              {total > 0 ? `${prodIdx + 1} / ${total}` : '—'}
            </span>
            <button onClick={next} disabled={prodIdx >= total - 1} style={{
              ...navBtnStyle,
              color: prodIdx >= total - 1 ? '#CBD5E1' : '#475569',
              cursor: prodIdx >= total - 1 ? 'default' : 'pointer',
            }}>
              <ChevronRight size={15} strokeWidth={2} />
            </button>
          </div>
        </div>

        {product ? (
          <div style={{
            background: 'var(--bg-soft)', borderRadius: '14px', padding: '20px',
            border: '1px solid var(--border-light)',
          }}>
            <div style={{ display: 'flex', gap: '16px', marginBottom: '16px', alignItems: 'flex-start' }}>
              <Link href={prodHref(product.sku)} style={{
                width: '100px', height: '100px', flexShrink: 0,
                background: 'var(--bg-card)', borderRadius: '10px', border: '1px solid var(--border)',
                overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <ProductImage
                  brand={product.brand} nl1={product.nl1 ?? ''} nl2={product.nl2 ?? undefined}
                  volume={product.volume ?? ''} bc={product.bc} ac={product.ac} type={product.img_type}
                  imageUrl={product.image ?? undefined}
                />
              </Link>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', marginBottom: '4px' }}>
                  <Link href={prodHref(product.sku)} style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.3, textDecoration: 'none' }}>
                    {product.name}
                  </Link>
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
                <div style={{ fontSize: '12px', color: '#94A3B8', marginBottom: '10px' }}>{product.sku}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '6px' }}>
                  {isSale && priceOld && (
                    <span style={{ fontSize: '13px', color: '#EF4444', textDecoration: 'line-through', fontWeight: 600 }}>
                      {priceOld} грн
                    </span>
                  )}
                  {priceUnit > 0 ? (
                    <span style={{ fontSize: '26px', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>
                      {priceUnit} грн
                    </span>
                  ) : (
                    <span style={{ fontSize: '14px', color: '#94A3B8' }}>За запитом</span>
                  )}
                </div>
                {stockQty >= (curMinOrder) && (
                  <div style={{ fontSize: '11px', color: '#15803D', fontWeight: 600, marginBottom: '3px' }}>
                    ● в наявності
                  </div>
                )}
                {!isRetail && (
                  <div style={{ fontSize: '11px', color: '#64748B', marginBottom: '2px' }}>
                    В упаковці: {product.pack_qty} шт
                  </div>
                )}
              </div>
            </div>

            {specs.length > 0 && (
              <div style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 24px',
                marginBottom: '12px', paddingBottom: '14px',
                borderBottom: '1px solid var(--border)',
              }}>
                {specs.slice(0, 6).map(s => (
                  <div key={s.label}>
                    <div style={{ fontSize: '11px', color: '#94A3B8', marginBottom: '2px' }}>{s.label}</div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{s.value}</div>
                  </div>
                ))}
              </div>
            )}

            {!isRetail && (
              <div style={{ marginBottom: '14px' }}>
                <div style={{ fontSize: '12px', color: '#94A3B8', marginBottom: '2px' }}>Мінімальне замовлення</div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#4880B8' }}>
                  {product.min_order} рс / {packStr} уп
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button
                onClick={() => product && toggle(product.sku)}
                className="btn-icon"
                style={{
                  ...actionBtnStyle,
                  color: product && isLiked(product.sku) ? '#EF4444' : '#64748B',
                  background: product && isLiked(product.sku) ? '#FEF2F2' : 'var(--bg-card)',
                  border: `1px solid ${product && isLiked(product.sku) ? '#FECACA' : 'var(--border)'}`,
                }}
              >
                <Heart size={16} strokeWidth={2} fill={product && isLiked(product.sku) ? '#EF4444' : 'none'} />
              </button>

              <input
                type="number"
                value={inputVal}
                min={curMinOrder}
                onChange={e => setInputVal(e.target.value)}
                onBlur={() => {
                  const v = parseInt(inputVal, 10);
                  const valid = !isNaN(v) && v >= curMinOrder ? v : curMinOrder;
                  setQty(valid); setInputVal(String(valid));
                }}
                style={{
                  width: '64px', height: '44px', borderRadius: '10px',
                  border: '1px solid var(--border)', background: 'var(--bg-card)',
                  textAlign: 'center', fontSize: '15px', fontWeight: 700,
                  color: 'var(--text-primary)', outline: 'none',
                }}
              />

              <button
                onClick={handleAddToCart}
                disabled={stockQty < (curMinOrder)}
                className={stockQty >= (curMinOrder) && !cartAdded ? 'btn-primary' : undefined}
                style={{
                  flex: 1, height: '44px', borderRadius: '10px',
                  background: cartAdded ? '#16A34A' : stockQty < (curMinOrder) ? '#E2E8F0' : '#4880B8',
                  color: stockQty < (curMinOrder) ? '#94A3B8' : '#fff',
                  border: 'none', fontSize: '14px', fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                  cursor: stockQty < (curMinOrder) ? 'default' : 'pointer',
                  transition: 'background 0.2s',
                }}
              >
                {cartAdded
                  ? <><Check size={15} strokeWidth={2.5} /> Додано</>
                  : stockQty < (curMinOrder)
                    ? 'Немає в наявності'
                    : <><Plus size={15} strokeWidth={2.5} /> В кошик</>}
              </button>

              <Link href={prodHref(product.sku)} className="btn-icon" style={{ ...actionBtnStyle, textDecoration: 'none' }}>
                <Eye size={15} strokeWidth={2} />
              </Link>
              <Link href={catHref} style={{
                display: 'inline-flex', alignItems: 'center',
                fontSize: '12px', fontWeight: 600, color: '#4880B8',
                textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0,
              }}>
                Всі →
              </Link>
            </div>
          </div>
        ) : (
          <div style={{
            background: 'var(--bg-soft)', borderRadius: '14px', padding: '48px 24px',
            textAlign: 'center', border: '1px solid var(--border)',
          }}>
            <div style={{ fontSize: '15px', color: 'var(--text-muted)' }}>Немає товарів у цій категорії</div>
          </div>
        )}
      </div>
    </div>
  );
}

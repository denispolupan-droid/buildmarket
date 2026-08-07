'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { ShoppingCart, Check, Bell, Heart } from 'lucide-react';
import { useCart } from '../../../lib/cart';
import { useWishlist } from '../../../lib/wishlist';
import { getSupabaseBrowser } from '../../../lib/supabase-browser';

type Props = {
  priceUnit: number;
  minOrder: number;
  isRetailPage?: boolean;
  inStock: boolean;
  sku: string;
  name: string;
  name_ru?: string | null;
  brand: string;
  volume: string | null;
  nl1: string | null;
  nl2: string | null;
  bc: string;
  ac: string;
  imgType: 'tube' | 'canister';
  imageUrl?: string;
  isPromo?: boolean;
};

export default function ProductOrderPanel({ priceUnit, minOrder, inStock, sku, name, name_ru, brand, volume, nl1, nl2, bc, ac, imgType, imageUrl, isPromo, isRetailPage }: Props) {
  const pathname = usePathname();
  const lang = pathname.startsWith('/ru') ? 'ru' : 'uk';
  const t = (uk: string, ru: string) => lang === 'ru' ? ru : uk;
  const [qty, setQty]           = useState(minOrder);
  const [added, setAdded]       = useState(false);
  const [notified,   setNotified]   = useState(false);
  const [notifyEmail, setNotifyEmail] = useState('');
  const [showInput,   setShowInput]   = useState(false);
  const [sending,     setSending]     = useState(false);
  const [isWholesale, setIsWholesale] = useState(false);
  const [showModal,   setShowModal]   = useState(false);
  const { addItem, items } = useCart();
  const inCart = items.some(i => i.sku === sku);
  const { isLiked, toggle: toggleWish } = useWishlist();
  const liked = isLiked(sku);

  useEffect(() => {
    getSupabaseBrowser().auth.getUser().then(({ data }: { data: { user: import('@supabase/supabase-js').User | null } }) => {
      const type = data.user?.app_metadata?.account_type as string | undefined;
      setIsWholesale(['dealer', 'wholesale', 'contractor', 'shop_owner'].includes(type ?? ''));
    });
  }, []);

  function dec() { setQty(q => Math.max(minOrder, q - 1)); }
  function inc() { setQty(q => q + 1); }
  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = parseInt(e.target.value, 10);
    if (!isNaN(val) && val >= minOrder) setQty(val);
  }

  function handleAddToCart() {
    if (isWholesale && isRetailPage) { setShowModal(true); return; }
    addItem({ sku, name, name_ru, brand, volume, price: priceUnit, min_order: minOrder, nl1: nl1 ?? '', nl2: nl2 ?? undefined, bc, ac, img_type: imgType, imageUrl, is_promo: isPromo }, qty);
    setAdded(true);
    setTimeout(() => setAdded(false), 1500);
  }

  async function handleNotify() {
    if (!notifyEmail.trim() || !notifyEmail.includes('@')) return;
    setSending(true);
    try {
      await fetch('/api/notify-stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sku, email: notifyEmail.trim(), name }),
      });
      setNotified(true);
    } finally {
      setSending(false);
    }
  }

  const subtotal = (priceUnit * qty).toLocaleString('uk-UA');

  return (
    <>
      {inStock ? (
        <>
          <div style={{ fontSize: '13px', color: '#64748B', marginBottom: '8px' }}>{t('Кількість:', 'Количество:')}</div>
          <div className="op-actions-row" style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>

            <div className="qty-stepper op-qty-stepper">
              <button className="qty-stepper__btn" onClick={dec}>−</button>
              <input className="qty-stepper__val" type="number" value={qty} min={minOrder} onChange={handleChange} />
              <button className="qty-stepper__btn" onClick={inc}>+</button>
            </div>

            <button
              onClick={handleAddToCart}
              className={(!added && !inCart ? 'btn-primary ' : '') + 'op-cart-btn'}
              style={{
                height: '44px', padding: '0 28px', border: 'none', borderRadius: '10px',
                background: added ? '#16A34A' : inCart ? '#0D9488' : '#4880B8', color: '#fff',
                fontSize: '14px', fontWeight: 700, cursor: 'pointer',
                whiteSpace: 'nowrap', flexShrink: 0,
                display: 'flex', alignItems: 'center', gap: '6px',
                transition: 'background 0.2s',
              }}
            >
              {added
                ? <><Check size={15} strokeWidth={2.5} /> {t('Додано', 'Добавлено')}</>
                : inCart
                  ? <><Check size={15} strokeWidth={2.5} /> {t('В кошику', 'В корзине')}</>
                  : <><ShoppingCart size={15} strokeWidth={2} /> {t('В кошик', 'В корзину')}</>
              }
            </button>

            <button
              onClick={() => toggleWish(sku)}
              aria-label={liked ? t('Прибрати з обраного', 'Убрать из избранного') : t('Додати в обране', 'Добавить в избранное')}
              className="op-wish-btn"
              style={{
                width: '44px', height: '44px', borderRadius: '50%', flexShrink: 0,
                border: `1px solid ${liked ? '#FECACA' : 'var(--border)'}`,
                background: liked ? '#FEF2F2' : 'var(--bg-card)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: liked ? '#EF4444' : 'var(--text-muted)', cursor: 'pointer',
              }}
            >
              <Heart size={18} fill={liked ? '#EF4444' : 'none'} strokeWidth={2} />
            </button>

            {priceUnit > 0 && (
              <span className="op-sum" style={{ whiteSpace: 'nowrap', minWidth: '160px', display: 'flex', flexDirection: 'column', gap: '1px' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.6px' }}>{t('Сума', 'Сумма')}</span>
                <span style={{ fontSize: '20px', fontWeight: 700, color: '#0F172A', lineHeight: 1 }}>
                  {subtotal} <span style={{ fontSize: '13px', fontWeight: 500, color: '#64748B' }}>грн</span>
                </span>
              </span>
            )}
          </div>
          <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '6px' }}>
            {t('Мін. замовлення:', 'Мин. заказ:')} {minOrder} {t('шт', 'шт')}
          </div>
        </>
      ) : (
        <div>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            padding: '6px 14px', borderRadius: '8px',
            background: '#FEE2E2', color: '#DC2626',
            fontSize: '13px', fontWeight: 600,
          }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#DC2626', flexShrink: 0 }} />
            {t('Немає в наявності', 'Нет в наличии')}
          </div>

          <div style={{ marginTop: '16px' }}>
          {notified ? (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '12px 16px', borderRadius: '10px',
              background: '#DCFCE7', color: '#15803D', fontSize: '14px', fontWeight: 600,
            }}>
              <Check size={16} strokeWidth={2.5} />
              {t('Ми повідомимо вас про появу товару', 'Мы уведомим вас о появлении товара')}
            </div>
          ) : showInput ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <input
                type="email"
                placeholder={t('Ваш email', 'Ваш email')}
                value={notifyEmail}
                onChange={e => setNotifyEmail(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleNotify()}
                autoFocus
                style={{
                  height: '44px', padding: '0 14px', borderRadius: '10px',
                  border: '1px solid #E2E8F0', fontSize: '14px', outline: 'none',
                  width: '100%',
                }}
              />
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={handleNotify}
                  disabled={sending || !notifyEmail.includes('@')}
                  style={{
                    flex: 1, height: '40px', borderRadius: '10px',
                    background: '#1E3A5F', color: '#fff', border: 'none',
                    fontSize: '14px', fontWeight: 700, cursor: 'pointer',
                    opacity: sending ? 0.7 : 1,
                  }}
                >
                  {sending ? t('Відправляємо...', 'Отправляем...') : t('Підписатись', 'Подписаться')}
                </button>
                <button
                  onClick={() => setShowInput(false)}
                  style={{
                    height: '40px', padding: '0 14px', borderRadius: '10px',
                    background: 'none', border: '1px solid #E2E8F0',
                    fontSize: '14px', color: '#64748B', cursor: 'pointer',
                  }}
                >
                  {t('Скасувати', 'Отмена')}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowInput(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                height: '44px', padding: '0 24px', borderRadius: '10px',
                background: '#1E3A5F', color: '#fff', border: 'none',
                fontSize: '14px', fontWeight: 700, cursor: 'pointer',
              }}
            >
              <Bell size={15} strokeWidth={2} />
              {t('Повідомити про появу', 'Уведомить о появлении')}
            </button>
          )}
          </div>
        </div>
      )}

    {showModal && (
      <div onClick={() => setShowModal(false)} style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.5)', display: 'flex',
        alignItems: 'center', justifyContent: 'center', padding: '24px',
      }}>
        <div onClick={e => e.stopPropagation()} style={{
          background: 'var(--bg-card)', borderRadius: '16px',
          padding: '36px 32px', maxWidth: '420px', width: '100%',
          textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        }}>
          <div style={{ fontSize: '36px', marginBottom: '12px' }}>🏢</div>
          <h2 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '10px' }}>
            {t('Ви увійшли як оптовий клієнт', 'Вы вошли как оптовый клиент')}
          </h2>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '24px' }}>
            {t('У магазині вказані роздрібні ціни. Для замовлення за вашими цінами перейдіть до оптового каталогу.', 'В магазине указаны розничные цены. Для заказа по вашим ценам перейдите в оптовый каталог.')}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <a href={lang === 'ru' ? '/ru/catalog' : '/catalog'} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              height: '44px', borderRadius: '10px', background: '#1E3A5F', color: '#fff',
              fontSize: '14px', fontWeight: 700, textDecoration: 'none',
            }}>
              {t('Перейти до оптового каталогу →', 'Перейти в оптовый каталог →')}
            </a>
            <button onClick={() => setShowModal(false)} style={{
              height: '40px', borderRadius: '10px', border: '1px solid var(--border)',
              background: 'transparent', color: 'var(--text-secondary)',
              fontSize: '13px', cursor: 'pointer',
            }}>
              {t('Залишитись і переглянути магазин', 'Остаться и просматривать магазин')}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}

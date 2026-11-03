'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import ProductImage from '../components/ProductImage';
import { useCart, type CartItem } from '../../lib/cart';
import { fmtMoney as fmt } from '../../lib/format';

/**
 * Швидкий перегляд кошика при наведенні на лічильник мін. замовлення —
 * щоб перед оформленням звірити й поправити замовлення, не йдучи з каталогу.
 * Кількість і видалення — ті самі updateQty/removeItem, що на сторінці кошика
 * (крок і мінімум = min_order, як там). Ціни при оформленні все одно рахує сервер.
 * Показ — CSS (:hover / :focus-within обгортки .cart-peek-host), тільки на пристроях з ховером.
 */
export default function CartPeek({ items, total, lang, placement }: {
  items: CartItem[];
  total: number;
  lang: 'uk' | 'ru';
  placement: 'below' | 'above';
}) {
  const { updateQty, removeItem } = useCart();
  // Чернетка поля, поки його редагують; фіксуємо на blur/Enter — як у кошику
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  if (items.length === 0) return null;
  const t = (uk: string, ru: string) => (lang === 'ru' ? ru : uk);
  const units = items.reduce((s, i) => s + i.qty, 0);

  const dropDraft = (sku: string) => setDrafts(prev => { const n = { ...prev }; delete n[sku]; return n; });
  const step = (i: CartItem, dir: 1 | -1) => { dropDraft(i.sku); updateQty(i.sku, i.qty + dir * i.min_order); };
  const commit = (i: CartItem) => {
    const raw = drafts[i.sku];
    if (raw === undefined) return;
    const v = parseInt(raw, 10);
    updateQty(i.sku, !isNaN(v) && v >= i.min_order ? v : i.min_order);
    dropDraft(i.sku);
  };

  return (
    <div className={`cart-peek cart-peek--${placement}`} role="dialog" aria-label={t('Ваше замовлення', 'Ваш заказ')}>
      <div className="cart-peek-head">
        <span>{t('Ваше замовлення', 'Ваш заказ')}</span>
        <span className="cart-peek-count">
          {items.length} {t('поз.', 'поз.')} · {units} {t('шт.', 'шт.')}
        </span>
      </div>
      <ul className="cart-peek-list">
        {items.map(i => (
          <li key={i.sku} className="cart-peek-item">
            <div className="cart-peek-thumb">
              <ProductImage
                brand={i.brand} nl1={i.nl1} nl2={i.nl2}
                volume={i.volume ?? ''} bc={i.bc} ac={i.ac} type={i.img_type}
                imageUrl={i.imageUrl}
              />
            </div>
            <div className="cart-peek-info">
              <div className="cart-peek-name">{(lang === 'ru' && i.name_ru) || i.name}</div>
              <div className="cart-peek-meta">{fmt(i.price)} ₴ / {t('шт.', 'шт.')}</div>
            </div>
                <div className="cart-peek-qty">
                  <input
                    type="number" inputMode="numeric" min={i.min_order} step={i.min_order}
                    aria-label={t('Кількість', 'Количество')}
                    value={drafts[i.sku] ?? String(i.qty)}
                    onChange={e => setDrafts(prev => ({ ...prev, [i.sku]: e.target.value }))}
                    onBlur={() => commit(i)}
                    onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                  />
                  {/* Стрілки стовпчиком праворуч від числа — компактніше за «− N +» */}
                  <div className="cart-peek-arrows">
                    <button type="button" aria-label={t('Більше', 'Больше')} onClick={() => step(i, 1)}>
                      <ChevronUp size={10} strokeWidth={2.5} aria-hidden />
                    </button>
                    <button type="button" aria-label={t('Менше', 'Меньше')}
                      disabled={i.qty <= i.min_order} onClick={() => step(i, -1)}>
                      <ChevronDown size={10} strokeWidth={2.5} aria-hidden />
                    </button>
                  </div>
                </div>
            <div className="cart-peek-sum">{fmt(i.price * i.qty)} ₴</div>
            <button type="button" className="cart-peek-del" onClick={() => { dropDraft(i.sku); removeItem(i.sku); }}
              aria-label={t('Видалити', 'Удалить')} title={t('Видалити з кошика', 'Удалить из корзины')}>
              <Trash2 size={11} strokeWidth={2} aria-hidden /><span aria-hidden>✕</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="cart-peek-foot">
        <span>{t('Разом', 'Итого')}: <strong>{fmt(total)} ₴</strong></span>
        <Link href={lang === 'ru' ? '/ru/cart' : '/cart'} className="cart-peek-go">
          {t('До кошика', 'В корзину')} →
        </Link>
      </div>
    </div>
  );
}

'use client';

import Link from 'next/link';
import ProductImage from '../components/ProductImage';
import type { CartItem } from '../../lib/cart';
import { fmtMoney as fmt } from '../../lib/format';

/**
 * Швидкий перегляд кошика при наведенні на лічильник мін. замовлення —
 * щоб перед оформленням звірити, чи все додано, не йдучи з каталогу.
 * Лише перегляд: кількість і видалення — на сторінці кошика.
 * Показ — CSS (:hover / :focus-within обгортки .cart-peek-host), тільки на пристроях з ховером.
 */
export default function CartPeek({ items, total, lang, placement }: {
  items: CartItem[];
  total: number;
  lang: 'uk' | 'ru';
  placement: 'below' | 'above';
}) {
  if (items.length === 0) return null;
  const t = (uk: string, ru: string) => (lang === 'ru' ? ru : uk);
  const units = items.reduce((s, i) => s + i.qty, 0);

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
              <div className="cart-peek-meta">{i.qty} × {fmt(i.price)} ₴</div>
            </div>
            <div className="cart-peek-sum">{fmt(i.price * i.qty)} ₴</div>
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

'use client';

import { useState, useEffect } from 'react';
import { getSupabaseBrowser } from '../../../lib/supabase-browser';

type Props = {
  priceUnit:   number;   // оптова / роздрібна (залежно від контексту)
  priceRetail: number | null;  // роздрібна (для показу опт клієнту)
  priceOld:    number | null;
  pricePack:   number;
  packQty:     number;
  isRetailPage: boolean;
};

export default function ProductPriceDisplay({ priceUnit, priceRetail, priceOld, pricePack, packQty, isRetailPage }: Props) {
  const [isWholesale, setIsWholesale] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    getSupabaseBrowser().auth.getUser().then(({ data }: { data: { user: import('@supabase/supabase-js').User | null } }) => {
      const type = data.user?.user_metadata?.account_type as string | undefined;
      setIsWholesale(['dealer', 'wholesale', 'contractor', 'shop_owner'].includes(type ?? ''));
      setReady(true);
    });
  }, []);

  const showDual = ready && isWholesale && isRetailPage && priceRetail && priceUnit < priceRetail;

  if (!ready) {
    // SSR / loading — показуємо стандартно
    return (
      <>
        <div className="product-info__price-unit">{priceUnit} грн / шт</div>
        <div className="product-info__price-row-sub">
          {priceOld && <span className="product-info__price-old">{priceOld} грн</span>}
          {!isRetailPage && packQty > 1 && (
            <span className="product-info__price-pack">
              {pricePack.toLocaleString('uk-UA')} грн / уп ({packQty} шт)
            </span>
          )}
        </div>
      </>
    );
  }

  if (showDual) {
    return (
      <>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, color: '#15803D', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Ваша ціна
          </span>
          <span className="product-info__price-unit" style={{ color: '#15803D', margin: 0 }}>
            {priceUnit} грн / шт
          </span>
        </div>
        <div className="product-info__price-row-sub">
          {packQty > 1 && (
            <span className="product-info__price-pack">
              {pricePack.toLocaleString('uk-UA')} грн / уп ({packQty} шт)
            </span>
          )}
        </div>
        <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '4px' }}>
          Роздріб: {priceRetail} грн / шт
        </div>
      </>
    );
  }

  // Звичайне відображення (роздріб або оптовик на каталозі)
  return (
    <>
      <div className="product-info__price-unit">{priceUnit} грн / шт</div>
      <div className="product-info__price-row-sub">
        {priceOld && <span className="product-info__price-old">{priceOld} грн</span>}
        {!isRetailPage && packQty > 1 && (
          <span className="product-info__price-pack">
            {pricePack.toLocaleString('uk-UA')} грн / уп ({packQty} шт)
          </span>
        )}
      </div>
    </>
  );
}

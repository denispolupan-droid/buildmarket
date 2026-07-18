'use client';

import { useState, useEffect } from 'react';
import { getSupabaseBrowser } from '../../../lib/supabase-browser';

type Props = {
  priceUnit:       number;   // ціна для відображення (вже з урахуванням контексту)
  priceWholesale:  number | null;  // завжди price_unit з БД
  priceRetail:     number | null;  // завжди price_retail з БД
  priceOld:        number | null;
  pricePack:       number;
  packQty:         number;
  isRetailPage:    boolean;
};

export default function ProductPriceDisplay({ priceUnit, priceWholesale, priceRetail, priceOld, pricePack, packQty, isRetailPage }: Props) {
  const [isWholesale, setIsWholesale] = useState(false);

  useEffect(() => {
    getSupabaseBrowser().auth.getUser().then(({ data }: { data: { user: import('@supabase/supabase-js').User | null } }) => {
      const type = data.user?.app_metadata?.account_type as string | undefined;
      setIsWholesale(['dealer', 'wholesale', 'contractor', 'shop_owner'].includes(type ?? ''));
    });
  }, []);

  const showDual = isWholesale && priceWholesale && priceRetail && priceRetail > priceWholesale;
  const displayPrice = showDual ? priceWholesale! : priceUnit;
  const packPrice    = showDual ? priceWholesale! * packQty : pricePack;

  return (
    <>
      <div className="product-info__price-unit" style={showDual ? { color: '#15803D' } : undefined}>
        {displayPrice} грн / шт
      </div>

      <div className="product-info__price-row-sub">
        {!showDual && priceOld && <span className="product-info__price-old">{priceOld} грн</span>}
        {!isRetailPage && packQty > 1 && (
          <span className="product-info__price-pack">
            {packPrice.toLocaleString('uk-UA')} грн / уп ({packQty} шт)
          </span>
        )}
      </div>

      {showDual && (
        <div style={{ fontSize: '13px', color: '#94A3B8', marginTop: '2px' }}>
          Роздріб: {priceRetail} грн / шт
        </div>
      )}
    </>
  );
}

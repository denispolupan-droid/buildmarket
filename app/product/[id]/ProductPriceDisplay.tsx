'use client';

import { useState, useEffect } from 'react';
import { getSupabaseBrowser } from '../../../lib/supabase-browser';

type Props = {
  priceUnit:    number;
  priceRetail:  number | null;
  priceOld:     number | null;
  pricePack:    number;
  packQty:      number;
  isRetailPage: boolean;
};

export default function ProductPriceDisplay({ priceUnit, priceRetail, priceOld, pricePack, packQty, isRetailPage }: Props) {
  const [isWholesale, setIsWholesale] = useState(false);

  useEffect(() => {
    getSupabaseBrowser().auth.getUser().then(({ data }: { data: { user: import('@supabase/supabase-js').User | null } }) => {
      const type = data.user?.user_metadata?.account_type as string | undefined;
      setIsWholesale(['dealer', 'wholesale', 'contractor', 'shop_owner'].includes(type ?? ''));
    });
  }, []);

  const hasRetailRef = priceRetail && priceRetail > priceUnit;

  if (isWholesale && hasRetailRef) {
    return (
      <>
        {/* Оптова ціна — зелена */}
        <div className="product-info__price-unit" style={{ color: '#15803D' }}>
          {priceUnit} грн / шт
        </div>

        {/* Пак-ціна — як стандартно */}
        <div className="product-info__price-row-sub">
          {!isRetailPage && packQty > 1 && (
            <span className="product-info__price-pack">
              {pricePack.toLocaleString('uk-UA')} грн / уп ({packQty} шт)
            </span>
          )}
        </div>

        {/* Роздрібна — сірим під оптовою */}
        <div style={{ fontSize: '13px', color: '#94A3B8', marginTop: '2px' }}>
          Роздріб: {priceRetail} грн / шт
        </div>
      </>
    );
  }

  // Стандартне відображення (роздріб або однакові ціни)
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

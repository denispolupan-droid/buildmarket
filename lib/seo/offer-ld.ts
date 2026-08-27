/**
 * Спільні для всіх товарів поля Offer у JSON-LD: доставка, повернення, стан,
 * термін дії ціни. Без них Google засчитує Merchant listing, але з попередженнями,
 * і не показує в сніпеті ані строків доставки, ані умов повернення.
 *
 * Значення — з публічних сторінок /delivery і /returns: Нова Пошта і ROZETKA по
 * Україні, відправка в день замовлення або наступного робочого дня, 14 днів на
 * повернення товару належної якості, зворотна доставка за рахунок покупця.
 * Тарифи перевізників тут не пишемо: вони залежать від ваги й міста, а вигадана
 * «середня» ціна доставки — це та сама недостовірна розмітка, що й фальшивий lastmod.
 */

export const ORG_ID = 'https://fixline.com.ua/#organization';

export const SELLER_LD = { '@type': 'Organization', '@id': ORG_ID, name: 'FIXLINE', url: 'https://fixline.com.ua' } as const;

/** Ціна дійсна до кінця поточного місяця плюс місяць — далі Google перечитає сторінку. */
function priceValidUntil(now = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 2, 0));
  return d.toISOString().slice(0, 10);
}

export function offerExtras(productUrl: string) {
  return {
    url: productUrl,
    itemCondition: 'https://schema.org/NewCondition',
    priceValidUntil: priceValidUntil(),
    seller: SELLER_LD,
    shippingDetails: {
      '@type': 'OfferShippingDetails',
      shippingDestination: { '@type': 'DefinedRegion', addressCountry: 'UA' },
      deliveryTime: {
        '@type': 'ShippingDeliveryTime',
        handlingTime: { '@type': 'QuantitativeValue', minValue: 0, maxValue: 1, unitCode: 'DAY' },
        transitTime:  { '@type': 'QuantitativeValue', minValue: 1, maxValue: 3, unitCode: 'DAY' },
      },
    },
    hasMerchantReturnPolicy: {
      '@type': 'MerchantReturnPolicy',
      applicableCountry: 'UA',
      returnPolicyCategory: 'https://schema.org/MerchantReturnFiniteReturnWindow',
      merchantReturnDays: 14,
      returnMethod: 'https://schema.org/ReturnByMail',
      returnFees: 'https://schema.org/ReturnShippingFees',
    },
  };
}

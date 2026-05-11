export const GA_ID = process.env.NEXT_PUBLIC_GA_ID ?? '';

declare global {
  interface Window {
    gtag: (...args: unknown[]) => void;
    dataLayer: unknown[];
  }
}

function gtag(...args: unknown[]) {
  if (typeof window === 'undefined' || !GA_ID || typeof window.gtag !== 'function') return;
  window.gtag(...args);
}

export function trackPageView(url: string) {
  gtag('config', GA_ID, { page_path: url });
}

type GaItem = {
  item_id: string;
  item_name: string;
  item_brand: string;
  price: number;
  quantity: number;
};

function toGaItem(i: { sku: string; name: string; brand: string; price: number; qty: number }): GaItem {
  return { item_id: i.sku, item_name: i.name, item_brand: i.brand, price: i.price, quantity: i.qty };
}

export function trackAddToCart(item: { sku: string; name: string; brand: string; price: number }, qty: number) {
  gtag('event', 'add_to_cart', {
    currency: 'UAH',
    value: item.price * qty,
    items: [toGaItem({ ...item, qty })],
  });
}

export function trackBeginCheckout(items: Array<{ sku: string; name: string; brand: string; price: number; qty: number }>, value: number) {
  gtag('event', 'begin_checkout', {
    currency: 'UAH',
    value,
    items: items.map(toGaItem),
  });
}

export function trackPurchase(
  transactionId: string,
  items: Array<{ sku: string; name: string; brand: string; price: number; qty: number }>,
  value: number,
) {
  gtag('event', 'purchase', {
    transaction_id: transactionId,
    currency: 'UAH',
    value,
    items: items.map(toGaItem),
  });
}

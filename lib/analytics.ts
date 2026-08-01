import { track } from '@vercel/analytics';

/**
 * Воронка магазину у Vercel Web Analytics.
 *
 * ЖОРСТКЕ ОБМЕЖЕННЯ: на плані Pro кастомна подія несе НЕ БІЛЬШЕ ДВОХ
 * властивостей (вісім — лише з платним add-on «Web Analytics Plus»).
 * Вкладені об'єкти й масиви не приймаються взагалі, значення — тільки
 * string / number / boolean / null, до 255 символів.
 *
 * Тому тут не «кошик цілком», як було в gtag, а дві найінформативніші
 * величини на подію. Додасте третю — Vercel мовчки її відкине, а не
 * поскаржиться, тож перевіряйте лічильник у дашборді після змін.
 *
 * Кожна подія тарифікується як і перегляд сторінки ($0.03 за 1K).
 */

type Item = { sku: string; name: string; brand: string; price: number; qty: number };

/** Гроші в аналітику йдуть у гривнях, округлені до копійки. */
const money = (n: number) => Math.round(n * 100) / 100;

export function trackAddToCart(item: Omit<Item, 'qty'>, qty: number) {
  track('add_to_cart', {
    sku: item.sku,
    value: money(item.price * qty),
  });
}

export function trackBeginCheckout(items: Item[], value: number) {
  track('begin_checkout', {
    value: money(value),
    items: items.reduce((n, i) => n + i.qty, 0),
  });
}

/** Позиції сюди не передаємо свідомо: у дві властивості влазять лише сума
 *  і номер замовлення, а склад кошика вже є в begin_checkout і в самій БД. */
export function trackPurchase(orderId: string, value: number) {
  track('purchase', {
    value: money(value),
    order: orderId,
  });
}

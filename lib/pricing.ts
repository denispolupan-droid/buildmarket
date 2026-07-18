// Чиста (без БД) логіка серверного перерахунку кошика й застосування промокоду.
// Винесена з app/api/orders/route.ts, щоб її можна було покрити юніт-тестами —
// це грошовий шлях, помилка тут = неправильна сума в кожному замовленні.

export type PriceRow = {
  sku: string;
  price_promo: number | null;
  price_retail: number | null;
  price_unit: number | null;
};

export type RepriceItem = { sku: string; qty: number; [k: string]: unknown };

export type RepriceResult =
  | { ok: true; serverTotal: number; serverEligibleTotal: number; serverItems: Record<string, unknown>[] }
  | { ok: false; error: string };

// Перерахунок кожного рядка з product_stock за тарифом користувача.
// retail: price_promo ?? price_retail; wholesale: price_unit. НІКОЛИ не довіряємо цінам клієнта.
export function repriceItems(
  items: RepriceItem[],
  priceBySku: Map<string, PriceRow>,
  isWholesaleUser: boolean,
): RepriceResult {
  let serverTotal = 0;
  let serverEligibleTotal = 0;
  const serverItems: Record<string, unknown>[] = [];

  for (const it of items) {
    const row = priceBySku.get(it.sku);
    if (!row) return { ok: false, error: `Товар ${it.sku} більше недоступний` };

    const retail = Number(row.price_retail ?? 0);
    const promoPrice = row.price_promo != null ? Number(row.price_promo) : null;

    // Акція діє і для роздрібу, і для опту. Для опту застосовуємо ТОЙ САМИЙ відсоток
    // знижки, що й у роздрібі (price_promo / price_retail), до оптової ціни price_unit.
    let unit: number;
    let isPromoLine: boolean;
    if (isWholesaleUser) {
      const base = Number(row.price_unit ?? 0);
      if (promoPrice != null && retail > 0 && promoPrice < retail) {
        unit = Math.round(base * (promoPrice / retail) * 100) / 100;
        isPromoLine = true;
      } else {
        unit = base;
        isPromoLine = false;
      }
    } else {
      unit = Number(promoPrice ?? retail);
      isPromoLine = promoPrice != null;
    }
    if (!(unit > 0)) return { ok: false, error: `Для товару ${it.sku} не встановлено ціну` };

    const qty = Number(it.qty);
    const line = Math.round(unit * qty * 100) / 100;
    serverTotal += line;
    if (!isPromoLine) serverEligibleTotal += line;
    serverItems.push({ ...it, price: unit, is_promo: isPromoLine });
  }

  serverTotal = Math.round(serverTotal * 100) / 100;
  serverEligibleTotal = Math.round(serverEligibleTotal * 100) / 100;
  return { ok: true, serverTotal, serverEligibleTotal, serverItems };
}

export type PromoCodeRow = {
  code: string;
  discount_type: 'percent' | 'fixed' | string;
  discount_value: number;
  valid_from: string | null;
  valid_until: string | null;
  max_uses: number | null;
  uses_count: number;
  min_order_amount: number | null;
  max_discount_amount: number | null;
};

export type PromoResult =
  | { ok: true; finalTotal: number; promoDiscount: number; code: string }
  | { ok: false; error: string };

// Валідація промокоду і розрахунок фінальної суми. Знижка рахується від суми
// НЕ-акційних рядків (serverEligibleTotal), як і в роуті.
export function applyPromoCode(
  promo: PromoCodeRow,
  serverTotal: number,
  serverEligibleTotal: number,
  now: Date,
): PromoResult {
  if (promo.valid_from && new Date(promo.valid_from) > now)
    return { ok: false, error: 'Промокод ще не діє' };
  if (promo.valid_until && new Date(promo.valid_until) < now)
    return { ok: false, error: 'Термін дії промокоду закінчився' };
  if (promo.max_uses !== null && promo.uses_count >= promo.max_uses)
    return { ok: false, error: 'Промокод вичерпано' };
  if (promo.min_order_amount && serverTotal < promo.min_order_amount)
    return { ok: false, error: `Мінімальна сума для цього промокоду — ${promo.min_order_amount} ₴` };

  const discountBase = serverEligibleTotal;
  let promoDiscount = promo.discount_type === 'percent'
    ? Math.round(discountBase * promo.discount_value / 100 * 100) / 100
    : Math.min(Number(promo.discount_value), discountBase);
  if (promo.max_discount_amount && promoDiscount > promo.max_discount_amount)
    promoDiscount = promo.max_discount_amount;

  const finalTotal = Math.max(0, serverTotal - (promoDiscount ?? 0));
  return { ok: true, finalTotal, promoDiscount, code: promo.code };
}

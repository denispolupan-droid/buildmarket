// Копія замовлення покупця: із позицій старого замовлення робимо рядки нової
// чернетки. Ціни НЕ переносяться — вони беруться з каталогу за тарифом клієнта
// на момент копіювання (правило проекту: суму рахуємо з БД, а не з того, що
// колись зберегли). Функція чиста, щоб її можна було покрити тестами.

import { priceForTier, type ProductPrices } from './price-tier';

export type CopySrcItem = {
  sku: string; name: string; brand?: string | null;
  qty: number; price: number; is_bonus?: boolean;
};

export type CopyProduct = ProductPrices & {
  sku: string; name?: string | null; brand?: string | null; matched?: boolean;
  /** Артикул, яким шукали: у замовленні може стояти артикул постачальника,
   *  а /api/admin/products/search-skus повертає наш sku (див. supplier_sku_map). */
  input_sku?: string | null;
};

export type CopyLine = {
  sku: string; name: string; brand: string;
  qty: number; price: number; matched: boolean; is_bonus?: boolean;
};

export type CopyResult = {
  lines: CopyLine[];
  /** Позиції, де ціна каталогу відрізняється від ціни у вихідному замовленні */
  changed: { sku: string; from: number; to: number }[];
  /** SKU, яких у каталозі вже немає — рядок лишається, але без ціни */
  missing: string[];
};

/** Різницю в копійках нижче 1 не рахуємо зміною ціни: це шум округлення. */
function differs(a: number, b: number): boolean {
  return Math.abs(a - b) >= 0.01;
}

export function buildCopyLines(
  items: CopySrcItem[],
  products: CopyProduct[],
  tier: string,
): CopyResult {
  const found = products.filter(p => p.matched !== false);
  const bySku = new Map<string, CopyProduct>();
  for (const p of found) {
    bySku.set(p.sku, p);
    if (p.input_sku) bySku.set(p.input_sku, p);
  }
  const lines: CopyLine[] = [];
  const changed: CopyResult['changed'] = [];
  const missing: string[] = [];

  for (const it of items) {
    const p = it.sku ? bySku.get(it.sku) : undefined;
    if (!p) {
      // Товару в каталозі немає (знятий з продажу, змінений артикул) — рядок
      // лишаємо з назвою, щоб менеджер бачив, що саме випало, і замінив вручну.
      if (it.sku) missing.push(it.sku);
      lines.push({
        sku: it.sku, name: it.name, brand: it.brand ?? '',
        qty: it.qty, price: 0, matched: false,
        ...(it.is_bonus ? { is_bonus: true } : {}),
      });
      continue;
    }

    // Подарункові позиції лишаються по нулю: бонус не «дорожчає» від того,
    // що прайс змінився.
    const catalogPrice = it.is_bonus
      ? 0
      : (priceForTier(p, tier) || Number(p.price_unit ?? 0) || Number(p.price_cost ?? 0) || 0);

    if (!it.is_bonus && catalogPrice > 0 && differs(catalogPrice, Number(it.price))) {
      changed.push({ sku: it.sku, from: Number(it.price), to: catalogPrice });
    }

    lines.push({
      sku: p.sku,
      name: p.name ?? it.name,
      brand: p.brand ?? it.brand ?? '',
      qty: it.qty,
      // Ціни в каталозі немає взагалі — краще лишити стару, ніж нуль у рахунку.
      price: catalogPrice > 0 ? catalogPrice : (it.is_bonus ? 0 : Number(it.price)),
      matched: true,
      ...(it.is_bonus ? { is_bonus: true } : {}),
    });
  }

  return { lines, changed, missing };
}

/** Короткий підсумок для тосту: що саме змінилось у копії. */
export function describeCopy(res: CopyResult): string | null {
  const parts: string[] = [];
  if (res.changed.length) {
    const sample = res.changed.slice(0, 2)
      .map(c => `${c.sku}: ${c.from.toFixed(2)} → ${c.to.toFixed(2)} ₴`)
      .join('; ');
    parts.push(res.changed.length === 1
      ? `ціна оновлена (${sample})`
      : `ціни оновлені у ${res.changed.length} позиціях (${sample}${res.changed.length > 2 ? '…' : ''})`);
  }
  if (res.missing.length) {
    parts.push(`немає в каталозі: ${res.missing.slice(0, 3).join(', ')}${res.missing.length > 3 ? '…' : ''}`);
  }
  return parts.length ? parts.join(' · ') : null;
}

// ── Словники ручного замовлення ──────────────────────────────────────────────
// Форма «Нове замовлення» знає лише три способи доставки й три способи оплати,
// а в замовленнях зустрічаються ще й маркетплейсові (rozetka_delivery, точки
// видачі) та банківські варіанти. Тому копія мапиться на найближче значення, а
// те, що не переноситься дослівно, дописуємо в коментар — щоб менеджер бачив,
// як було в оригіналі, і не здогадувався.

export function mapCopyDelivery(deliveryType: string | null | undefined): { delivery: string; kept: boolean } {
  if (deliveryType === 'nova_poshta') return { delivery: 'nova',    kept: true };
  if (deliveryType === 'pickup')      return { delivery: 'pickup',  kept: true };
  if (deliveryType === 'kharkiv')     return { delivery: 'kharkiv', kept: true };
  return { delivery: 'nova', kept: false };
}

export function mapCopyPayment(paymentType: string | null | undefined): { payment: string; kept: boolean } {
  if (paymentType === 'cod')     return { payment: 'cod',     kept: true };
  if (paymentType === 'cash')    return { payment: 'cash',    kept: true };
  if (paymentType === 'invoice') return { payment: 'invoice', kept: true };
  return { payment: 'invoice', kept: false };
}

/** Коментар копії: посилання на оригінал плюс те, що не влізло в словники форми. */
export function copyComment(orderNumber: number, notes: (string | null | undefined)[] = []): string {
  return [`Копія замовлення №${orderNumber}`, ...notes.filter(Boolean)].join(' · ');
}

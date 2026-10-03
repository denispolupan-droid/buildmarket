/**
 * Нормалізація позицій кошика перед збереженням для нагадувань.
 *
 * /api/cart/save відкритий без логіну (покупець ще не зареєстрований) і до
 * 03.10.2026 зберігав items як прислав браузер. Потім ці ж рядки йшли в лист із
 * noreply@fixline.com.ua і поверталися в кошик за посиланням відновлення. Тобто
 * будь-хто міг покласти в «назву товару» довільний текст і надіслати його на
 * будь-яку адресу від нашого імені.
 *
 * Що робимо: приймаємо лише відомі поля CartItem (кошик відновлюється з них, тому
 * структуру треба зберегти повністю, включно з полями картинки), відсікаємо SKU,
 * яких немає в каталозі, а назву/бренд/фасування беремо з бази. Ціну лишаємо
 * клієнтську: для оптовика вона інша, і сума в листі має збігатися з його
 * кошиком; у замовлення ця ціна все одно не потрапляє — /api/orders перераховує.
 * Чиста функція, щоб покрити тестами без БД.
 */

export type CatalogRow = { sku: string; name: string; brand: string | null; volume: string | null; name_ru?: string | null };

export type SavedCartItem = {
  sku: string; name: string; name_ru?: string | null; brand: string; volume: string | null;
  price: number; qty: number; min_order: number;
  nl1: string; nl2?: string; bc: string; ac: string; img_type: 'tube' | 'canister';
  imageUrl?: string; is_promo?: boolean;
};

export const MAX_CART_ITEMS = 50;
const MAX_QTY = 9999;
const MAX_PRICE = 1_000_000;
const MAX_STR = 200;

function str(v: unknown, max = MAX_STR): string {
  return typeof v === 'string' ? v.slice(0, max) : '';
}

function num(v: unknown, max: number): number | null {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > max) return null;
  return n;
}

/** Кандидати на пошук у каталозі: лише рядкові SKU розумної довжини, без дублів. */
export function cartSkus(items: unknown): string[] {
  if (!Array.isArray(items)) return [];
  const out = new Set<string>();
  for (const it of items.slice(0, MAX_CART_ITEMS)) {
    const sku = it && typeof it === 'object' ? (it as { sku?: unknown }).sku : null;
    if (typeof sku === 'string' && sku.length > 0 && sku.length <= 40) out.add(sku);
  }
  return [...out];
}

export type NormalizeResult =
  | { ok: true; items: SavedCartItem[]; total: number }
  | { ok: false; reason: 'empty' | 'unknown_sku' };

export function normalizeCartItems(raw: unknown, catalog: Map<string, CatalogRow>): NormalizeResult {
  if (!Array.isArray(raw) || raw.length === 0) return { ok: false, reason: 'empty' };

  const items: SavedCartItem[] = [];
  for (const r of raw.slice(0, MAX_CART_ITEMS)) {
    if (!r || typeof r !== 'object') continue;
    const it = r as Record<string, unknown>;
    const sku = typeof it.sku === 'string' ? it.sku : '';
    const row = catalog.get(sku);
    if (!row) return { ok: false, reason: 'unknown_sku' };

    const qty = num(it.qty, MAX_QTY);
    const price = num(it.price, MAX_PRICE);
    if (qty === null || qty <= 0 || price === null) continue;

    items.push({
      sku,
      name:      row.name,
      name_ru:   row.name_ru ?? null,
      brand:     row.brand ?? '',
      volume:    row.volume ?? null,
      price,
      qty:       Math.round(qty),
      min_order: Math.max(1, Math.round(num(it.min_order, MAX_QTY) ?? 1)),
      nl1:       str(it.nl1), nl2: str(it.nl2),
      bc:        str(it.bc, 40), ac: str(it.ac, 40),
      img_type:  it.img_type === 'canister' ? 'canister' : 'tube',
      ...(typeof it.imageUrl === 'string' && /^(\/|https:\/\/)/.test(it.imageUrl) ? { imageUrl: it.imageUrl.slice(0, 500) } : {}),
      ...(it.is_promo === true ? { is_promo: true } : {}),
    });
  }
  if (!items.length) return { ok: false, reason: 'empty' };

  const total = Math.round(items.reduce((s, i) => s + i.price * i.qty, 0) * 100) / 100;
  return { ok: true, items, total };
}

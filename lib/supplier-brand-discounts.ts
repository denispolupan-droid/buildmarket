// Нормалізація рядків «Наценки і знижки по брендах» з картки постачальника
// перед записом у supplier_brand_discounts.
//
// Форма шле значення полів як рядки (`'10'`, `''`), а сервер раніше віддавав їх
// у numeric-колонки як є: порожня націнка → `''` → помилка вставки, якої ніхто
// не перевіряв, — а знижки постачальника вже були видалені. Тут усе зводиться
// до чисел/null, і рядок без бренду або з битим числом відкидається з помилкою
// ДО того, як щось торкнеться бази.

export type BrandDiscountRow = {
  brand:            string;
  discount_pct:     number;
  markup_retail:    number | null;
  markup_wholesale: number | null;
  markup_drop:      number | null;
  keep_price:       boolean;
};

export type NormalizeResult =
  | { ok: true; rows: BrandDiscountRow[] }
  | { ok: false; error: string };

function numOrNull(v: unknown, field: string, brand: string): number | null | { error: string } {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
  if (!Number.isFinite(n)) return { error: `Бренд «${brand}»: поле ${field} — не число` };
  return n;
}

export function normalizeBrandDiscounts(input: unknown): NormalizeResult {
  if (input == null) return { ok: true, rows: [] };
  if (!Array.isArray(input)) return { ok: false, error: 'brand_discounts має бути масивом' };

  const rows: BrandDiscountRow[] = [];
  const seen = new Set<string>();

  for (const raw of input as Record<string, unknown>[]) {
    const brand = String(raw?.brand ?? '').trim();
    if (!brand) return { ok: false, error: 'Є рядок знижки без бренду — оберіть бренд або видаліть рядок' };
    if (seen.has(brand)) return { ok: false, error: `Бренд «${brand}» вказано двічі` };
    seen.add(brand);

    const d = numOrNull(raw.discount_pct, 'знижка', brand);
    if (d !== null && typeof d === 'object') return { ok: false, error: d.error };
    const discount = d ?? 0;
    if (discount < 0 || discount >= 100) return { ok: false, error: `Бренд «${brand}»: знижка має бути від 0 до 99.99 %` };

    const markups: Record<'markup_retail' | 'markup_wholesale' | 'markup_drop', number | null> = {
      markup_retail: null, markup_wholesale: null, markup_drop: null,
    };
    for (const key of Object.keys(markups) as (keyof typeof markups)[]) {
      const m = numOrNull(raw[key], key, brand);
      if (m !== null && typeof m === 'object') return { ok: false, error: m.error };
      markups[key] = m;
    }

    rows.push({
      brand,
      discount_pct: discount,
      ...markups,
      keep_price: raw.keep_price === true,
    });
  }

  return { ok: true, rows };
}

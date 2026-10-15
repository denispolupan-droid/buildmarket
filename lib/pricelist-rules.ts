/**
 * Спільні правила прайс-листа — для PDF, XLSX, листа і HTML-перегляду.
 * Чотири генератори раніше мали по своїй копії й розходилися.
 */

/** Ціна в прайсі завжди з двома знаками: «722,50», «1 169,13», «705,00». */
export function formatPricelistPrice(v: number): string {
  return v.toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Чи потрапляє товар у прайс за вибраними категоріями.
 * `selected === null` — «усі категорії»: беремо все, товари без категорії
 * йдуть у групу «Інше». Якщо ж категорії вибрані, товар без категорії
 * НЕ потрапляє (раніше він проходив у будь-який прайс — засоби для деревини
 * опинялися в прайсі «піни»). Підкатегорія проходить і за вибраним батьком.
 */
export function pricelistCategoryMatch(
  categorySlug: string | null | undefined,
  selected: ReadonlySet<string> | null,
  parentSlug?: string | null,
): boolean {
  if (!selected) return true;
  if (!categorySlug) return false;
  if (selected.has(categorySlug)) return true;
  return !!parentSlug && selected.has(parentSlug);
}

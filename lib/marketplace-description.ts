// Що саме з описів товару їде у фіди маркетплейсів — і чи безпечний цей текст
// для їхньої модерації. Тут навмисно немає AI-SDK: модуль імпортують роути фідів,
// і тягнути в них клієнт Anthropic заради двох рядків вибору поля — зайве.
// Генерація живе поруч, у marketplace-description-gen.ts.

/** Межі довжини: нижче — картка виглядає порожньою, вище — маркетплейс ріже текст. */
export const MP_MIN_CHARS = 550;
export const MP_MAX_CHARS = 1100;

/**
 * Текст, який іде у фід: власний опис для маркетплейсу, а якщо його ще немає —
 * старий повний опис. Порожнього опису у фіді бути не повинно: картка без тексту
 * гірша за картку з дублем.
 */
export function mpDescription(p: {
  description_mp?: string | null;
  description_full?: string | null;
  description?: string | null;
}): string {
  return (p.description_mp?.trim() || p.description_full?.trim() || p.description?.trim() || '');
}

export function mpDescriptionRu(p: {
  description_mp_ru?: string | null;
  description_full_ru?: string | null;
  description_ru?: string | null;
}): string {
  return (p.description_mp_ru?.trim() || p.description_full_ru?.trim() || p.description_ru?.trim() || '');
}

/** Стоп-сигнали модерації: те, за що Rozetka блокує поле опису. */
const BANNED = [/fixline/i, /інтернет-магазин/i, /интернет-магазин/i, /новою поштою/i, /новой почтой/i, /https?:\/\//i, /www\./i];

/** Чи безпечний текст для маркетплейсу (використовується в тестах і перед записом). */
export function isMpDescriptionClean(text: string): boolean {
  return !BANNED.some(re => re.test(text));
}

/**
 * Слова не тією мовою — по літерах, яких в іншій мові не існує (і/ї/є/ґ проти
 * ы/ъ/э/ё). Ловить не все («диаметр» в українському тексті так не видно), але
 * ловить дешево і без словника; решту тримає інструкція в промпті.
 * Власна назва товару виключається: у російському тексті лінійка лишається
 * як на упаковці («Lacrysil Надміцний»), і це не помилка.
 */
export function languageSlips(text: string, lang: 'uk' | 'ru', productName = ''): string[] {
  const alien = lang === 'ru' ? /[іїєґ]/i : /[ыъэё]/i;
  const known = new Set(productName.toLowerCase().split(/[^\p{L}\d'’-]+/u).filter(Boolean));
  const words = text.split(/[^\p{L}'’-]+/u).filter(Boolean);
  return [...new Set(words.filter(w => alien.test(w) && !known.has(w.toLowerCase())))];
}

// Генерація ЧПУ-слагів товарів: транслітерація укр → латиниця
// (офіційна система КМУ 2010, як у слагах категорій: "ґрунтівки" → "gruntivky").

const UK_MAP: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'h', ґ: 'g', д: 'd', е: 'e', є: 'ie', ж: 'zh',
  з: 'z', и: 'y', і: 'i', ї: 'i', й: 'i', к: 'k', л: 'l', м: 'm', н: 'n',
  о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts',
  ч: 'ch', ш: 'sh', щ: 'shch', ь: '', ю: 'iu', я: 'ia', "'": '', 'ʼ': '',
  // російські літери, що трапляються в назвах
  ы: 'y', э: 'e', ё: 'e', ъ: '',
};

// Одиниці виміру — латинськими скороченнями, а не побуквенною транслітерацією
// ("5 кг" → "5-kg", а не "5-kh")
const UNITS: Record<string, string> = { 'кг': 'kg', 'г': 'g', 'л': 'l', 'мл': 'ml' };

export function transliterate(text: string): string {
  return text
    .toLowerCase()
    .replace(/(\d[\d.,]*)\s*(кг|мл|г|л)(?![а-яіїєґ])/g, (_m, n: string, u: string) => `${n} ${UNITS[u]}`)
    .split('')
    .map(ch => UK_MAP[ch] ?? ch)
    .join('');
}

/** Слаг з назви товару: "Грунтовка Ceresit CT 17, 5 л" → "gruntovka-ceresit-ct-17-5-l" */
export function slugify(text: string, maxLen = 80): string {
  let slug = transliterate(text)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  if (slug.length > maxLen) {
    const cut = slug.lastIndexOf('-', maxLen);
    slug = slug.slice(0, cut > 40 ? cut : maxLen).replace(/-$/, '');
  }
  return slug;
}

/**
 * Слаг товару: бренд + назва (+ фасовка, якщо її немає в назві).
 * Унікальність забезпечує викликаючий код (додаванням SKU при колізії).
 */
export function generateProductSlug(p: { name: string; brand: string; volume?: string | null }): string {
  const name = p.name.trim();
  const withBrand = name.toLowerCase().includes(p.brand.trim().toLowerCase())
    ? name
    : `${p.brand} ${name}`;
  const volume = p.volume?.trim();
  const withVolume = volume && !withBrand.toLowerCase().includes(volume.toLowerCase())
    ? `${withBrand} ${volume}`
    : withBrand;
  return slugify(withVolume);
}

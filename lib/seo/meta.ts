import type { Metadata } from 'next';
import type { Category, ProductFull, ProductListItem } from '../../types';

// Єдиний модуль генерації метатегів (SEO_SPEC, Фаза 2).
// Таргетинг національний: «купити в Україні», доставка Нова Пошта.
// Місто в title/description товарів і категорій не зашиваємо.

const BASE = 'https://fixline.com.ua';

export type Lang = 'uk' | 'ru';

const T = {
  uk: {
    buyIn: 'купити в Україні',
    buy: 'купити',
    priceFrom: 'ціна від',
    from: 'від',
    uah: 'грн',
    inStock: 'в наявності',
    onOrder: 'під замовлення',
    delivery: 'Доставка Новою Поштою по Україні.',
    price: 'Ціна',
    goods: 'товарів',
    pricesFromTo: (min: number, max: number) => `ціни від ${min} до ${max} грн`,
    bestPrice: 'за вигідною ціною',
    locale: 'uk_UA',
  },
  ru: {
    buyIn: 'купить в Украине',
    buy: 'купить',
    priceFrom: 'цена от',
    from: 'от',
    uah: 'грн',
    inStock: 'в наличии',
    onOrder: 'под заказ',
    delivery: 'Доставка Новой Почтой по Украине.',
    price: 'Цена',
    goods: 'товаров',
    pricesFromTo: (min: number, max: number) => `цены от ${min} до ${max} грн`,
    bestPrice: 'по выгодной цене',
    locale: 'ru_RU',
  },
} as const;

const collapse = (s: string) => s.replace(/\s+/g, ' ').trim();

/** Канонічний шлях товару: ЧПУ-слаг, з фолбеком на SKU (старі URL 308-редіректяться). */
export function productPath(p: { slug?: string | null; sku: string }, lang: Lang = 'uk'): string {
  const path = `/product/${p.slug ?? p.sku}`;
  return lang === 'ru' ? `/ru${path}` : path;
}

/** Роздрібна ціна — та сама, що бачить гість на сторінці та в Product JSON-LD. */
export function retailPrice(product: { stock: ProductListItem['stock'] }): number | null {
  const s = product.stock;
  if (!s) return null;
  return s.price_promo ?? s.price_retail ?? null;
}

const VOLUME_TAIL = /\d[\d.,]*\s*(л|мл|кг|г)\.?\s*$/i;

/**
 * Повне ім'я товару без дублів: бренд не додаємо, якщо він уже є в назві;
 * фасовку не додаємо, якщо назва вже містить її або закінчується на об'єм/вагу
 * (ловить кейс «0,28 кг» у назві + volume «280 г»).
 */
export function productDisplayName(
  product: Pick<ProductFull, 'name' | 'brand' | 'volume'> & { name_ru?: string | null },
  lang: Lang = 'uk',
): string {
  const name = collapse((lang === 'ru' ? product.name_ru : null) ?? product.name);
  const brand = collapse(product.brand);
  const withBrand = name.toLowerCase().includes(brand.toLowerCase()) ? name : `${brand} ${name}`;
  const volume = product.volume ? collapse(product.volume) : '';
  const hasVolume = !volume
    || withBrand.toLowerCase().includes(volume.toLowerCase())
    || VOLUME_TAIL.test(withBrand);
  return hasVolume ? withBrand : `${withBrand} ${volume}`;
}

/** H1: назва з фасовкою, без дублювання бренду (бренд виводиться окремим рядком). */
export function productH1(
  product: Pick<ProductFull, 'name' | 'volume'> & { name_ru?: string | null },
  lang: Lang = 'uk',
): string {
  const name = collapse((lang === 'ru' ? product.name_ru : null) ?? product.name);
  const volume = product.volume ? collapse(product.volume) : '';
  const hasVolume = !volume
    || name.toLowerCase().includes(volume.toLowerCase())
    || VOLUME_TAIL.test(name);
  return hasVolume ? name : `${name}, ${volume}`;
}

/** Видима частина title (без « | FIXLINE») — цільова довжина ≤65 символів. */
const TITLE_VISIBLE_MAX = 65;

export function productTitle(product: ProductFull, lang: Lang = 'uk'): string {
  const t = T[lang];
  const name = productDisplayName(product, lang);
  const price = retailPrice(product);
  const full = price
    ? `${name} — ${t.buyIn}, ${t.priceFrom} ${price} ${t.uah}`
    : `${name} — ${t.buyIn}`;
  if (full.length <= TITLE_VISIBLE_MAX) return full;
  // Деградація для довгих назв: головні слова лишаються на початку
  return price ? `${name} — ${t.buy}, ${t.from} ${price} ${t.uah}` : `${name} — ${t.buy}`;
}

/** Description 150–160 симв.: унікальний фрагмент з БД + ціна/наявність/доставка. */
export function productDescription(product: ProductFull, lang: Lang = 'uk'): string {
  const t = T[lang];
  const price = retailPrice(product);
  const inStock = product.stock?.stock_status !== 'out_of_stock';
  const tailParts = [
    price ? `${t.price} ${price} ${t.uah}, ${inStock ? t.inStock : t.onOrder}.` : null,
    t.delivery,
  ].filter(Boolean);
  const tail = tailParts.join(' ');

  const dbDesc = (lang === 'ru' ? product.description_ru : null) ?? product.description;
  const intro = collapse(dbDesc ?? productDisplayName(product, lang));

  const room = 160 - tail.length - 1;
  let head = intro;
  if (head.length > room) {
    const cut = head.lastIndexOf(' ', room - 1);
    head = head.slice(0, cut > 40 ? cut : room).replace(/[\s,;:—–-]+$/, '') + '…';
  } else if (!/[.!?…]$/.test(head)) {
    head += '.';
  }
  return `${head} ${tail}`;
}

function alternatesFor(path: string, lang: Lang) {
  return {
    canonical: lang === 'uk' ? `${BASE}${path}` : `${BASE}/ru${path}`,
    languages: {
      uk: `${BASE}${path}`,
      ru: `${BASE}/ru${path}`,
      'x-default': `${BASE}${path}`,
    },
  };
}

function ogTwitter(title: string, description: string, url: string, lang: Lang, image: string) {
  return {
    openGraph: {
      title,
      description,
      url,
      siteName: 'FIXLINE',
      locale: T[lang].locale,
      type: 'website' as const,
      images: [{ url: image, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: 'summary_large_image' as const,
      title,
      description,
      images: [image],
    },
  };
}

export function productMeta(product: ProductFull, lang: Lang = 'uk'): Metadata {
  const title = productTitle(product, lang);
  const description = productDescription(product, lang);
  const path = productPath(product);
  const url = lang === 'uk' ? `${BASE}${path}` : `${BASE}/ru${path}`;
  const keywordsRaw = (lang === 'ru' ? product.keywords_ru : null) ?? product.keywords;
  return {
    title,
    description,
    keywords: [
      ...(keywordsRaw?.split(',').map(k => k.trim()).filter(Boolean) ?? []),
      product.brand,
      productDisplayName(product, lang),
      T[lang].buy,
      product.sku,
    ],
    ...ogTwitter(title, description, url, lang, `${BASE}${path}/opengraph-image`),
    alternates: alternatesFor(path, lang),
  };
}

/**
 * Слаги категорії разом з УСІМА нащадками (товари прив'язані до листків дерева).
 * Дерево трирівневе: farby → farby-3v1 → farby-3v1-akrylovi. Обхід лише на один
 * рівень губив онуків, і батьківська категорія недораховувала товари, ціни й
 * посилання в ItemList.
 */
export function categoryFamilySlugs(categories: Pick<Category, 'slug' | 'parent_slug'>[], slug: string): string[] {
  const out = [slug];
  for (let i = 0; i < out.length; i++) {
    for (const c of categories) if (c.parent_slug === out[i]) out.push(c.slug);
  }
  return out;
}

/**
 * Батьківський слаг, якщо листинг категорії — точна копія батьківського.
 * Так буває, коли в батька немає власних товарів і лише одна дитина з товаром:
 * дві адреси віддають один і той самий набір і конкурують у видачі
 * (пластифікатори ↔ пластифікатори для бетону, замазки для швів ↔ цементні).
 * Перевірка за фактом, тож щойно з'явиться друга наповнена дитина — збіг зникне.
 */
export function duplicateOfParent(
  categories: Pick<Category, 'slug' | 'parent_slug'>[],
  products: { category_slug: string | null }[],
  slug: string,
): string | null {
  const cat = categories.find(c => c.slug === slug);
  if (!cat?.parent_slug) return null;
  const countOf = (s: string) => {
    const fam = new Set(categoryFamilySlugs(categories, s));
    return products.filter(p => p.category_slug && fam.has(p.category_slug)).length;
  };
  const own = countOf(slug);
  if (own === 0) return null;
  return own === countOf(cat.parent_slug) ? cat.parent_slug : null;
}

/**
 * Категорії, у яких є хоч один активний товар — свій або в будь-якого нащадка.
 * Порожня категорія не має потрапляти ні в sitemap, ні в індекс: це тонка
 * сторінка, яка тільки розмиває краулінговий бюджет.
 */
export function categoriesWithProducts(
  categories: Pick<Category, 'slug' | 'parent_slug'>[],
  products: { category_slug: string | null }[],
): Set<string> {
  const own = new Set(products.map(p => p.category_slug).filter(Boolean) as string[]);
  const withProducts = new Set<string>();
  for (const c of categories) {
    if (categoryFamilySlugs(categories, c.slug).some(s => own.has(s))) withProducts.add(c.slug);
  }
  return withProducts;
}

/** Базова назва без фасовки в кінці — для групування варіантів одного продукту. */
export function variantBaseName(name: string): string {
  return collapse(name)
    .replace(/[,–—-]?\s*\d[\d.,]*\s*(л|мл|кг|г)\.?\s*$/i, '')
    .toLowerCase();
}

/** Об'єм/вага у базових одиницях (мл/г) — для сортування фасовок. */
export function volumeValue(volume: string | null): number {
  if (!volume) return 0;
  const m = collapse(volume).match(/(\d[\d.,]*)\s*(л|мл|кг|г)/i);
  if (!m) return 0;
  const n = parseFloat(m[1].replace(',', '.'));
  const unit = m[2].toLowerCase();
  return unit === 'л' || unit === 'кг' ? n * 1000 : n;
}

/** Інші фасовки того самого продукту (той самий бренд + базова назва), за зростанням об'єму. */
export function findVariants<T extends Pick<ProductFull, 'sku' | 'name' | 'brand' | 'volume'>>(
  products: T[],
  current: Pick<ProductFull, 'sku' | 'name' | 'brand'>,
): T[] {
  const base = variantBaseName(current.name);
  return products
    .filter(p => p.sku !== current.sku
      && !!p.volume
      && p.brand.trim().toLowerCase() === current.brand.trim().toLowerCase()
      && variantBaseName(p.name) === base)
    .sort((a, b) => volumeValue(a.volume) - volumeValue(b.volume));
}

export type ListingStats = { count: number; minPrice: number | null; maxPrice: number | null };

export function listingStats(products: ProductListItem[]): ListingStats {
  const prices = products
    .map(p => retailPrice(p))
    .filter((p): p is number => p != null && p > 0);
  return {
    count: products.length,
    minPrice: prices.length ? Math.min(...prices) : null,
    maxPrice: prices.length ? Math.max(...prices) : null,
  };
}

function listingDescription(name: string, stats: ListingStats, lang: Lang, curated?: string | null): string {
  const t = T[lang];
  if (curated) return curated;
  const range = stats.minPrice && stats.maxPrice && stats.maxPrice > stats.minPrice
    ? `, ${t.pricesFromTo(stats.minPrice, stats.maxPrice)}`
    : stats.minPrice ? `, ${t.priceFrom} ${stats.minPrice} ${t.uah}` : '';
  return `${name} — ${stats.count} ${t.goods}${range}. ${t.delivery}`;
}

export function categoryMeta(
  cat: Pick<Category, 'slug' | 'name'>,
  stats: ListingStats,
  lang: Lang = 'uk',
  opts?: { nameRu?: string; curatedDescription?: string | null; canonicalSlug?: string },
): Metadata {
  const t = T[lang];
  const name = lang === 'ru' ? (opts?.nameRu ?? cat.name) : cat.name;
  const title = `${name} — ${t.buyIn} ${t.bestPrice}`;
  const description = listingDescription(name, stats, lang, opts?.curatedDescription);
  // canonicalSlug — коли листинг дублює батьківський: canonical і hreflang ведуть
  // на батька, щоб дві адреси не ділили між собою сигнали (див. duplicateOfParent)
  const path = `/shop/${opts?.canonicalSlug ?? cat.slug}`;
  const url = lang === 'uk' ? `${BASE}${path}` : `${BASE}/ru${path}`;
  return {
    title,
    description,
    keywords: [name, t.buy, 'будівельна хімія', 'строительная химия'],
    robots: { index: true, follow: true, googleBot: { index: true, follow: true } },
    ...ogTwitter(title, description, url, lang, `${BASE}${path}/opengraph-image`),
    alternates: alternatesFor(path, lang),
  };
}

export function brandMeta(
  brand: string,
  slug: string,
  stats: ListingStats,
  lang: Lang = 'uk',
): Metadata {
  const t = T[lang];
  const title = `${brand} — ${t.buyIn} ${t.bestPrice}`;
  const description = listingDescription(brand, stats, lang);
  const path = `/shop/brand/${slug}`;
  const url = lang === 'uk' ? `${BASE}${path}` : `${BASE}/ru${path}`;
  return {
    title,
    description,
    keywords: [brand, t.buy, 'будівельна хімія', 'строительная химия'],
    robots: { index: true, follow: true, googleBot: { index: true, follow: true } },
    ...ogTwitter(title, description, url, lang, `${BASE}${path}/opengraph-image`),
    alternates: alternatesFor(path, lang),
  };
}

export function categoryBrandMeta(
  cat: Pick<Category, 'slug' | 'name'>,
  brandName: string,
  brandSlug: string,
  stats: ListingStats,
  lang: Lang = 'uk',
  // canonicalPath: коли перетин категорія×бренд на 100% збігається з категорією
  // (бренд покриває всю категорію) або зі сторінкою бренду (бренд живе лише в цій
  // категорії) — canonical вказує на ту ширшу сторінку, інакше GSC бачить «копію»
  // (реальний кейс: /shop/grunty/polifarb ≡ /shop/grunty, 12/12 товарів).
  opts?: { nameRu?: string; canonicalPath?: string },
): Metadata {
  const t = T[lang];
  const catName = (lang === 'ru' ? (opts?.nameRu ?? cat.name) : cat.name).toLowerCase();
  const name = `${brandName} ${catName}`;
  const withPrice = stats.minPrice
    ? `${name} — ${t.buyIn}, ${t.priceFrom} ${stats.minPrice} ${t.uah}`
    : '';
  const title = withPrice && withPrice.length <= TITLE_VISIBLE_MAX
    ? withPrice
    : `${name} — ${t.buyIn}`;
  const description = listingDescription(name, stats, lang);
  const path = `/shop/${cat.slug}/${brandSlug}`;
  const url = lang === 'uk' ? `${BASE}${path}` : `${BASE}/ru${path}`;
  return {
    title,
    description,
    keywords: [brandName, cat.name, t.buy],
    robots: { index: true, follow: true, googleBot: { index: true, follow: true } },
    ...ogTwitter(title, description, url, lang, `${BASE}/opengraph-image`),
    alternates: alternatesFor(opts?.canonicalPath ?? path, lang),
  };
}

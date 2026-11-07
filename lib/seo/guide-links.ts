import type { CategoryMeta, CategoryGuide } from '../category-descriptions';
import { brandSlug } from './slug';

/**
 * Посилання на товари й бренди в гайді категорії «Як вибрати» (07.11.2026).
 *
 * Розмітка в тексті — та сама, що для категорій: [текст](/шлях) (рендерить
 * CategoryAbout.withLinks). Тут дві речі, обидві на рендері:
 *
 *  1. Товари. У тексті посилання пишеться на АРТИКУЛ — [Ceresit CS 25](/product/1005-025):
 *     артикул стабільний, а слаг товару може змінитись. Тут він замінюється на
 *     канонічну адресу (/product/<slug>). Якщо товар знято з продажу — посилання
 *     прибирається, лишається звичайний текст (як із цінами в lib/seo/guide-prices).
 *
 *  2. Бренди. Назви брендів у тексті не розмічені — перше згадування бренду в
 *     кожному розділі стає посиланням на сторінку бренду автоматично. Лише
 *     перше: синій текст у кожному реченні читається гірше, а пошуковики не
 *     люблять перевантаження посиланнями. Бренд не чіпаємо, якщо в розділі вже
 *     є посилання з його назвою (на товар цього бренду).
 */

export type LinkProduct = {
  sku: string; slug?: string | null; brand?: string | null;
  name?: string | null; category_slug?: string | null;
  /** У наявності (stock_status in_stock або залишок ≥ 1) */
  inStock?: boolean;
};

const norm = (s: string) => s.toLowerCase().replace(/[«»"“”„']/g, '').replace(/[’ʼ`]/g, "'").replace(/\s+/g, ' ').trim();
const hasWord = (hay: string, needle: string) =>
  !!needle && new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(needle)}(?![\\p{L}\\p{N}])`, 'u').test(hay);

type LinkCtx = { bySku: Map<string, LinkProduct>; byBrand: Map<string, LinkProduct[]>; brands: string[]; family: Set<string>; guideSlug: string | null };

/** Скільки товарів бренду має бути в самій категорії, щоб існувала сторінка /shop/<категорія>/<бренд> (див. app/shop/[category]/[brand]). */
const CATEGORY_BRAND_PAGE_MIN = 5;

/**
 * Куди веде бренд із гайда (07.11.2026) — до товарів бренду саме цієї групи:
 *  1) є сторінка «категорія + бренд» (5+ товарів бренду в самій категорії) — на неї;
 *  2) товари бренду є в категорії чи підкатегоріях — категорія з увімкненим фільтром ?brand=;
 *  3) бренд згаданий мимохідь, у цій групі його товарів немає — загальна сторінка бренду.
 */
export function brandHref(brand: string, ctx: LinkCtx): string {
  const items = ctx.byBrand.get(brand) ?? [];
  const slug = ctx.guideSlug;
  if (slug) {
    if (items.filter(p => p.category_slug === slug).length >= CATEGORY_BRAND_PAGE_MIN) return `/shop/${slug}/${brandSlug(brand)}`;
    if (items.some(p => p.category_slug && ctx.family.has(p.category_slug))) return `/shop/${slug}?brand=${encodeURIComponent(brand)}`;
  }
  return `/shop/brand/${brandSlug(brand)}`;
}

/**
 * Товари тієї ж моделі, що й текст посилання: «Ceresit CS 25» → усі кольори й
 * фасовки CS 25. Модель — текст без бренду; збіг цілими словами, без лапок і
 * регістру (як у scripts/guide-product-links.mts, яким посилання розставлено).
 */
function sameModel(label: string, ctx: LinkCtx): { brand: string | null; items: LinkProduct[] } {
  const ln = norm(label);
  const brand = ctx.brands.find(b => hasWord(ln, norm(b))) ?? null;
  if (!brand) return { brand: null, items: [] };
  const tail = norm(ln.replace(new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(norm(brand))}(?![\\p{L}\\p{N}])`, 'u'), ' '));
  if (!tail) return { brand, items: [] };
  const items = (ctx.byBrand.get(brand) ?? []).filter(p => {
    const nm = norm(p.name ?? '');
    return hasWord(nm, ln) || hasWord(nm, tail);
  });
  return { brand, items };
}

/** Найкращий із варіантів: у наявності → з категорії гайда → найкоротша назва → менший артикул. */
function bestOf(items: LinkProduct[], family: Set<string>): LinkProduct | undefined {
  return [...items].sort((a, b) =>
    Number(!!b.inStock) - Number(!!a.inStock)
    || Number(!!(b.category_slug && family.has(b.category_slug))) - Number(!!(a.category_slug && family.has(a.category_slug)))
    || (a.name ?? '').length - (b.name ?? '').length
    || a.sku.localeCompare(b.sku))[0];
}

const LINK = /\[([^\]]+)\]\((\/[^)\s]+)\)/g;
const PRODUCT_PATH = /^\/product\/([^/?#]+)$/;

/** Бренди-звичайні слова: «Сталь» на початку речення — не бренд. Не лінкуємо. */
const SKIP_BRANDS = new Set(['сталь']);

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * [текст](/product/SKU) → канонічна адреса. Якщо товар закінчився, а інший варіант
 * тієї ж моделі є в наявності — посилання веде на нього. Якщо товар знято з
 * продажу — на інший варіант моделі; немає жодного — на сторінку бренду; немає
 * й бренду — лишається текст (07.11.2026).
 */
export function resolveProductLinks(text: string, ctx: LinkCtx): string {
  const href = (p: LinkProduct) => `/product/${p.slug || p.sku}`;
  return text.replace(LINK, (whole, label: string, path: string) => {
    const m = PRODUCT_PATH.exec(path);
    if (!m) return whole;
    const p = ctx.bySku.get(decodeURIComponent(m[1]));
    if (p?.inStock) return `[${label}](${href(p)})`;
    const model = sameModel(label, ctx);
    const alt = bestOf(model.items.filter(x => x.sku !== p?.sku), ctx.family);
    if (p) return `[${label}](${href(alt?.inStock ? alt : p)})`;
    if (alt) return `[${label}](${href(alt)})`;
    if (model.brand && ctx.byBrand.get(model.brand)?.length) return `[${label}](${brandHref(model.brand, ctx)})`;
    return label;
  });
}

/**
 * Перше згадування кожного бренду в розділі (масив абзаців) → посилання на
 * сторінку бренду. Згадування всередині наявних посилань і токенів {…} не чіпає.
 */
export function linkBrandsInSection(paras: string[], brands: string[], hrefFor: (brand: string) => string = b => `/shop/brand/${brandSlug(b)}`): string[] {
  const list = [...new Set(brands.map(b => b.trim()).filter(b => b.length >= 3 && !SKIP_BRANDS.has(b.toLowerCase())))]
    .sort((a, b) => b.length - a.length); // «Aqua Protect» раніше за можливе «Aqua»
  const out = [...paras];
  const linkedText = out.join('\n').match(LINK)?.map(l => l.toLowerCase()) ?? [];
  for (const brand of list) {
    const lower = brand.toLowerCase();
    // У розділі вже є посилання з цим брендом (на товар чи бренд) — другого не треба
    if (linkedText.some(l => l.includes(lower))) continue;
    // Межі слова для кирилиці: \b у JS працює лише з латиницею
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(brand)}(?![\\p{L}\\p{N}])`, 'iu');
    for (let i = 0; i < out.length; i++) {
      const replaced = replaceOutsideLinks(out[i], re, m => `[${m}](${hrefFor(brand)})`);
      if (replaced !== null) { out[i] = replaced; break; }
    }
  }
  return out;
}

/** Замінює ПЕРШИЙ збіг поза [..](..) і {..}; null — збігу поза ними немає. */
function replaceOutsideLinks(text: string, re: RegExp, wrap: (m: string) => string): string | null {
  const protectedRe = /\[[^\]]+\]\([^)\s]+\)|\{[^}]*\}/g;
  let last = 0;
  let m: RegExpExecArray | null;
  const parts: { s: string; free: boolean }[] = [];
  while ((m = protectedRe.exec(text))) {
    if (m.index > last) parts.push({ s: text.slice(last, m.index), free: true });
    parts.push({ s: m[0], free: false });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ s: text.slice(last), free: true });
  for (const part of parts) {
    if (!part.free) continue;
    const hit = re.exec(part.s);
    if (!hit) continue;
    part.s = part.s.slice(0, hit.index) + wrap(hit[0]) + part.s.slice(hit.index + hit[0].length);
    return parts.map(p => p.s).join('');
  }
  return null;
}

export function buildLinkCtx(products: LinkProduct[], familySlugs: string[] = []): LinkCtx {
  const byBrand = new Map<string, LinkProduct[]>();
  for (const p of products) {
    const b = (p.brand ?? '').trim();
    if (b) byBrand.set(b, [...(byBrand.get(b) ?? []), p]);
  }
  // Довші назви першими: «Aqua Protect» раніше за «Aqua»
  const brands = [...byBrand.keys()].sort((a, b) => b.length - a.length);
  // familySlugs[0] — сама категорія гайда (categoryFamilySlugs кладе її першою)
  return { bySku: new Map(products.map(p => [p.sku, p])), byBrand, brands, family: new Set(familySlugs), guideSlug: familySlugs[0] ?? null };
}

/** Гайд із живими посиланнями: товари — на канонічні адреси (або текстом), бренди — автоматично. */
export function resolveGuideLinks(meta: CategoryMeta, products: LinkProduct[], familySlugs: string[] = []): CategoryMeta {
  if (!meta.guide) return meta;
  const ctx = buildLinkCtx(products, familySlugs);
  const guide: CategoryGuide = {
    ...meta.guide,
    sections: meta.guide.sections.map(sec => ({
      ...sec,
      p: linkBrandsInSection(sec.p.map(t => resolveProductLinks(t, ctx)), ctx.brands, b => brandHref(b, ctx)),
    })),
  };
  return { ...meta, guide };
}

import { getCategoryMeta, type CategoryMeta } from '../category-descriptions';
import { getCategoryMetaRu } from '../category-descriptions-ru';
import { categoryFamilySlugs, retailPrice } from './meta';
import type { Category, ProductStockPublic } from '../../types';

/**
 * Живі ціни в гайдах і FAQ категорій.
 *
 * Гайди «Як вибрати» пишуться з реальними цінами («Lotus — 66 грн за 1 л»),
 * і як текст вони застарівають при першому ж перерахунку прайсу. Тому в
 * текстах стоять токени, а числа підставляються на рендері з тієї самої ціни,
 * що на ціннику в листингу (promo ?? retail):
 *
 *   {price:1204-007}         → 66 грн           ціна товару за артикулом
 *   {price:1204-007 / 5}     → 13 грн           ціна, поділена на константу з тексту
 *                                                (літрів розчину з літра концентрату,
 *                                                м² з банки) — норма лишається ручною,
 *                                                бо «Витрата матеріалу» в характеристиках
 *                                                записана 215 різними способами
 *   {range:1204-007,1204-010} → 66–423 грн      мін–макс серед перелічених артикулів
 *   {range:1204-007,1204-010 / 4}                те саме, поділене
 *   {range}                   → 66–1 586 грн    мін–макс по всій родині категорії
 *   {min} {max} {count}       → по всій родині категорії (як у title)
 *
 * Токен, який не розв'язався (товар знято, артикул із помилкою), НЕ виводиться:
 * речення з ним викидається цілком, а порожній абзац — разом із заголовком
 * розділу. У HTML ніколи не потрапить ані «{price:…}», ані «від — грн». Що
 * саме не розв'язалось — повертається окремо, для аудиту категорій.
 */

export type PricedProduct = { sku: string; category_slug: string | null; price: number | null };

export type ResolvedMeta = { meta: CategoryMeta; unresolved: string[] };

const TOKEN = /\{(price|range|min|max|count)(?::([^}\/]+))?(?:\s*\/\s*([\d.,]+))?\}/g;

/** «1 586 грн» — тисячі через пробіл, як у написаних текстах гайдів. */
function num(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}
export function formatUah(n: number): string {
  return `${num(n)} грн`;
}

function resolveToken(kind: string, arg: string | undefined, div: string | undefined, ctx: {
  bySku: Map<string, number>; family: number[]; count: number;
}): string | null {
  const d = div ? Number(div.replace(',', '.')) : 1;
  if (!d || d <= 0) return null;
  const fmt = (n: number) => formatUah(n / d);
  if (kind === 'count') return String(ctx.count);
  if (kind === 'min' || kind === 'max') {
    if (!ctx.family.length) return null;
    return fmt(kind === 'min' ? Math.min(...ctx.family) : Math.max(...ctx.family));
  }
  if (kind === 'price') {
    const p = arg ? ctx.bySku.get(arg.trim()) : undefined;
    return p && p > 0 ? fmt(p) : null;
  }
  if (kind === 'range') {
    const ps = arg
      ? arg.split(',').map(s => ctx.bySku.get(s.trim())).filter((p): p is number => !!p && p > 0)
      : ctx.family;
    if (!ps.length) return null;
    const lo = Math.min(...ps), hi = Math.max(...ps);
    return lo === hi ? fmt(lo) : `${num(lo / d)}–${fmt(hi)}`;
  }
  return null;
}

/** Підставляє токени в один рядок; речення з нерозв'язаним токеном викидає. */
export function resolveText(text: string, ctx: Parameters<typeof resolveToken>[3], unresolved: string[]): string {
  if (!text.includes('{')) return text;
  // Речення — до крапки/знаку питання/оклику з пробілом після; токени всередині
  // «1 586 грн» пробілів не містять, тож розрізання безпечне.
  const sentences = text.split(/(?<=[.!?…])\s+/);
  const kept: string[] = [];
  for (const s of sentences) {
    let ok = true;
    const out = s.replace(TOKEN, (m, kind: string, arg?: string, div?: string) => {
      const v = resolveToken(kind, arg, div, ctx);
      if (v == null) { ok = false; unresolved.push(m); return m; }
      return v;
    });
    if (ok) kept.push(out);
  }
  return kept.join(' ');
}

/**
 * Мета категорії з підставленими цінами. products — увесь активний каталог
 * (для {price}/{range} за артикулом), family — слаги родини категорії (для
 * {min}/{max}/{count}). Без токенів повертає мету як є — дешево.
 */
export function resolveGuidePrices(meta: CategoryMeta, products: PricedProduct[], family: string[]): ResolvedMeta {
  const hasTokens = new RegExp(TOKEN.source, 'u').test(JSON.stringify(meta));
  if (!hasTokens) return { meta, unresolved: [] };

  const bySku = new Map<string, number>();
  for (const p of products) if (p.price && p.price > 0) bySku.set(p.sku, p.price);
  const fam = new Set(family);
  const famProducts = products.filter(p => p.category_slug && fam.has(p.category_slug));
  const ctx = { bySku, family: famProducts.map(p => p.price ?? 0).filter(p => p > 0), count: famProducts.length };
  const unresolved: string[] = [];
  const r = (s: string) => resolveText(s, ctx, unresolved);

  const guide = meta.guide
    ? {
        title: r(meta.guide.title),
        sections: meta.guide.sections
          .map(s => ({ h: r(s.h), p: s.p.map(r).filter(Boolean) }))
          .filter(s => s.p.length > 0),
      }
    : undefined;
  const faq = meta.faq?.map(f => ({ q: r(f.q), a: r(f.a) })).filter(f => f.q && f.a);

  return {
    meta: {
      ...meta,
      description: r(meta.description),
      ...(meta.seoText !== undefined ? { seoText: r(meta.seoText) } : {}),
      ...(guide ? { guide } : {}),
      ...(faq ? { faq } : {}),
    },
    unresolved,
  };
}

/** Артикули, на які посилаються токени мети (для аудиту: чи існують такі товари). */
export function tokenSkus(meta: CategoryMeta): string[] {
  const out = new Set<string>();
  for (const m of JSON.stringify(meta).matchAll(TOKEN)) {
    if ((m[1] === 'price' || m[1] === 'range') && m[2]) for (const s of m[2].split(',')) out.add(s.trim());
  }
  return [...out];
}

/**
 * Мета категорії потрібною мовою з живими цінами — одна точка для ShopLoader,
 * CatalogLoader, /api/category-meta і .md-версії. Ціна товару — та сама, що на
 * ціннику (retailPrice: promo ?? retail); родина категорії — як у листингу.
 */
export function resolveCategoryMeta(
  slug: string,
  lang: 'uk' | 'ru',
  products: { sku: string; category_slug: string | null; stock: ProductStockPublic | null }[],
  categories: Pick<Category, 'slug' | 'parent_slug'>[],
): CategoryMeta | null {
  const meta = lang === 'ru' ? getCategoryMetaRu(slug) : getCategoryMeta(slug);
  if (!meta) return null;
  const priced = products.map(p => ({ sku: p.sku, category_slug: p.category_slug, price: retailPrice(p) }));
  return resolveGuidePrices(meta, priced, categoryFamilySlugs(categories, slug)).meta;
}

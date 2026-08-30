/**
 * Фасети листингу — з довідника характеристик, а не з чорного списку.
 *
 * До 2026-08-29 ShopClient/CatalogClient будували фільтри як «усі лейбли
 * товарів мінус ~150 у SKIP_LOWER»: у список потрапляли Основа/Ступінь блиску/
 * Розчинник, і в фарбах лишалися лише Бренд/Колір/фасовка. Тепер фільтр — це
 * фасет зі словника: category_characteristics.is_filter (явний список
 * категорії) або characteristic_definitions.is_filter (глобальний, якщо
 * категорія списку не задала), значення — characteristic_values у порядку
 * довідника.
 *
 * Чистий модуль (без БД): computeCategoryFacets рахує фасети з рядків таблиць
 * (викликається в lib/supabase.getCategories), resolveFacets/facetTokens
 * працюють у браузері.
 */
import type { Category, CategoryFacet } from '../types';

export type FacetDefinitionRow = { id: number; label: string; is_filter: boolean; is_multiselect: boolean; sort_order: number };
export type FacetCategoryRow = { category_slug: string; definition_id: number; is_filter: boolean | null; filter_order: number | null };
export type FacetValueRow = { definition_id: number; value: string; category_slugs: string[] | null; sort_order: number };
export type FacetCategoryTree = { slug: string; parent_slug: string | null }[];

/**
 * Родини, де фільтр «Тип» (products.product_type) не показуємо: в інструменті
 * тип — це сама підкатегорія, у герметиках він дублює «Область застосування».
 */
export const HIDE_TYPE_FILTER_FAMILIES = ['instrumenty', 'germetyky'];

export function hidesTypeFilter(categories: FacetCategoryTree, slug: string | null | undefined): boolean {
  const chain = categoryChainOf(categories, slug);
  return HIDE_TYPE_FILTER_FAMILIES.some(f => chain.includes(f));
}

/** Ланцюжок slug → батько → … (без зациклення). */
export function categoryChainOf(categories: FacetCategoryTree, slug: string | null | undefined): string[] {
  const parentOf = new Map(categories.map(c => [c.slug, c.parent_slug]));
  const chain: string[] = [];
  let cur: string | null | undefined = slug;
  while (cur && !chain.includes(cur)) { chain.push(cur); cur = parentOf.get(cur) ?? null; }
  return chain;
}

/** slug → фасети категорії. Категорії без рядків у словнику — без фасетів. */
export function computeCategoryFacets(
  defs: FacetDefinitionRow[],
  catRows: FacetCategoryRow[],
  values: FacetValueRow[],
  categories: FacetCategoryTree,
): Record<string, CategoryFacet[]> {
  const defById = new Map(defs.map(d => [d.id, d]));
  const valuesByDef = new Map<number, FacetValueRow[]>();
  for (const v of [...values].sort((a, b) => a.sort_order - b.sort_order)) {
    if (!valuesByDef.has(v.definition_id)) valuesByDef.set(v.definition_id, []);
    valuesByDef.get(v.definition_id)!.push(v);
  }
  const rowsByCat = new Map<string, FacetCategoryRow[]>();
  for (const r of catRows) {
    if (!rowsByCat.has(r.category_slug)) rowsByCat.set(r.category_slug, []);
    rowsByCat.get(r.category_slug)!.push(r);
  }

  const out: Record<string, CategoryFacet[]> = {};
  for (const [slug, rows] of rowsByCat) {
    const chain = categoryChainOf(categories, slug);
    const explicit = rows.some(r => r.is_filter !== null);
    const picked = explicit
      ? rows.filter(r => r.is_filter === true).sort((a, b) => (a.filter_order ?? 999) - (b.filter_order ?? 999))
      : rows.filter(r => defById.get(r.definition_id)?.is_filter)
          .sort((a, b) => (defById.get(a.definition_id)!.sort_order) - (defById.get(b.definition_id)!.sort_order));
    const facets: CategoryFacet[] = [];
    for (const r of picked) {
      const d = defById.get(r.definition_id);
      if (!d || facets.some(f => f.label === d.label)) continue;
      const vals: string[] = [];
      for (const v of valuesByDef.get(d.id) ?? []) {
        const scoped = v.category_slugs?.length ? v.category_slugs.some(c => chain.includes(c)) : true;
        if (scoped && !vals.includes(v.value)) vals.push(v.value);
      }
      facets.push({ label: d.label, values: vals, multi: d.is_multiselect });
    }
    if (facets.length) out[slug] = facets;
  }
  return out;
}

/**
 * Фасети для обраної категорії: об'єднання по ній і всіх нащадках (батьківська
 * «Фарби» без власних товарів показує фасети підкатегорій), порядок — перша
 * поява. Без категорії фасетів немає — лишаються Бренд/Тип/Колір/фасовка.
 */
export function resolveFacets(categories: Category[], selCat: string | null | undefined): CategoryFacet[] {
  if (!selCat) return [];
  const byParent = new Map<string | null, Category[]>();
  for (const c of categories) {
    if (!byParent.has(c.parent_slug)) byParent.set(c.parent_slug, []);
    byParent.get(c.parent_slug)!.push(c);
  }
  const bySlug = new Map(categories.map(c => [c.slug, c]));
  const out: CategoryFacet[] = [];
  const seen = new Set<string>();
  const visit = (slug: string) => {
    if (seen.has(slug)) return;
    seen.add(slug);
    for (const f of bySlug.get(slug)?.facets ?? []) {
      const ex = out.find(x => x.label === f.label);
      if (!ex) out.push({ label: f.label, values: [...f.values], multi: f.multi });
      else for (const v of f.values) if (!ex.values.includes(v)) ex.values.push(v);
    }
    for (const child of byParent.get(slug) ?? []) visit(child.slug);
  };
  visit(selCat);
  return out;
}

/** Значення фасета → атомарні значення (multiselect зберігається через «; »). */
export function facetTokens(value: string | null | undefined): string[] {
  return String(value ?? '').split(';').map(t => t.trim()).filter(Boolean);
}

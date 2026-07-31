import { MetadataRoute } from 'next';
import { getProductsCached, getCategoriesCached } from '../lib/supabase';
import { getPublishedPostsCached } from '../lib/blog-db';
import { categoriesWithProducts, duplicateOfParent } from '../lib/seo/meta';

function brandToSlug(brand: string): string {
  return brand.trim().toLowerCase().replace(/\s+/g, '-');
}

const BASE = 'https://fixline.com.ua';

// Дата запуску/останнього суттєвого оновлення сайту — оновлюй вручну при великих змінах
const SITE_UPDATED = new Date('2026-06-22');

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [products, categories] = await Promise.all([getProductsCached(), getCategoriesCached()]);

  // Бренди з 5+ продуктів отримуємо з кешованого списку продуктів
  const brandCounts = new Map<string, number>();
  const catCounts = new Map<string, number>();
  for (const p of products) {
    const b = p.brand?.trim();
    if (b) brandCounts.set(b, (brandCounts.get(b) ?? 0) + 1);
    if (p.category_slug) catCounts.set(p.category_slug, (catCounts.get(p.category_slug) ?? 0) + 1);
  }

  // lastmod для категорій/брендів/перетинів — максимальний updated_at їхніх товарів
  const categoryUpdated = new Map<string, Date>();
  const brandUpdated = new Map<string, Date>();
  const catBrandUpdated = new Map<string, Date>();
  const bumpMax = (map: Map<string, Date>, key: string, d: Date) => {
    const cur = map.get(key);
    if (!cur || d > cur) map.set(key, d);
  };
  for (const p of products) {
    if (!p.updated_at) continue;
    const d = new Date(p.updated_at);
    if (p.category_slug) bumpMax(categoryUpdated, p.category_slug, d);
    const b = p.brand?.trim();
    if (b) bumpMax(brandUpdated, b, d);
    if (b && p.category_slug) bumpMax(catBrandUpdated, `${p.category_slug}::${b}`, d);
  }
  const significantBrands = [...brandCounts.entries()]
    .filter(([, count]) => count >= 5)
    .map(([brand]) => brand);

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: BASE,                  lastModified: SITE_UPDATED, changeFrequency: 'weekly',  priority: 1.0 },
    { url: `${BASE}/shop`,        lastModified: SITE_UPDATED, changeFrequency: 'daily',   priority: 0.9 },
    { url: `${BASE}/shop/sale`,   lastModified: SITE_UPDATED, changeFrequency: 'daily',   priority: 0.8 },
    // /catalog — закритий B2B розділ, noindex, не додаємо в sitemap
    { url: `${BASE}/blog`,        lastModified: SITE_UPDATED, changeFrequency: 'weekly',  priority: 0.7 },
    { url: `${BASE}/about`,       lastModified: SITE_UPDATED, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${BASE}/calculators`, lastModified: SITE_UPDATED, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${BASE}/contacts`,    lastModified: SITE_UPDATED, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${BASE}/dropship`,    lastModified: SITE_UPDATED, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${BASE}/delivery`,    lastModified: SITE_UPDATED, changeFrequency: 'monthly', priority: 0.4 },
    { url: `${BASE}/returns`,     lastModified: SITE_UPDATED, changeFrequency: 'monthly', priority: 0.4 },
  ];

  const dbPosts = await getPublishedPostsCached();
  const blogRoutes: MetadataRoute.Sitemap = dbPosts.map(p => ({
    url: `${BASE}/blog/${p.slug}`,
    lastModified: new Date(p.updated_at),
    changeFrequency: 'monthly' as const,
    priority: 0.7,
  }));

  // Порожні категорії (жодного активного товару в усій гілці) у sitemap не подаємо —
  // сторінка їх усе одно віддає noindex, див. generateMetadata у shop/[category].
  // Список рухається сам разом з асортиментом, руками нічого підтримувати не треба.
  // Плюс дитячі категорії, чий листинг дублює батьківський: у них canonical веде
  // на батька (див. duplicateOfParent), а sitemap має містити тільки канонічні
  // адреси — інакше самі собі шлемо суперечливий сигнал.
  const liveSlugs = categoriesWithProducts(categories, products);
  const liveCategories = categories.filter(
    c => liveSlugs.has(c.slug) && !duplicateOfParent(categories, products, c.slug),
  );

  // /shop — публічний магазин, категорії індексуємо
  const shopCategoryRoutes: MetadataRoute.Sitemap = liveCategories.map(cat => ({
    url: `${BASE}/shop/${cat.slug}`,
    lastModified: categoryUpdated.get(cat.slug) ?? new Date(cat.created_at),
    changeFrequency: 'daily',
    priority: 0.8,
  }));

  // /catalog — закритий B2B, не індексуємо
  const catalogCategoryRoutes: MetadataRoute.Sitemap = [];

  const productRoutes: MetadataRoute.Sitemap = products.map(p => ({
    url: `${BASE}/product/${p.slug ?? p.sku}`,
    lastModified: p.updated_at ? new Date(p.updated_at) : SITE_UPDATED,
    changeFrequency: 'weekly',
    priority: 0.7,
  }));

  const brandRoutes: MetadataRoute.Sitemap = significantBrands.map(brand => ({
    url: `${BASE}/shop/brand/${brandToSlug(brand)}`,
    lastModified: brandUpdated.get(brand) ?? SITE_UPDATED,
    changeFrequency: 'weekly',
    priority: 0.75,
  }));

  // Сторінки перетину категорія×бренд (тільки комбінації з 5+ товарів)
  const brandCategoryMap = new Map<string, number>();
  for (const p of products) {
    const b = p.brand?.trim();
    if (!b || !p.category_slug) continue;
    const key = `${p.category_slug}::${b}`;
    brandCategoryMap.set(key, (brandCategoryMap.get(key) ?? 0) + 1);
  }
  // Перетин, що збігається з усією категорією або всім брендом, — копія ширшої
  // сторінки (canonical веде туди, див. shop/[category]/[brand]) — у sitemap не кладемо.
  const isDuplicateCombo = (categorySlug: string, brandName: string, count: number) =>
    count === catCounts.get(categorySlug) || count === brandCounts.get(brandName);

  const categoryBrandRoutes: MetadataRoute.Sitemap = [];
  for (const [key, count] of brandCategoryMap) {
    if (count < 5) continue;
    const sep = key.indexOf('::');
    const categorySlug = key.slice(0, sep);
    const brandName = key.slice(sep + 2);
    if (isDuplicateCombo(categorySlug, brandName, count)) continue;
    categoryBrandRoutes.push({
      url: `${BASE}/shop/${categorySlug}/${brandToSlug(brandName)}`,
      lastModified: catBrandUpdated.get(key) ?? SITE_UPDATED,
      changeFrequency: 'weekly',
      priority: 0.72,
    });
  }

  // ── Russian mirror routes (/ru/*) ──────────────────────────────────────────
  const ruStaticRoutes: MetadataRoute.Sitemap = [
    { url: `${BASE}/ru`,            lastModified: SITE_UPDATED, changeFrequency: 'monthly', priority: 0.4 },
    { url: `${BASE}/ru/shop`,       lastModified: SITE_UPDATED, changeFrequency: 'monthly', priority: 0.35 },
    { url: `${BASE}/ru/shop/sale`,  lastModified: SITE_UPDATED, changeFrequency: 'monthly', priority: 0.3 },
    { url: `${BASE}/ru/blog`,       lastModified: SITE_UPDATED, changeFrequency: 'monthly', priority: 0.3 },
    { url: `${BASE}/ru/about`,      lastModified: SITE_UPDATED, changeFrequency: 'monthly', priority: 0.2 },
    { url: `${BASE}/ru/calculators`, lastModified: SITE_UPDATED, changeFrequency: 'monthly', priority: 0.2 },
    { url: `${BASE}/ru/contacts`,   lastModified: SITE_UPDATED, changeFrequency: 'monthly', priority: 0.2 },
    { url: `${BASE}/ru/dropship`,   lastModified: SITE_UPDATED, changeFrequency: 'monthly', priority: 0.2 },
    { url: `${BASE}/ru/delivery`,   lastModified: SITE_UPDATED, changeFrequency: 'monthly', priority: 0.2 },
    { url: `${BASE}/ru/returns`,    lastModified: SITE_UPDATED, changeFrequency: 'monthly', priority: 0.2 },
  ];

  const ruBlogRoutes: MetadataRoute.Sitemap = dbPosts.map(p => ({
    url: `${BASE}/ru/blog/${p.slug}`,
    lastModified: new Date(p.updated_at),
    changeFrequency: 'monthly' as const,
    priority: 0.25,
  }));

  const ruShopCategoryRoutes: MetadataRoute.Sitemap = liveCategories.map(cat => ({
    url: `${BASE}/ru/shop/${cat.slug}`,
    lastModified: categoryUpdated.get(cat.slug) ?? new Date(cat.created_at),
    changeFrequency: 'monthly',
    priority: 0.3,
  }));

  const ruBrandRoutes: MetadataRoute.Sitemap = significantBrands.map(brand => ({
    url: `${BASE}/ru/shop/brand/${brandToSlug(brand)}`,
    lastModified: brandUpdated.get(brand) ?? SITE_UPDATED,
    changeFrequency: 'monthly',
    priority: 0.25,
  }));

  const ruCategoryBrandRoutes: MetadataRoute.Sitemap = [];
  for (const [key, count] of brandCategoryMap) {
    if (count < 5) continue;
    const sep = key.indexOf('::');
    const categorySlug = key.slice(0, sep);
    const brandName = key.slice(sep + 2);
    if (isDuplicateCombo(categorySlug, brandName, count)) continue;
    ruCategoryBrandRoutes.push({
      url: `${BASE}/ru/shop/${categorySlug}/${brandToSlug(brandName)}`,
      lastModified: catBrandUpdated.get(key) ?? SITE_UPDATED,
      changeFrequency: 'monthly',
      priority: 0.2,
    });
  }

  const ruProductRoutes: MetadataRoute.Sitemap = products.map(p => ({
    url: `${BASE}/ru/product/${p.slug ?? p.sku}`,
    lastModified: p.updated_at ? new Date(p.updated_at) : SITE_UPDATED,
    changeFrequency: 'monthly' as const,
    priority: 0.3,
  }));

  return [
    ...staticRoutes,
    ...blogRoutes,
    ...shopCategoryRoutes,
    ...brandRoutes,
    ...categoryBrandRoutes,
    ...productRoutes,
    ...ruStaticRoutes,
    ...ruBlogRoutes,
    ...ruShopCategoryRoutes,
    ...ruBrandRoutes,
    ...ruCategoryBrandRoutes,
    ...ruProductRoutes,
  ];
}

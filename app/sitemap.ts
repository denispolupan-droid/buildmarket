import { MetadataRoute } from 'next';
import { getProductsCached, getCategoriesCached } from '../lib/supabase';
import { ARTICLES } from '../lib/blog';

function brandToSlug(brand: string): string {
  return brand.trim().toLowerCase().replace(/\s+/g, '-');
}

const BASE = 'https://fixline.com.ua';

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [products, categories] = await Promise.all([getProductsCached(), getCategoriesCached()]);

  // Бренди з 5+ продуктів отримуємо з кешованого списку продуктів
  const brandCounts = new Map<string, number>();
  for (const p of products) {
    const b = p.brand?.trim();
    if (b) brandCounts.set(b, (brandCounts.get(b) ?? 0) + 1);
  }
  const significantBrands = [...brandCounts.entries()]
    .filter(([, count]) => count >= 5)
    .map(([brand]) => brand);

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: BASE,                  lastModified: new Date(), changeFrequency: 'weekly',  priority: 1.0 },
    { url: `${BASE}/shop`,        lastModified: new Date(), changeFrequency: 'daily',   priority: 0.9 },
    { url: `${BASE}/shop/sale`,   lastModified: new Date(), changeFrequency: 'daily',   priority: 0.8 },
    // /catalog — закритий B2B розділ, noindex, не додаємо в sitemap
    { url: `${BASE}/blog`,        lastModified: new Date(), changeFrequency: 'weekly',  priority: 0.7 },
    { url: `${BASE}/about`,       lastModified: new Date(), changeFrequency: 'monthly', priority: 0.6 },
    { url: `${BASE}/contacts`,    lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
    { url: `${BASE}/dropship`,    lastModified: new Date(), changeFrequency: 'monthly', priority: 0.6 },
    { url: `${BASE}/delivery`,    lastModified: new Date(), changeFrequency: 'monthly', priority: 0.4 },
    { url: `${BASE}/returns`,     lastModified: new Date(), changeFrequency: 'monthly', priority: 0.4 },
  ];

  const blogRoutes: MetadataRoute.Sitemap = ARTICLES.map(a => ({
    url: `${BASE}/blog/${a.slug}`,
    lastModified: new Date(a.date),
    changeFrequency: 'monthly',
    priority: 0.7,
  }));

  // /shop — публічний магазин, категорії індексуємо
  const shopCategoryRoutes: MetadataRoute.Sitemap = categories.map(cat => ({
    url: `${BASE}/shop/${cat.slug}`,
    lastModified: new Date(),
    changeFrequency: 'daily',
    priority: 0.8,
  }));

  // /catalog — закритий B2B, не індексуємо
  const catalogCategoryRoutes: MetadataRoute.Sitemap = [];

  const productRoutes: MetadataRoute.Sitemap = products.map(p => ({
    url: `${BASE}/product/${p.sku}`,
    lastModified: p.updated_at ? new Date(p.updated_at) : new Date(),
    changeFrequency: 'weekly',
    priority: 0.7,
  }));

  const brandRoutes: MetadataRoute.Sitemap = significantBrands.map(brand => ({
    url: `${BASE}/shop/brand/${brandToSlug(brand)}`,
    lastModified: new Date(),
    changeFrequency: 'weekly',
    priority: 0.75,
  }));

  return [...staticRoutes, ...blogRoutes, ...shopCategoryRoutes, ...brandRoutes, ...productRoutes];
}

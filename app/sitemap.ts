import { MetadataRoute } from 'next';
import { getProductsCached, getCategoriesCached } from '../lib/supabase';

const BASE = 'https://fixline.com.ua';

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [products, categories] = await Promise.all([getProductsCached(), getCategoriesCached()]);

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: BASE,               lastModified: new Date(), changeFrequency: 'weekly',  priority: 1.0 },
    { url: `${BASE}/shop`,     lastModified: new Date(), changeFrequency: 'daily',   priority: 0.9 },
    { url: `${BASE}/catalog`,  lastModified: new Date(), changeFrequency: 'daily',   priority: 0.9 },
    { url: `${BASE}/contacts`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
    { url: `${BASE}/dropship`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.6 },
  ];

  const shopCategoryRoutes: MetadataRoute.Sitemap = categories.map(cat => ({
    url: `${BASE}/shop?category=${cat.slug}`,
    lastModified: new Date(),
    changeFrequency: 'daily',
    priority: 0.8,
  }));

  const catalogCategoryRoutes: MetadataRoute.Sitemap = categories.map(cat => ({
    url: `${BASE}/catalog?category=${cat.slug}`,
    lastModified: new Date(),
    changeFrequency: 'daily',
    priority: 0.8,
  }));

  const productRoutes: MetadataRoute.Sitemap = products.map(p => ({
    url: `${BASE}/product/${p.sku}`,
    lastModified: new Date(p.updated_at),
    changeFrequency: 'weekly',
    priority: 0.7,
  }));

  return [...staticRoutes, ...shopCategoryRoutes, ...catalogCategoryRoutes, ...productRoutes];
}

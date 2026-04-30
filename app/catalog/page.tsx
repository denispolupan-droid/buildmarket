import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getProductsCached, getCategoriesCached } from '../../lib/supabase';
import { createSupabaseServer } from '../../lib/supabase-server';
import { isWholesale } from '../../lib/user-role';
import CatalogClient from './CatalogClient';

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}): Promise<Metadata> {
  const { category } = await searchParams;
  const BASE = 'https://fixline.com.ua';

  if (category) {
    const categories = await getCategoriesCached();
    const cat = categories.find(c => c.slug === category);
    if (cat) {
      const title = `${cat.name} оптом — купити в Україні | FIXLINE`;
      const description = `${cat.name} оптом для дилерів, підрядників та магазинів. Широкий вибір, оптові ціни, доставка по Україні.`;
      return {
        title,
        description,
        keywords: [cat.name, 'оптом', 'будівельна хімія', 'Україна'],
        openGraph: { title, description, url: `${BASE}/catalog?category=${category}`, siteName: 'FIXLINE', locale: 'uk_UA' },
        alternates: { canonical: `${BASE}/catalog?category=${category}` },
      };
    }
  }

  return {
    title: 'Каталог будівельної хімії оптом | FIXLINE',
    description: 'Герметики, монтажні піни, клеї, рідкі цвяхи та інша будівельна хімія оптом. Оптові ціни для дилерів, підрядників та будівельних компаній.',
    keywords: ['будівельна хімія оптом', 'герметики оптом', 'монтажна піна оптом', 'клеї оптом'],
    alternates: { canonical: `${BASE}/catalog` },
    openGraph: {
      title: 'Оптовий каталог будівельної хімії | FIXLINE',
      description: 'Герметики, монтажні піни, клеї оптом. Ціни для дилерів та підрядників.',
      url: `${BASE}/catalog`,
      siteName: 'FIXLINE',
      locale: 'uk_UA',
    },
  };
}

export default async function Catalog({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string; sale?: string }>;
}) {
  const { q, category, sale } = await searchParams;

  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  const shopUrl = category ? `/shop?category=${category}` : '/shop';
  const loginUrl = category ? `/login?next=/catalog?category=${category}` : '/login?next=/catalog';
  if (!user) redirect(loginUrl);
  if (!isWholesale(user)) redirect(shopUrl);

  const [products, categories] = await Promise.all([
    getProductsCached(),
    getCategoriesCached(),
  ]);

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Головна', item: 'https://fixline.com.ua' },
      { '@type': 'ListItem', position: 2, name: 'Оптовий каталог', item: 'https://fixline.com.ua/catalog' },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
      <CatalogClient
        products={products}
        categories={categories}
        initialSearch={q ?? ''}
        initialCategory={category ?? ''}
        initialSaleOnly={sale === '1'}
      />
    </>
  );
}

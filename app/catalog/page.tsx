import type { Metadata } from 'next';
import { unstable_noStore as noStore } from 'next/cache';
import { redirect } from 'next/navigation';
import { getProducts, getCategories } from '../../lib/supabase';
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
    const categories = await getCategories();
    const cat = categories.find(c => c.slug === category);
    if (cat) {
      const title = `${cat.name} оптом — купити в Україні | Buildmarket`;
      const description = `${cat.name} оптом для дилерів, підрядників та магазинів. Широкий вибір, оптові ціни, доставка по Україні.`;
      return {
        title,
        description,
        openGraph: { title, description, url: `${BASE}/catalog?category=${category}`, siteName: 'FIXLINE', locale: 'uk_UA' },
        alternates: { canonical: `${BASE}/catalog?category=${category}` },
      };
    }
  }

  return {
    title: 'Каталог будівельної хімії оптом | Buildmarket',
    description: 'Герметики, монтажні піни, клеї, рідкі цвяхи та інша будівельна хімія оптом. Оптові ціни для дилерів, підрядників та будівельних компаній.',
    alternates: { canonical: `${BASE}/catalog` },
  };
}

export default async function Catalog({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string; sale?: string }>;
}) {
  noStore();
  const { q, category, sale } = await searchParams;

  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  const shopUrl = category ? `/shop?category=${category}` : '/shop';
  const loginUrl = category ? `/login?next=/catalog?category=${category}` : '/login?next=/catalog';
  if (!user) redirect(loginUrl);
  if (!isWholesale(user)) redirect(shopUrl);

  const [products, categories] = await Promise.all([
    getProducts(),
    getCategories(),
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

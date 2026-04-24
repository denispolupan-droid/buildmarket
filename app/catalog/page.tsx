import type { Metadata } from 'next';
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
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login?next=/catalog');
  if (!isWholesale(user)) redirect('/shop');

  const { q, category, sale } = await searchParams;

  const [products, categories] = await Promise.all([
    getProducts(),
    getCategories(),
  ]);

  return (
    <CatalogClient
      products={products}
      categories={categories}
      initialSearch={q ?? ''}
      initialCategory={category ?? ''}
      initialSaleOnly={sale === '1'}
    />
  );
}

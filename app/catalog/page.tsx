import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCategoriesCached } from '../../lib/supabase';
import { createSupabaseServer } from '../../lib/supabase-server';
import CatalogLoader from './CatalogLoader';
import Footer from '../components/Footer';

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
      const ogTitle = `${cat.name} оптом — купити в Україні | FIXLINE`;
      const title = `${cat.name} оптом — купити в Україні`;
      const description = `${cat.name} оптом для дилерів, підрядників та магазинів. Широкий вибір, оптові ціни, доставка по Україні. Купить оптом по Украине.`;
      return {
        title,
        description,
        keywords: [cat.name, 'оптом', 'будівельна хімія', 'строительная химия', 'Україна', 'Украина', 'купити', 'купить'],
        robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
        openGraph: { title: ogTitle, description, url: `${BASE}/catalog?category=${category}`, siteName: 'FIXLINE', locale: 'uk_UA' },
        alternates: { canonical: `${BASE}/catalog?category=${category}` },
      };
    }
  }

  return {
    title: 'Каталог будівельної хімії оптом',
    description: 'Герметики, монтажні піни, клеї, рідкі цвяхи та інша будівельна хімія оптом. Оптові ціни для дилерів, підрядників та будівельних компаній. Строительная химия оптом по Украине.',
    keywords: ['будівельна хімія оптом', 'строительная химия оптом', 'герметики оптом', 'монтажна піна оптом', 'монтажная пена оптом', 'клеї оптом', 'клеи оптом', 'купити оптом', 'купить оптом'],
    robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
    alternates: { canonical: `${BASE}/catalog`, languages: { 'uk': `${BASE}/catalog`, 'ru': `${BASE}/ru/catalog`, 'x-default': `${BASE}/catalog` } },
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
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/catalog');

  const { q, category, sale } = await searchParams;

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
      <CatalogLoader
        initialSearch={q ?? ''}
        initialCategory={category ?? ''}
        initialSaleOnly={sale === '1'}
      />
      <Footer />
    </>
  );
}

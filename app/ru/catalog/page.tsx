import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createSupabaseServer } from '../../../lib/supabase-server';
import CatalogLoader from '../../catalog/CatalogLoader';
import Footer from '../../components/Footer';

const BASE = 'https://fixline.com.ua';

export const metadata: Metadata = {
  title: 'Оптовый каталог строительной химии',
  description: 'Герметики, монтажная пена, клеи, грунтовки оптом. Оптовые цены для дилеров, подрядчиков и строительных компаний. Доставка по всей Украине.',
  keywords: ['строительная химия оптом', 'герметики оптом', 'монтажная пена оптом', 'клеи оптом', 'купить оптом', 'Украина'],
  robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
  alternates: {
    canonical: `${BASE}/catalog`,
    languages: { 'uk': `${BASE}/catalog`, 'ru': `${BASE}/ru/catalog`, 'x-default': `${BASE}/catalog` },
  },
};

export default async function RuCatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string; sale?: string }>;
}) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/ru/login?next=/ru/catalog');

  const { q, category, sale } = await searchParams;

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Главная', item: `${BASE}/ru` },
      { '@type': 'ListItem', position: 2, name: 'Оптовый каталог', item: `${BASE}/ru/catalog` },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd).replace(/</g, '\\u003c') }} />
      <CatalogLoader lang="ru"
        initialSearch={q ?? ''}
        initialCategory={category ?? ''}
        initialSaleOnly={sale === '1'}
      />
      <Footer />
    </>
  );
}

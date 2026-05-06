import type { Metadata } from 'next';
import { getCategoriesCached } from '../../lib/supabase';
import CatalogLoader from './CatalogLoader';
import { getCategoryMeta } from '../../lib/category-descriptions';

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

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Головна', item: 'https://fixline.com.ua' },
      { '@type': 'ListItem', position: 2, name: 'Оптовий каталог', item: 'https://fixline.com.ua/catalog' },
    ],
  };

  const catMeta = category ? getCategoryMeta(category) : null;
  const catName = category ? (await getCategoriesCached()).find(c => c.slug === category)?.name : null;

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
      <CatalogLoader
        initialSearch={q ?? ''}
        initialCategory={category ?? ''}
        initialSaleOnly={sale === '1'}
      />
      {catMeta && catName && (
        <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '0 24px 32px' }}>
          <details>
            <summary style={{
              fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)',
              cursor: 'pointer', userSelect: 'none', listStyle: 'none',
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              padding: '7px 12px', borderRadius: '8px',
              border: '1px solid var(--border)', background: 'var(--bg-card)',
            }}>
              <span>ℹ️ Про категорію «{catName}»</span>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>▼</span>
            </summary>
            <div style={{ padding: '12px 0 0', borderTop: '1px solid var(--border)' }}>
              <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.7, margin: 0 }}>
                {catMeta.description}
              </p>
              {catMeta.seoText && (
                <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.7, margin: '8px 0 0' }}>
                  {catMeta.seoText}
                </p>
              )}
            </div>
          </details>
        </div>
      )}
    </>
  );
}

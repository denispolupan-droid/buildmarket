import type { Metadata } from 'next';
import Link from 'next/link';
import Footer from '../components/Footer';
import ShopLoader from './ShopLoader';
import { getCategoriesCached, getProductsCached } from '../../lib/supabase';
import { getCategoryMeta } from '../../lib/category-descriptions';
import { createSupabaseServer } from '../../lib/supabase-server';
import { getRole } from '../../lib/user-role';
import './shop.css';

const BASE = 'https://fixline.com.ua';

export async function generateMetadata(
  { searchParams }: { searchParams: Promise<{ category?: string; sale?: string; brand?: string }> }
): Promise<Metadata> {
  const { category, sale, brand } = await searchParams;
  const categories = await getCategoriesCached();
  const cat = category ? categories.find(c => c.slug === category) : null;

  const canonicalParams = category ? `?category=${category}` : sale === '1' ? '?sale=1' : '';

  if (sale === '1') {
    return {
      title: 'Акційні товари — будівельна хімія зі знижкою | FIXLINE',
      description: 'Акції на герметики, монтажні піни, клеї та ґрунтовки. Купити зі знижкою від 1 одиниці з доставкою по Україні.',
      alternates: { canonical: `${BASE}/shop?sale=1`, languages: { 'uk': `${BASE}/shop?sale=1`, 'ru': `${BASE}/shop?sale=1`, 'x-default': `${BASE}/shop?sale=1` } },
      openGraph: { title: 'Акційні товари | FIXLINE', url: `${BASE}/shop?sale=1`, locale: 'uk_UA', type: 'website' },
    };
  }

  if (brand) {
    return {
      title: `${brand} купити в Україні — офіційний постачальник | FIXLINE`,
      description: `Купити ${brand} в роздріб та оптом. Широкий асортимент, доставка по всій Україні. Від 1 одиниці.`,
      alternates: { canonical: `${BASE}/shop?brand=${encodeURIComponent(brand)}`, languages: { 'uk': `${BASE}/shop?brand=${encodeURIComponent(brand)}`, 'ru': `${BASE}/shop?brand=${encodeURIComponent(brand)}`, 'x-default': `${BASE}/shop?brand=${encodeURIComponent(brand)}` } },
      openGraph: { title: `${brand} | Магазин FIXLINE`, url: `${BASE}/shop?brand=${encodeURIComponent(brand)}`, locale: 'uk_UA', type: 'website' },
    };
  }

  if (cat) {
    return {
      title: `${cat.name} купити — ціни, доставка по Україні | FIXLINE`,
      description: `Купити ${cat.name.toLowerCase()} в роздріб від 1 одиниці. Широкий асортимент, низькі ціни, швидка доставка по всій Україні. Купить ${cat.name.toLowerCase()} с доставкой.`,
      keywords: [cat.name, 'купити', 'купить', 'будівельна хімія', 'строительная химия', 'Україна', 'Украина'],
      alternates: { canonical: `${BASE}/shop?category=${category}`, languages: { 'uk': `${BASE}/shop?category=${category}`, 'ru': `${BASE}/shop?category=${category}`, 'x-default': `${BASE}/shop?category=${category}` } },
      openGraph: {
        title: `${cat.name} | Магазин FIXLINE`,
        description: `${cat.name} — купити від 1 шт з доставкою по Україні.`,
        url: `${BASE}/shop?category=${category}`,
        siteName: 'FIXLINE', locale: 'uk_UA', type: 'website',
      },
    };
  }

  return {
    title: 'Магазин — будівельна хімія в роздріб | FIXLINE',
    description: 'Купити будівельну хімію в роздріб: герметики, монтажні піни, клеї, ґрунтовки. Доставка по всій Україні. Купить строительную химию в розницу: герметики, монтажная пена, клеи.',
    keywords: ['магазин будівельної хімії', 'магазин строительной химии', 'герметики купити', 'герметики купить', 'монтажна піна', 'монтажная пена', 'клей будівельний', 'клей строительный', 'ґрунтовка', 'грунтовка'],
    alternates: { canonical: `${BASE}/shop`, languages: { 'uk': `${BASE}/shop`, 'ru': `${BASE}/shop`, 'x-default': `${BASE}/shop` } },
    openGraph: {
      title: 'Магазин будівельної хімії | FIXLINE',
      description: 'Герметики, монтажні піни, клеї, ґрунтовки. Від 1 одиниці з доставкою по Україні.',
      url: `${BASE}/shop`, siteName: 'FIXLINE', locale: 'uk_UA', type: 'website',
    },
  };
}

export default async function ShopPage({ searchParams }: { searchParams: Promise<{ category?: string; sale?: string; brand?: string }> }) {
  // Блокуємо доступ для оптових клієнтів
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  const role = getRole(user);
  if (role === 'wholesale') {
    return (
      <>
        <div style={{
          minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '40px 24px', background: 'var(--bg-soft)',
        }}>
          <div style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '16px',
            padding: '48px 40px', maxWidth: '480px', width: '100%', textAlign: 'center',
          }}>
            <div style={{ fontSize: '40px', marginBottom: '16px' }}>🏢</div>
            <h1 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '12px' }}>
              Ви увійшли як оптовий клієнт
            </h1>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '28px' }}>
              Магазин роздрібних цін недоступний для оптових покупців. Перейдіть до каталогу зі своїми цінами або вийдіть і зайдіть як роздрібний покупець.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <Link href="/catalog" style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                height: '46px', borderRadius: '10px', background: '#1E3A5F', color: '#fff',
                fontSize: '14px', fontWeight: 700, textDecoration: 'none',
              }}>
                Перейти до оптового каталогу →
              </Link>
              <Link href="/api/auth/signout" style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                height: '40px', borderRadius: '10px', border: '1px solid var(--border)',
                color: 'var(--text-secondary)', fontSize: '13px', textDecoration: 'none',
              }}>
                Вийти з акаунту
              </Link>
            </div>
          </div>
        </div>
        <Footer />
      </>
    );
  }

  const { category, sale, brand } = await searchParams;
  const categories = await getCategoriesCached();
  const cat = category ? categories.find(c => c.slug === category) : null;

  const breadcrumbItems = [
    { '@type': 'ListItem', position: 1, name: 'Головна', item: `${BASE}` },
    { '@type': 'ListItem', position: 2, name: 'Магазин', item: `${BASE}/shop` },
    ...(cat ? [{ '@type': 'ListItem', position: 3, name: cat.name, item: `${BASE}/shop?category=${category}` }] : []),
    ...(brand ? [{ '@type': 'ListItem', position: 3, name: brand, item: `${BASE}/shop?brand=${encodeURIComponent(brand)}` }] : []),
  ];
  const breadcrumbLd = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: breadcrumbItems };

  const itemListLd = cat ? await (async () => {
    const products = await getProductsCached({ category: cat.slug, limit: 10 });
    if (products.length === 0) return null;
    return {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: cat.name,
      url: `${BASE}/shop?category=${category}`,
      numberOfItems: products.length,
      itemListElement: products.map((p, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        item: {
          '@type': 'Product',
          name: p.name,
          url: `${BASE}/product/${p.sku}`,
          ...(p.image ? { image: `${BASE}${p.image.startsWith('/') ? '' : '/'}${p.image}` } : {}),
          brand: { '@type': 'Brand', name: p.brand },
          ...(p.stock ? {
            offers: {
              '@type': 'Offer',
              price: p.stock.price_unit,
              priceCurrency: 'UAH',
              availability: p.stock.stock_status === 'in_stock'
                ? 'https://schema.org/InStock'
                : 'https://schema.org/OutOfStock',
            },
          } : {}),
        },
      })),
    };
  })() : null;

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
      {itemListLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListLd) }} />}
      <div style={{ background: 'var(--bg-soft)', minHeight: '100vh' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px 32px 64px 8px' }} className="mobile-pad">
          <nav aria-label="Breadcrumb" style={{ marginBottom: '24px', fontSize: '13px', color: '#94A3B8', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Link href="/" style={{ color: '#94A3B8', textDecoration: 'none' }}>Головна</Link>
            <span>/</span>
            <Link href="/shop" style={{ color: cat || brand || sale ? '#94A3B8' : '#475569', textDecoration: 'none' }}>Магазин</Link>
            {cat && <><span>/</span><span style={{ color: '#475569' }}>{cat.name}</span></>}
            {brand && <><span>/</span><span style={{ color: '#475569' }}>{brand}</span></>}
            {sale === '1' && <><span>/</span><span style={{ color: '#475569' }}>Акції</span></>}
          </nav>
          <h1 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 24px' }}>
            {cat ? cat.name : brand ? `${brand} — каталог товарів` : sale === '1' ? 'Акційні товари' : 'Магазин будівельної хімії'}
          </h1>
          <ShopLoader initialCategory={category} initialSaleOnly={sale === '1'} initialBrand={brand} />
          {cat && (() => {
            const meta = getCategoryMeta(cat.slug);
            if (!meta) return null;
            const faqLd = meta.faq ? {
              '@context': 'https://schema.org',
              '@type': 'FAQPage',
              mainEntity: meta.faq.map(({ q, a }) => ({
                '@type': 'Question',
                name: q,
                acceptedAnswer: { '@type': 'Answer', text: a },
              })),
            } : null;
            return meta ? (
              <>
              {faqLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />}
              <div style={{ marginTop: '32px', padding: '16px 20px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-card)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '8px' }}>
                  <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', margin: 0 }}>
                    Про категорію «{cat.name}»
                  </p>
                  {meta.blogSlug && (
                    <Link href={`/blog/${meta.blogSlug}`} style={{ fontSize: '12px', color: '#4880B8', fontWeight: 600, whiteSpace: 'nowrap', textDecoration: 'none' }}>
                      Читати статтю →
                    </Link>
                  )}
                </div>
                <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.7, margin: 0 }}>
                  {meta.description}
                </p>
                {meta.seoText && (
                  <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.7, margin: '8px 0 0' }}>
                    {meta.seoText}
                  </p>
                )}
                {meta.faq && meta.faq.length > 0 && (
                  <div style={{ marginTop: '16px', borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
                    <p style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Часті запитання
                    </p>
                    {meta.faq.map((item, i) => (
                      <div key={i} style={{ marginBottom: i < meta.faq!.length - 1 ? '12px' : 0 }}>
                        <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 4px' }}>
                          {item.q}
                        </p>
                        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.65, margin: 0 }}>
                          {item.a}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              </>
            ) : null;
          })()}
        </div>
      </div>
      <Footer />
    </>
  );
}

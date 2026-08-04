import type { Metadata } from 'next';
import Footer from '../components/Footer';
import Reveal from '../components/Reveal';
import BlogList, { type BlogItem } from './BlogList';
import { getPublishedPostsCached } from '../../lib/blog-db';

export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Блог — поради щодо будівельної хімії',
  description: 'Корисні статті про герметики, монтажну піну, клеї та ґрунтовки. Як вибрати, як використовувати, типові помилки та поради від практиків.',
  keywords: ['як вибрати герметик', 'як вибрати монтажну піну', 'будівельна хімія поради', 'как выбрать герметик', 'как выбрать монтажную пену', 'строительная химия советы', 'герметик для ванной', 'монтажная пена как использовать'],
  alternates: { canonical: 'https://fixline.com.ua/blog', languages: { 'uk': 'https://fixline.com.ua/blog', 'ru': 'https://fixline.com.ua/ru/blog', 'x-default': 'https://fixline.com.ua/blog' } },
  openGraph: {
    title: 'Блог FIXLINE — поради щодо будівельної хімії',
    description: 'Статті про герметики, монтажну піну та клеї: вибір, застосування, типові помилки.',
    url: 'https://fixline.com.ua/blog',
    siteName: 'FIXLINE',
    locale: 'uk_UA',
    type: 'website',
    images: [{ url: 'https://fixline.com.ua/opengraph-image', width: 1200, height: 630, alt: 'FIXLINE — будівельна хімія' }],
  },
};

const BASE = 'https://fixline.com.ua';

export default async function BlogPage() {
  // Усі статті — з БД (blog_posts), найсвіжіші зверху
  const dbPosts = await getPublishedPostsCached();
  const items: (BlogItem & { date: string })[] = dbPosts.map(p => ({
    slug: p.slug,
    href: `/blog/${p.slug}`,
    title: p.title,
    description: p.description,
    category: p.category,
    readTime: p.read_time,
    date: (p.published_at ?? p.created_at).slice(0, 10),
    image: p.image,
  })).sort((a, b) => b.date.localeCompare(a.date));

  const blogLd = {
    '@context': 'https://schema.org',
    '@type': 'Blog',
    name: 'Блог FIXLINE — поради щодо будівельної хімії',
    url: `${BASE}/blog`,
    description: 'Корисні статті про герметики, монтажну піну, клеї та ґрунтовки.',
    publisher: { '@type': 'Organization', name: 'FIXLINE', url: BASE },
    blogPost: items.map(a => ({
      '@type': 'BlogPosting',
      headline: a.title,
      description: a.description,
      url: `${BASE}/blog/${a.slug}`,
      datePublished: a.date,
      ...(a.image ? { image: `${BASE}${a.image}` } : {}),
    })),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(blogLd).replace(/</g, '\\u003c') }} />

      <div style={{ background: 'var(--bg-soft)', minHeight: '100vh' }}>
        {/* Шапка */}
        <section style={{
          background: 'radial-gradient(900px 460px at 85% -20%, rgba(94,234,212,0.16), transparent 60%), radial-gradient(700px 420px at -5% 120%, rgba(72,128,184,0.32), transparent 60%), linear-gradient(160deg, #0F172A 0%, #1E3A5F 60%, #123B54 100%)',
          padding: '56px 0 52px',
        }}>
          <div className="page-container">
            <Reveal>
              <span className="eyebrow on-dark">Блог FIXLINE</span>
              <h1 style={{ fontSize: 'clamp(28px, 3.8vw, 44px)', fontWeight: 900, color: '#fff', lineHeight: 1.18, margin: '14px 0 16px', letterSpacing: '-0.8px', maxWidth: '760px' }}>
                Поради щодо <span className="grad-text">будівельної хімії</span>
              </h1>
              <p style={{ fontSize: '16px', color: '#94A3B8', lineHeight: 1.7, margin: 0, maxWidth: '620px' }}>
                Як вибрати, як нанести й де помиляються найчастіше. Пишемо коротко
                і по суті — на основі того, що самі продаємо.
              </p>
            </Reveal>
          </div>
        </section>

        <div className="page-container" style={{ padding: '40px 16px 64px' }}>
          <BlogList lang="uk" items={items} />
        </div>
      </div>

      <Footer />
    </>
  );
}

import type { Metadata } from 'next';
import Footer from '../../components/Footer';
import Reveal from '../../components/Reveal';
import BlogList, { type BlogItem } from '../../blog/BlogList';
import { getPublishedPostsCached } from '../../../lib/blog-db';

export const revalidate = 3600;

const BASE = 'https://fixline.com.ua';

export const metadata: Metadata = {
  title: 'Блог — советы по строительной химии',
  description: 'Полезные статьи о герметиках, монтажной пене, клеях и грунтовках. Как выбрать, как использовать, типичные ошибки и советы от практиков.',
  keywords: ['как выбрать герметик', 'как выбрать монтажную пену', 'строительная химия советы', 'герметик для ванной', 'монтажная пена как использовать'],
  alternates: {
    canonical: `${BASE}/ru/blog`,
    languages: { 'uk': `${BASE}/blog`, 'ru': `${BASE}/ru/blog`, 'x-default': `${BASE}/blog` },
  },
  openGraph: {
    title: 'Блог FIXLINE — советы по строительной химии',
    description: 'Статьи о герметиках, монтажной пене и клеях: выбор, применение, типичные ошибки.',
    url: `${BASE}/ru/blog`,
    siteName: 'FIXLINE',
    locale: 'ru_RU',
    type: 'website',
    images: [{ url: `${BASE}/opengraph-image`, width: 1200, height: 630, alt: 'FIXLINE — строительная химия' }],
  },
};

export default async function BlogRuPage() {
  // Усі статті — з БД (blog_posts), найсвіжіші зверху
  const dbPosts = await getPublishedPostsCached();
  const items: (BlogItem & { date: string })[] = dbPosts.map(p => ({
    slug: p.slug,
    href: `/ru/blog/${p.slug}`,
    title: p.title_ru ?? p.title,
    description: p.description_ru ?? p.description,
    category: p.category_ru ?? p.category,
    readTime: p.read_time,
    date: (p.published_at ?? p.created_at).slice(0, 10),
    // Обкладинка з вшитим заголовком — російський варіант, фолбек на укр
    image: p.image_ru ?? p.image,
  })).sort((a, b) => b.date.localeCompare(a.date));

  const blogLd = {
    '@context': 'https://schema.org',
    '@type': 'Blog',
    name: 'Блог FIXLINE — советы по строительной химии',
    url: `${BASE}/ru/blog`,
    description: 'Полезные статьи о герметиках, монтажной пене, клеях и грунтовках.',
    publisher: { '@type': 'Organization', name: 'FIXLINE', url: BASE },
    blogPost: items.map(a => ({
      '@type': 'BlogPosting',
      headline: a.title,
      description: a.description,
      url: `${BASE}/ru/blog/${a.slug}`,
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
                Советы по <span className="grad-text">строительной химии</span>
              </h1>
              <p style={{ fontSize: '16px', color: '#94A3B8', lineHeight: 1.7, margin: 0, maxWidth: '620px' }}>
                Как выбрать, как нанести и где ошибаются чаще всего. Пишем коротко
                и по делу — на основе того, что продаём сами.
              </p>
            </Reveal>
          </div>
        </section>

        <div className="page-container" style={{ padding: '40px 16px 64px' }}>
          <BlogList lang="ru" items={items} />
        </div>
      </div>

      <Footer />
    </>
  );
}

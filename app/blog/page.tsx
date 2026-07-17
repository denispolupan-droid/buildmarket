import type { Metadata } from 'next';
import Link from 'next/link';
import Footer from '../components/Footer';
import { getPublishedPostsCached } from '../../lib/blog-db';
import { BookOpen, Clock, ArrowRight } from 'lucide-react';

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
  const items = dbPosts.map(p => ({
    slug: p.slug,
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
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(blogLd) }} />
      <div style={{ background: 'var(--bg-soft)', minHeight: '100vh' }}>
        <div style={{ maxWidth: '860px', margin: '0 auto', padding: '48px 32px 64px' }}>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
            <BookOpen size={28} color="#4880B8" strokeWidth={1.8} />
            <h1 style={{ fontSize: '28px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
              Блог
            </h1>
          </div>
          <p style={{ fontSize: '15px', color: 'var(--text-muted)', marginBottom: '40px' }}>
            Поради, порівняння та відповіді на часті питання щодо будівельної хімії
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {items.map(article => (
              <Link
                key={article.slug}
                href={`/blog/${article.slug}`}
                style={{ textDecoration: 'none' }}
              >
                <div style={{
                  background: 'var(--bg-card)', border: '1px solid var(--border)',
                  borderRadius: '14px', padding: '24px 28px',
                  transition: 'box-shadow 0.2s, transform 0.2s',
                }}
                  className="blog-card"
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                    <span style={{
                      fontSize: '12px', fontWeight: 600, padding: '3px 10px', borderRadius: '20px',
                      background: '#EFF6FF', color: '#4880B8',
                    }}>
                      {article.category}
                    </span>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Clock size={12} /> {article.readTime} хв читання
                    </span>
                  </div>
                  <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 8px', lineHeight: 1.4 }}>
                    {article.title}
                  </h2>
                  <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.6, margin: '0 0 14px' }}>
                    {article.description}
                  </p>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: '#4880B8', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    Читати статтю <ArrowRight size={14} />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
      <Footer />
      <style>{`
        .blog-card:hover { box-shadow: 0 8px 32px rgba(0,0,0,0.1); transform: translateY(-2px); }
      `}</style>
    </>
  );
}

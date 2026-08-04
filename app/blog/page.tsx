import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import Footer from '../components/Footer';
import Reveal from '../components/Reveal';
import { getPublishedPostsCached } from '../../lib/blog-db';
import { Clock, ArrowRight } from 'lucide-react';

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

  const [lead, ...rest] = items;

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

        <div className="page-container" style={{ padding: '48px 16px 64px' }}>
          {/* Головна стаття */}
          {lead && (
            <Reveal>
              <Link href={`/blog/${lead.slug}`} className="blog-card blog-lead" style={{
                display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: '0',
                background: 'var(--bg-card)', border: '1px solid var(--border)',
                borderRadius: '20px', overflow: 'hidden', textDecoration: 'none', marginBottom: '32px',
              }}>
                {lead.image && (
                  <div style={{ position: 'relative', minHeight: '260px' }}>
                    <Image src={lead.image} alt={lead.title} fill sizes="(max-width: 900px) 100vw, 55vw" priority style={{ objectFit: 'cover' }} />
                  </div>
                )}
                <div style={{ padding: '32px 34px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '12px', fontWeight: 700, padding: '3px 10px', borderRadius: '20px', background: 'var(--brand-blue-light)', color: 'var(--brand-blue)' }}>
                      {lead.category}
                    </span>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Clock size={12} /> {lead.readTime} хв читання
                    </span>
                  </div>
                  <h2 style={{ fontSize: 'clamp(20px, 2.2vw, 26px)', fontWeight: 900, color: 'var(--text-primary)', margin: '0 0 12px', lineHeight: 1.3, letterSpacing: '-0.3px' }}>
                    {lead.title}
                  </h2>
                  <p style={{ fontSize: '15px', color: 'var(--text-secondary)', lineHeight: 1.7, margin: '0 0 18px' }}>
                    {lead.description}
                  </p>
                  <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--brand-blue)', display: 'flex', alignItems: 'center', gap: '5px' }}>
                    Читати статтю <ArrowRight size={15} />
                  </span>
                </div>
              </Link>
            </Reveal>
          )}

          {/* Решта */}
          <div className="blog-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px' }}>
            {rest.map((article, i) => (
              <Reveal key={article.slug} delay={(i % 3) * 70}>
                <Link href={`/blog/${article.slug}`} className="blog-card" style={{
                  display: 'flex', flexDirection: 'column', height: '100%',
                  background: 'var(--bg-card)', border: '1px solid var(--border)',
                  borderRadius: '16px', overflow: 'hidden', textDecoration: 'none',
                }}>
                  {article.image && (
                    <div style={{ position: 'relative', aspectRatio: '1200 / 630' }}>
                      <Image src={article.image} alt={article.title} fill sizes="(max-width: 700px) 100vw, (max-width: 1100px) 50vw, 33vw" style={{ objectFit: 'cover' }} />
                    </div>
                  )}
                  <div style={{ padding: '20px 22px 22px', display: 'flex', flexDirection: 'column', flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 9px', borderRadius: '20px', background: 'var(--brand-blue-light)', color: 'var(--brand-blue)' }}>
                        {article.category}
                      </span>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Clock size={11} /> {article.readTime} хв
                      </span>
                    </div>
                    <h2 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 8px', lineHeight: 1.4 }}>
                      {article.title}
                    </h2>
                    <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6, margin: '0 0 14px' }}>
                      {article.description}
                    </p>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--brand-blue)', display: 'flex', alignItems: 'center', gap: '4px', marginTop: 'auto' }}>
                      Читати <ArrowRight size={14} />
                    </span>
                  </div>
                </Link>
              </Reveal>
            ))}
          </div>
        </div>
      </div>

      <Footer />
    </>
  );
}

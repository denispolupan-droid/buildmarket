import type { Metadata } from 'next';
import Link from 'next/link';
import Footer from '../../components/Footer';
import { ARTICLES } from '../../../lib/blog';
import { BookOpen, Clock, ArrowRight } from 'lucide-react';

const BASE = 'https://fixline.com.ua';

export const metadata: Metadata = {
  title: 'Блог | Советы по строительной химии — FIXLINE',
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
  },
};

export default function BlogRuPage() {
  const blogLd = {
    '@context': 'https://schema.org',
    '@type': 'Blog',
    name: 'Блог FIXLINE — советы по строительной химии',
    url: `${BASE}/ru/blog`,
    description: 'Полезные статьи о герметиках, монтажной пене, клеях и грунтовках.',
    publisher: { '@type': 'Organization', name: 'FIXLINE', url: BASE },
    blogPost: ARTICLES.map(a => ({
      '@type': 'BlogPosting',
      headline: a.titleRu ?? a.title,
      description: a.descriptionRu ?? a.description,
      url: `${BASE}/ru/blog/${a.slug}`,
      datePublished: a.date,
      image: `${BASE}${a.image}`,
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
            Советы, сравнения и ответы на часто задаваемые вопросы о строительной химии
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {ARTICLES.map(article => (
              <Link
                key={article.slug}
                href={`/ru/blog/${article.slug}`}
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
                      {article.categoryRu ?? article.category}
                    </span>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Clock size={12} /> {article.readTime} мин чтения
                    </span>
                  </div>
                  <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 8px', lineHeight: 1.4 }}>
                    {article.titleRu ?? article.title}
                  </h2>
                  <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.6, margin: '0 0 14px' }}>
                    {article.descriptionRu ?? article.description}
                  </p>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: '#4880B8', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    Читать статью <ArrowRight size={14} />
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

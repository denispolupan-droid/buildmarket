'use client';
import { useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface Article {
  slug: string;
  title: string;
  titleRu?: string;
  description: string;
  descriptionRu?: string;
  category: string;
  categoryRu?: string;
  image: string;
}

function FadeCoverImage({ src, alt }: { src: string; alt: string }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <Image
      src={src}
      alt={alt}
      width={480}
      height={270}
      loading="lazy"
      style={{
        width: '100%', height: '100%', objectFit: 'cover', display: 'block',
        opacity: loaded ? 1 : 0, transition: 'opacity 350ms ease',
      }}
      onLoad={() => setLoaded(true)}
    />
  );
}

export default function BlogCarousel({ articles }: { articles: Article[] }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const lang: 'uk' | 'ru' = pathname.startsWith('/ru') ? 'ru' : 'uk';
  const prefix = lang === 'ru' ? '/ru' : '';

  const scroll = (dir: 1 | -1) => {
    const w = trackRef.current?.offsetWidth ?? 1200;
    trackRef.current?.scrollBy({ left: dir * w, behavior: 'smooth' });
  };

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => scroll(-1)}
        aria-label={lang === 'ru' ? 'Прокрутить влево' : 'Прокрутити вліво'}
        className="blog-carousel-arrow"
        style={{
          position: 'absolute', left: '-20px', top: '50%', transform: 'translateY(-50%)',
          zIndex: 2, width: '40px', height: '40px', borderRadius: '50%',
          border: '1px solid var(--border)', background: 'var(--bg-card)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        }}
      >
        <ChevronLeft size={18} color="var(--text-secondary)" />
      </button>
      <button
        onClick={() => scroll(1)}
        aria-label={lang === 'ru' ? 'Прокрутить вправо' : 'Прокрутити вправо'}
        className="blog-carousel-arrow"
        style={{
          position: 'absolute', right: '-20px', top: '50%', transform: 'translateY(-50%)',
          zIndex: 2, width: '40px', height: '40px', borderRadius: '50%',
          border: '1px solid var(--border)', background: 'var(--bg-card)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        }}
      >
        <ChevronRight size={18} color="var(--text-secondary)" />
      </button>

      {/* Scrollable track — shows exactly 4 cards on desktop; on mobile each card
          (.blog-carousel-card) becomes ~1 per screen with a peek of the next one,
          see the mobile override in globals.css */}
      <div
        ref={trackRef}
        className="blog-carousel-track"
        style={{
          display: 'flex', gap: '20px',
          overflowX: 'auto', scrollbarWidth: 'none',
          scrollSnapType: 'x mandatory',
          padding: '4px 4px 12px',
        }}
      >
        {articles.map(article => {
          const title = lang === 'ru' ? (article.titleRu ?? article.title) : article.title;
          const description = lang === 'ru' ? (article.descriptionRu ?? article.description) : article.description;
          const category = lang === 'ru' ? (article.categoryRu ?? article.category) : article.category;
          return (
          <Link
            key={article.slug}
            href={`${prefix}/blog/${article.slug}`}
            style={{
              flex: '0 0 calc(25% - 15px)',
              minWidth: '220px',
              borderRadius: '14px',
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              overflow: 'hidden',
              display: 'flex', flexDirection: 'column',
              textDecoration: 'none',
              scrollSnapAlign: 'start',
              transition: 'box-shadow 0.15s ease, transform 0.15s ease',
            }}
            className="blog-card-link blog-carousel-card"
          >
            <div style={{ aspectRatio: '16/9', overflow: 'hidden', flexShrink: 0 }}>
              <FadeCoverImage src={article.image} alt={title} />
            </div>
            <div style={{ padding: '14px 16px', flex: 1, display: 'flex', flexDirection: 'column', gap: '7px' }}>
              <span style={{ fontSize: '10px', fontWeight: 700, color: '#4880B8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {category}
              </span>
              <p style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', margin: 0, lineHeight: 1.4 }}>
                {title}
              </p>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0, lineHeight: 1.5, flex: 1 }}>
                {description}
              </p>
              <span style={{ fontSize: '12px', color: '#4880B8', fontWeight: 600, marginTop: '4px' }}>
                {lang === 'ru' ? 'Читать →' : 'Читати →'}
              </span>
            </div>
          </Link>
          );
        })}
      </div>
    </div>
  );
}

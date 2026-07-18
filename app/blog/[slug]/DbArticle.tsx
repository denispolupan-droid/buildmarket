import Image from 'next/image';
import Link from 'next/link';
import { Clock } from 'lucide-react';
import Footer from '../../components/Footer';
import { getPublishedPostsCached, type BlogPost } from '../../../lib/blog-db';

// Рендер статті з БД — той самий шаблон, що й у статичних статей (lib/blog.ts),
// тіло — довірений HTML з нашого AI-конвеєра через .article-body.

const BASE = 'https://fixline.com.ua';
const DEFAULT_COVER = '/blog/covers/default.png';

type Props = { post: BlogPost; lang?: 'uk' | 'ru' };

export function postText(post: BlogPost, lang: 'uk' | 'ru') {
  if (lang === 'ru') {
    return {
      title: post.title_ru ?? post.title,
      description: post.description_ru ?? post.description,
      category: post.category_ru ?? post.category,
      content: post.content_html_ru ?? post.content_html,
      faq: post.faq_ru.length ? post.faq_ru : post.faq,
    };
  }
  return { title: post.title, description: post.description, category: post.category, content: post.content_html, faq: post.faq };
}

export default async function DbArticle({ post, lang = 'uk' }: Props) {
  const t = postText(post, lang);
  const prefix = lang === 'ru' ? '/ru' : '';
  const date = post.published_at ?? post.created_at;
  const cover = post.image ?? DEFAULT_COVER;
  const L = lang === 'ru'
    ? { home: 'Главная', blog: 'Блог', min: 'мин чтения', faq: 'Частые вопросы', ctaTitle: 'Найдите нужный материал в нашем магазине', ctaText: 'Широкий выбор от проверенных производителей. От 1 единицы, доставка по всей Украине.', toShop: 'В магазин', other: 'Другие статьи', also: 'Читайте также' }
    : { home: 'Головна', blog: 'Блог', min: 'хв читання', faq: 'Часті запитання', ctaTitle: 'Знайдіть потрібний матеріал у нашому магазині', ctaText: 'Широкий вибір від перевірених виробників. Від 1 одиниці, доставка по всій Україні.', toShop: 'До магазину', other: 'Інші статті', also: 'Читайте також' };

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: L.home, item: `${BASE}${prefix || '/'}` },
      { '@type': 'ListItem', position: 2, name: L.blog, item: `${BASE}${prefix}/blog` },
      { '@type': 'ListItem', position: 3, name: t.title, item: `${BASE}${prefix}/blog/${post.slug}` },
    ],
  };

  const articleLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: t.title,
    description: t.description,
    image: `${BASE}${cover}`,
    datePublished: date,
    dateModified: post.updated_at,
    author: { '@type': 'Person', name: lang === 'ru' ? 'Редакция FIXLINE' : 'Редакція FIXLINE' },
    publisher: { '@type': 'Organization', name: 'FIXLINE', url: BASE },
    url: `${BASE}${prefix}/blog/${post.slug}`,
  };

  const faqLd = t.faq.length ? {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: t.faq.map(({ q, a }) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
  } : null;

  const related = (await getPublishedPostsCached()).filter(p => p.slug !== post.slug).slice(0, 3);

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd).replace(/</g, '\\u003c') }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleLd).replace(/</g, '\\u003c') }} />
      {faqLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd).replace(/</g, '\\u003c') }} />}
      <div style={{ background: 'var(--bg-soft)', minHeight: '100vh' }}>
        <div style={{ maxWidth: '760px', margin: '0 auto', padding: '40px 32px 64px' }}>
          <nav aria-label="Breadcrumb" style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <Link href={prefix || '/'} style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>{L.home}</Link>
            <span>›</span>
            <Link href={`${prefix}/blog`} style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>{L.blog}</Link>
            <span>›</span>
            <span style={{ color: 'var(--text-secondary)' }}>{t.title}</span>
          </nav>

          <article>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, padding: '3px 10px', borderRadius: '20px', background: '#EFF6FF', color: '#4880B8' }}>
                {t.category}
              </span>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Clock size={12} /> {post.read_time} {L.min}
              </span>
              <time dateTime={date} style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                {new Date(date).toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'uk-UA', { day: 'numeric', month: 'long', year: 'numeric' })}
              </time>
            </div>

            <h1 style={{ fontSize: '28px', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.3, margin: '0 0 12px' }}>{t.title}</h1>
            <p style={{ fontSize: '16px', color: 'var(--text-secondary)', lineHeight: 1.6, margin: '0 0 32px' }}>{t.description}</p>

            {post.image && (
              <div style={{ borderRadius: '12px', overflow: 'hidden', marginBottom: '36px' }}>
                <Image src={post.image} alt={t.title} width={1200} height={630} priority style={{ width: '100%', height: 'auto', display: 'block' }} />
              </div>
            )}

            <div className="article-body" dangerouslySetInnerHTML={{ __html: t.content }} />
          </article>

          {t.faq.length > 0 && (
            <div style={{ marginTop: '48px', padding: '24px 28px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '14px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 20px' }}>{L.faq}</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {t.faq.map((item, i) => (
                  <div key={i} style={{ borderTop: i > 0 ? '1px solid var(--border)' : undefined, paddingTop: i > 0 ? '16px' : undefined }}>
                    <p style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 8px' }}>{item.q}</p>
                    <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.65, margin: 0 }}>{item.a}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ marginTop: '48px', padding: '24px 28px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '14px' }}>
            <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>{L.ctaTitle}</div>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '16px', lineHeight: 1.6 }}>{L.ctaText}</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
              {(post.related_links.length ? post.related_links : [{ label: L.toShop, href: '/shop' }]).map(({ label, href }) => (
                <Link key={href} href={`${prefix}${href}`} style={{ height: '38px', borderRadius: '8px', background: '#4880B8', color: '#fff', fontSize: '13px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '0 12px' }}>
                  {label}
                </Link>
              ))}
              <Link href={`${prefix}/blog`} style={{ height: '38px', padding: '0 18px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-soft)', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 600, display: 'inline-flex', alignItems: 'center' }}>
                {L.other}
              </Link>
            </div>
          </div>

          {related.length > 0 && (
            <div style={{ marginTop: '40px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 20px' }}>{L.also}</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {related.map(a => (
                  <Link key={a.slug} href={`${prefix}/blog/${a.slug}`} style={{ display: 'flex', gap: '16px', alignItems: 'center', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '10px', padding: '12px', textDecoration: 'none' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 4px', lineHeight: 1.3 }}>
                        {lang === 'ru' ? (a.title_ru ?? a.title) : a.title}
                      </p>
                      <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>{a.read_time} {L.min}</p>
                    </div>
                    <span style={{ fontSize: '16px', color: 'var(--text-muted)', flexShrink: 0 }}>›</span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <Footer />
      <style>{`
        .article-body { font-size: 15px; color: var(--text-secondary); line-height: 1.8; }
        .article-body h2 { font-size: 20px; font-weight: 800; color: var(--text-primary); margin: 32px 0 12px; }
        .article-body h3 { font-size: 16px; font-weight: 700; color: var(--text-primary); margin: 20px 0 8px; }
        .article-body p { margin: 0 0 14px; }
        .article-body ul, .article-body ol { padding-left: 22px; margin: 0 0 14px; }
        .article-body li { margin-bottom: 6px; }
        .article-body strong { color: var(--text-primary); font-weight: 600; }
        .article-body a { color: #4880B8; }
        .article-body table { width: 100%; border-collapse: collapse; margin: 16px 0 20px; font-size: 14px; }
        .article-body th { background: var(--bg-soft); padding: 10px 14px; text-align: left; font-weight: 600; color: var(--text-primary); border: 1px solid var(--border); }
        .article-body td { padding: 10px 14px; border: 1px solid var(--border); color: var(--text-secondary); }
        .article-body tr:nth-child(even) td { background: var(--bg-soft); }
      `}</style>
    </>
  );
}

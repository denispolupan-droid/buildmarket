import Image from 'next/image';
import Link from 'next/link';
import { Clock, ArrowRight } from 'lucide-react';
import Footer from '../../components/Footer';
import Reveal from '../../components/Reveal';
import { getPublishedPostsCached, type BlogPost } from '../../../lib/blog-db';
import { localizeArticleHtml } from '../../../lib/sanitize-article';
import { getCategoriesCached, getProductsLightCached } from '../../../lib/supabase';
import { categoriesWithProducts } from '../../../lib/seo/meta';
import ArticleProducts from './ArticleProducts';

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
  // Обкладинка з вшитим заголовком: на /ru — російський варіант (фолбек на укр)
  const coverImg = lang === 'ru' ? (post.image_ru ?? post.image) : post.image;
  const cover = coverImg ?? DEFAULT_COVER;
  const L = lang === 'ru'
    ? { home: 'Главная', blog: 'Блог', min: 'мин чтения', faq: 'Частые вопросы', ctaTitle: 'Найдите нужный материал в нашем магазине', ctaText: 'Широкий выбор от проверенных производителей. От 1 единицы, доставка по всей Украине.', toShop: 'В магазин', other: 'Другие статьи', also: 'Читайте также', buy: 'Купить' }
    : { home: 'Головна', blog: 'Блог', min: 'хв читання', faq: 'Часті запитання', ctaTitle: 'Знайдіть потрібний матеріал у нашому магазині', ctaText: 'Широкий вибір від перевірених виробників. Від 1 одиниці, доставка по всій Україні.', toShop: 'До магазину', other: 'Інші статті', also: 'Читайте також', buy: 'Купити' };

  // Категорії, у яких реально є товар. Вести читача в порожній листинг — і погана
  // сторінка для нього, і злитий слот у блоці «купити». Порожні відсіюємо на рендері,
  // щоб нічого не підтримувати руками: зникне товар — зникне і кнопка.
  const [allCats, lightProducts] = await Promise.all([getCategoriesCached(), getProductsLightCached()]);
  const liveCats = categoriesWithProducts(allCats, lightProducts);
  const shopLinks = post.related_links.filter(
    l => !l.href.startsWith('/shop/') || liveCats.has(l.href.slice('/shop/'.length)),
  );
  // Головна категорія статті — для комерційного посилання одразу під ліде.
  // Стаття зараз ранжується краще за листинг (аудит 31.07: «бетоноконтакт» — стаття 3-тя,
  // категорія 54-та), тож читача треба передати в магазин на початку, а не лише в кінці.
  const primaryShop = shopLinks.find(l => l.href.startsWith('/shop/'));

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
  const crumbLink: React.CSSProperties = { color: 'rgba(226,232,240,0.65)', textDecoration: 'none' };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd).replace(/</g, '\\u003c') }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleLd).replace(/</g, '\\u003c') }} />
      {faqLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd).replace(/</g, '\\u003c') }} />}

      <div style={{ background: 'var(--bg-soft)', minHeight: '100vh' }}>
        {/* Шапка статті */}
        <section style={{
          background: 'radial-gradient(900px 460px at 85% -20%, rgba(94,234,212,0.14), transparent 60%), radial-gradient(700px 420px at -5% 120%, rgba(72,128,184,0.30), transparent 60%), linear-gradient(160deg, #0F172A 0%, #1E3A5F 60%, #123B54 100%)',
          padding: '32px 0 44px',
        }}>
          <div style={{ maxWidth: '800px', margin: '0 auto', padding: '0 24px' }}>
            <nav aria-label="Breadcrumb" style={{ fontSize: '13px', color: 'rgba(226,232,240,0.65)', marginBottom: '22px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
              <Link href={prefix || '/'} style={crumbLink}>{L.home}</Link>
              <span>›</span>
              <Link href={`${prefix}/blog`} style={crumbLink}>{L.blog}</Link>
              <span>›</span>
              <span style={{ color: '#E2E8F0' }}>{t.title}</span>
            </nav>

            <span className="eyebrow on-dark">{t.category}</span>
            <h1 style={{ fontSize: 'clamp(26px, 3.4vw, 40px)', fontWeight: 900, color: '#fff', lineHeight: 1.2, margin: '12px 0 14px', letterSpacing: '-0.7px' }}>
              {t.title}
            </h1>
            <p style={{ fontSize: '17px', color: '#94A3B8', lineHeight: 1.7, margin: '0 0 20px' }}>{t.description}</p>

            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap', fontSize: '13px', color: 'rgba(148,163,184,0.9)' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <Clock size={13} /> {post.read_time} {L.min}
              </span>
              <time dateTime={date}>
                {new Date(date).toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'uk-UA', { day: 'numeric', month: 'long', year: 'numeric' })}
              </time>
              {primaryShop && (
                <Link
                  href={`${prefix}${primaryShop.href}`}
                  style={{ fontSize: '13px', fontWeight: 700, color: 'var(--brand-teal-bright)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                >
                  {L.buy} {primaryShop.label.toLocaleLowerCase(lang === 'ru' ? 'ru-RU' : 'uk-UA')} <ArrowRight size={13} />
                </Link>
              )}
            </div>
          </div>
        </section>

        <div style={{ maxWidth: '800px', margin: '0 auto', padding: '0 24px 64px' }}>
          <article>
            {coverImg && (
              <div style={{ borderRadius: '18px', overflow: 'hidden', margin: '-24px 0 36px', border: '1px solid var(--border)', boxShadow: '0 12px 40px rgba(15,23,42,0.14)' }}>
                <Image src={coverImg} alt={t.title} width={1200} height={630} priority style={{ width: '100%', height: 'auto', display: 'block' }} />
              </div>
            )}

            {/* На /ru внутрішні посилання в тілі статті отримують префікс /ru */}
            <div className="article-body" dangerouslySetInnerHTML={{ __html: localizeArticleHtml(t.content, lang) }} />

            {/* Товари статті — ціни й наявність живі, не з тексту */}
            <ArticleProducts skus={post.product_skus ?? []} lang={lang} />
          </article>

          {t.faq.length > 0 && (
            <section style={{ marginTop: '48px' }}>
              <Reveal>
                <span className="eyebrow alt">{L.faq}</span>
              </Reveal>
              <div className="faq-accordion" style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '14px' }}>
                {t.faq.map((item, i) => (
                  <Reveal key={i} delay={i * 40}>
                    <details style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '15px 18px' }}>
                      <summary style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', cursor: 'pointer' }}>{item.q}</summary>
                      <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.7, margin: '10px 0 0' }}>{item.a}</p>
                    </details>
                  </Reveal>
                ))}
              </div>
            </section>
          )}

          {/* Комерційний блок */}
          <Reveal>
            <section style={{
              marginTop: '48px', padding: '30px 32px', borderRadius: '20px',
              background: 'radial-gradient(600px 300px at 90% -30%, rgba(94,234,212,0.12), transparent 60%), linear-gradient(160deg, #0F172A 0%, #1E3059 100%)',
            }}>
              <h2 style={{ fontSize: 'clamp(18px, 2.2vw, 24px)', fontWeight: 900, color: '#fff', margin: '0 0 10px', letterSpacing: '-0.3px', lineHeight: 1.3 }}>
                {L.ctaTitle}
              </h2>
              <p style={{ fontSize: '14px', color: '#94A3B8', margin: '0 0 20px', lineHeight: 1.7 }}>{L.ctaText}</p>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                {(shopLinks.length ? shopLinks : [{ label: L.toShop, href: '/shop' }]).map(({ label, href }) => (
                  <Link key={href} href={`${prefix}${href}`} style={{
                    height: '42px', padding: '0 20px', borderRadius: '10px', background: 'var(--brand-blue)',
                    color: '#fff', fontSize: '13px', fontWeight: 700,
                    display: 'inline-flex', alignItems: 'center', textDecoration: 'none',
                  }}>
                    {label}
                  </Link>
                ))}
                <Link href={`${prefix}/blog`} style={{
                  height: '42px', padding: '0 20px', borderRadius: '10px',
                  border: '1.5px solid rgba(255,255,255,0.18)', background: 'rgba(255,255,255,0.04)',
                  color: '#E2E8F0', fontSize: '13px', fontWeight: 600,
                  display: 'inline-flex', alignItems: 'center', textDecoration: 'none',
                }}>
                  {L.other}
                </Link>
              </div>
            </section>
          </Reveal>

          {related.length > 0 && (
            <section style={{ marginTop: '48px' }}>
              <Reveal>
                <span className="eyebrow">{L.also}</span>
              </Reveal>
              <div className="blog-related" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginTop: '14px' }}>
                {related.map((a, i) => {
                  const img = lang === 'ru' ? (a.image_ru ?? a.image) : a.image;
                  return (
                    <Reveal key={a.slug} delay={i * 70}>
                      <Link href={`${prefix}/blog/${a.slug}`} className="blog-card" style={{
                        display: 'flex', flexDirection: 'column', height: '100%',
                        background: 'var(--bg-card)', border: '1px solid var(--border)',
                        borderRadius: '14px', overflow: 'hidden', textDecoration: 'none',
                      }}>
                        {img && (
                          <div style={{ position: 'relative', aspectRatio: '1200 / 630' }}>
                            <Image src={img} alt={lang === 'ru' ? (a.title_ru ?? a.title) : a.title} fill sizes="(max-width: 700px) 100vw, 33vw" style={{ objectFit: 'cover' }} />
                          </div>
                        )}
                        <div style={{ padding: '14px 16px 16px' }}>
                          <p style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 6px', lineHeight: 1.4 }}>
                            {lang === 'ru' ? (a.title_ru ?? a.title) : a.title}
                          </p>
                          <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0, display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Clock size={11} /> {a.read_time} {L.min}
                          </p>
                        </div>
                      </Link>
                    </Reveal>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      </div>

      <Footer />
      <style>{`
        .article-body { font-size: 16px; color: var(--text-secondary); line-height: 1.85; }
        .article-body h2 { font-size: 22px; font-weight: 800; color: var(--text-primary); margin: 36px 0 12px; letter-spacing: -0.3px; }
        .article-body h3 { font-size: 17px; font-weight: 700; color: var(--text-primary); margin: 24px 0 8px; }
        .article-body p { margin: 0 0 16px; }
        .article-body ul, .article-body ol { padding-left: 22px; margin: 0 0 16px; }
        .article-body li { margin-bottom: 7px; }
        .article-body strong { color: var(--text-primary); font-weight: 600; }
        .article-body a { color: var(--brand-blue); }
        .article-body table { width: 100%; border-collapse: collapse; margin: 18px 0 22px; font-size: 14px; }
        .article-body th { background: var(--bg-soft); padding: 10px 14px; text-align: left; font-weight: 600; color: var(--text-primary); border: 1px solid var(--border); }
        .article-body td { padding: 10px 14px; border: 1px solid var(--border); color: var(--text-secondary); }
        .article-body tr:nth-child(even) td { background: var(--bg-soft); }
      `}</style>
    </>
  );
}

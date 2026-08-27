import type { Metadata } from 'next';
import Link from 'next/link';

export const revalidate = 300;

export const metadata: Metadata = {
  title: 'FIXLINE — професійна будівельна хімія оптом та в роздріб',
  description: 'Герметики, монтажні піни, клеї, ґрунтовки від провідних брендів. Оптові ціни для дилерів та підрядників. Доставка по всій Україні від 1 одиниці.',
  keywords: ['будівельна хімія', 'строительная химия', 'герметики', 'монтажна піна', 'монтажная пена', 'клеї', 'клеи', 'ґрунтовки', 'грунтовки', 'будівельна хімія оптом', 'строительная химия оптом', 'купити', 'купить', 'Україна', 'Украина'],
  alternates: { canonical: 'https://fixline.com.ua', languages: { 'uk': 'https://fixline.com.ua', 'ru': 'https://fixline.com.ua/ru', 'x-default': 'https://fixline.com.ua' } },
  openGraph: {
    title: 'FIXLINE — професійна будівельна хімія',
    description: 'Герметики, монтажні піни, клеї, ґрунтовки. Оптові ціни, доставка по Україні.',
    url: 'https://fixline.com.ua',
    siteName: 'FIXLINE',
    locale: 'uk_UA',
    type: 'website',
  },
};
import { Truck, Store, LayoutGrid, CheckCircle, PackageCheck, ShoppingCart, Phone, ArrowRight } from 'lucide-react';
import { getCategoriesCached, getPreviewProductsCached, getBrandLogosCached, getVisibleBrandLogosCached, getReviewStatsCached, getProductsCached } from '../lib/supabase';
import { getShowcaseSkusCached } from '../lib/showcase-server';
import { mergeVisibleBrands } from '../lib/brands';
import Footer from './components/Footer';
import HomeSearch from './components/HomeSearch';
import HeroHitChips from './components/HeroHitChips';
import HomeCategoryCards from './components/HomeCategoryCards';
import CategorySection from './components/CategorySection';
import PromoBanner from './components/PromoBanner';
import BrandsCarousel from './components/BrandsCarousel';
import BlogCarousel from './components/BlogCarousel';
import DeliveryMapCard from './components/DeliveryMapCard';
import Reveal from './components/Reveal';
import BgFadeImage from './components/BgFadeImage';
import { getPublishedPostsCached } from '../lib/blog-db';


export default async function Home() {
  const categories = await getCategoriesCached();
  const allSlugs = categories.map(c => c.slug);
  const products = await getPreviewProductsCached(allSlugs, 2);
  const brandLogos = await getBrandLogosCached();
  const visibleBrandLogos = await getVisibleBrandLogosCached();
  const brandTiles = mergeVisibleBrands(visibleBrandLogos);
  const reviewStats = await getReviewStatsCached();

  // Чипи хітів біля пошуку: закріплена вітрина магазину; якщо закріплених
  // у наявності менше чотирьох — добираємо товарами з прапорцем is_hit.
  const [showcaseSkus, allProducts] = await Promise.all([
    getShowcaseSkusCached('shop'),
    getProductsCached(),
  ]);
  const sellable = (p: (typeof allProducts)[number]) =>
    p.stock?.stock_status === 'in_stock' && (p.stock?.price_promo ?? p.stock?.price_retail) != null;
  const bySku = new Map(allProducts.map(p => [p.sku, p]));
  const hitPool = showcaseSkus
    .map(sku => bySku.get(sku))
    .filter((p): p is NonNullable<typeof p> => !!p && sellable(p));
  for (const p of allProducts) {
    if (hitPool.length >= 20) break;
    if (p.is_hit && sellable(p) && !hitPool.some(h => h.sku === p.sku)) hitPool.push(p);
  }
  const heroHits = hitPool.slice(0, 20);

  // Карусель блогу: опубліковані статті з БД (тільки з обкладинкою)
  const blogArticles = (await getPublishedPostsCached())
    .filter(p => p.image)
    .slice(0, 10)
    .map(p => ({
      slug: p.slug,
      title: p.title,
      titleRu: p.title_ru ?? undefined,
      description: p.description,
      descriptionRu: p.description_ru ?? undefined,
      category: p.category,
      categoryRu: p.category_ru ?? undefined,
      image: p.image as string,
    }));

  const orgLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': 'https://fixline.com.ua/#organization',
    name: 'FIXLINE',
    url: 'https://fixline.com.ua',
    logo: 'https://fixline.com.ua/fixline-logo.png',
    telephone: '+380991997788',
    email: 'info@fixline.com.ua',
    address: { '@type': 'PostalAddress', addressCountry: 'UA', addressRegion: 'Харківська область' },
    contactPoint: { '@type': 'ContactPoint', telephone: '+380991997788', contactType: 'sales', availableLanguage: ['Ukrainian', 'Russian'] },
  };

  const websiteLd = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'FIXLINE',
    url: 'https://fixline.com.ua',
    potentialAction: {
      '@type': 'SearchAction',
      target: { '@type': 'EntryPoint', urlTemplate: 'https://fixline.com.ua/shop?q={search_term_string}' },
      'query-input': 'required name=search_term_string',
    },
  };

  const localBusinessLd = {
    '@context': 'https://schema.org',
    '@type': ['LocalBusiness', 'HardwareStore'],
    '@id': 'https://fixline.com.ua/#organization',
    name: 'FIXLINE',
    description: 'B2B постачальник будівельної хімії: герметики, монтажні піни, клеї, ґрунтовки оптом і в роздріб.',
    url: 'https://fixline.com.ua',
    logo: 'https://fixline.com.ua/fixline-logo.png',
    image: 'https://fixline.com.ua/fixline-logo.png',
    telephone: '+380991997788',
    email: 'info@fixline.com.ua',
    address: {
      '@type': 'PostalAddress',
      addressLocality: 'Харків',
      addressRegion: 'Харківська область',
      addressCountry: 'UA',
    },
    openingHoursSpecification: {
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
      opens: '09:00',
      closes: '16:00',
    },
    priceRange: '$$',
    areaServed: { '@type': 'Country', name: 'Ukraine' },
    sameAs: ['https://share.google/k3RSZ5LP8hLXDuNwX'],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(orgLd).replace(/</g, '\\u003c') }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteLd).replace(/</g, '\\u003c') }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(localBusinessLd).replace(/</g, '\\u003c') }} />
      <PromoBanner />

      {/* Hero — вузька фірмова шапка, як на сторінці блогу */}
      <section style={{
        background: 'radial-gradient(900px 460px at 85% -20%, rgba(94,234,212,0.16), transparent 60%), radial-gradient(700px 420px at -5% 120%, rgba(72,128,184,0.32), transparent 60%), linear-gradient(160deg, #0F172A 0%, #1E3A5F 60%, #123B54 100%)',
        padding: '56px 0 52px',
      }}>
        <div className="page-container">
          <div className="home-hero-grid" style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '48px', alignItems: 'center' }}>
            <Reveal>
              <span className="eyebrow on-dark">Цифрова платформа будівельних рішень</span>
              <h1 style={{ fontSize: 'clamp(28px, 3.8vw, 44px)', fontWeight: 900, color: '#fff', lineHeight: 1.18, margin: '14px 0 16px', letterSpacing: '-0.8px', maxWidth: '760px' }}>
                Будівельна хімія <span className="grad-text">оптом і в роздріб</span>
              </h1>
              <p style={{ fontSize: '16px', color: '#94A3B8', lineHeight: 1.7, margin: 0, maxWidth: '620px' }}>
                Герметики, монтажні піни, клеї та ґрунтовки від провідних брендів.
                Відправка в день замовлення: Нова Пошта або точки видачі ROZETKA по всій Україні.
              </p>
            </Reveal>
            <Reveal delay={110}>
              <div className="home-hero-ctas">
                <Link href="/shop" className="hero-cta-btn" style={{
                  height: '46px', padding: '0 26px', borderRadius: '11px',
                  background: 'var(--brand-blue)', color: '#fff', fontSize: '14px', fontWeight: 700,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                  textDecoration: 'none', boxShadow: 'var(--brand-shadow)',
                }}>
                  До магазину <ArrowRight size={15} />
                </Link>
                <Link href="/register" className="hero-cta-btn" style={{
                  height: '46px', padding: '0 22px', borderRadius: '11px',
                  border: '1.5px solid rgba(255,255,255,0.2)', color: '#E2E8F0',
                  fontSize: '14px', fontWeight: 600,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                  textDecoration: 'none', background: 'rgba(255,255,255,0.04)',
                }}>
                  Стати партнером
                </Link>
              </div>
            </Reveal>
          </div>

        </div>
      </section>

      {/* Пошук + популярні категорії — перший екран під hero */}
      <section style={{ background: 'var(--bg-soft)', padding: '14px 0 40px' }}>
        <div className="page-container">
          {/* zIndex: transform від Reveal створює stacking context — без нього
              випадашка пошуку опинилася б ПІД картками категорій */}
          <Reveal style={{ position: 'relative', zIndex: 50 }}>
            <div className="home-search-row">
              <HomeSearch lang="uk" />
              <HeroHitChips products={heroHits} lang="uk" />
            </div>
          </Reveal>
          <HomeCategoryCards categories={categories} lang="uk" />
        </div>
      </section>

      {/* Brands auto-scroll carousel — right after hero */}
      <BrandsCarousel logos={brandLogos} brands={brandTiles} />

      {/* Як ми працюємо */}
      <section style={{ background: 'var(--bg-soft)', padding: '56px 0', borderTop: '1px solid var(--border)' }}>
        <div className="page-container">
          <Reveal>
            <h2 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', textAlign: 'center', marginBottom: '8px' }}>
              Як ми працюємо
            </h2>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', textAlign: 'center', marginBottom: '40px' }}>
              Прозора та проста схема від замовлення до доставки
            </p>
          </Reveal>
          <div className="how-we-work-grid" style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '16px',
          }}>
            {[
              { icon: Store,        title: 'Магазин або Опт',        text: 'Обирайте формат: роздріб від 1 шт або оптові умови для бізнесу', color: '#6366F1' },
              { icon: ShoppingCart, title: 'Оформіть замовлення',     text: 'Додайте товари в кошик або надішліть запит менеджеру',          color: '#4880B8' },
              { icon: Phone,        title: 'Підтвердження',           text: 'Менеджер підтвердить замовлення та узгодить деталі',             color: '#0891B2' },
              { icon: Truck,        title: 'Доставка',                text: 'Нова Пошта або точка видачі ROZETKA — у будь-якому місті України', color: '#D97706' },
            ].map(({ icon: Icon, title, text, color }, i) => (
              <Reveal key={title} delay={i * 110}>
                <div className="home-step-card" style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  borderTop: `3px solid ${color}`,
                  borderRadius: '2px 2px 14px 14px',
                  padding: '18px 20px 20px',
                  display: 'flex', flexDirection: 'column', gap: '10px',
                  boxShadow: '0 2px 12px rgba(0,0,0,0.07)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{
                      width: '40px', height: '40px', borderRadius: '11px',
                      background: `linear-gradient(135deg, ${color}22 0%, ${color}0e 100%)`,
                      border: `1.5px solid ${color}30`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      <Icon size={20} color={color} strokeWidth={1.75} />
                    </div>
                    <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.25, flex: 1, minWidth: 0, overflowWrap: 'break-word', hyphens: 'auto', WebkitHyphens: 'auto' }}>
                      {title}
                    </div>
                  </div>
                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                    {text}
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>


      {/* Three paths */}
      <section style={{ background: 'var(--bg-card)', padding: '48px 0' }}>
        <div className="page-container">
          <Reveal>
            <h2 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', textAlign: 'center', marginBottom: '8px' }}>
              Оберіть зручний формат співпраці
            </h2>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', textAlign: 'center', marginBottom: '32px' }}>
              Роздріб, опт або дропшипінг — знайдемо умови для кожного
            </p>
          </Reveal>
          <div className="home-paths-grid">

            {[
              {
                icon: Store, color: '#4880B8', title: 'Магазин',
                text: 'Для приватних покупців. Купуйте від 1 одиниці за привабливими цінами. Реєстрація не обов’язкова.',
                items: ['Від 1 штуки', 'Кращі ціни', 'Без реєстрації', 'Доставка по Україні'],
                href: '/shop', cta: 'Перейти до магазину',
              },
              {
                icon: LayoutGrid, color: '#6366F1', title: 'Оптовий каталог',
                text: 'Для дилерів, підрядників та магазинів. Оптові ціни та персональні умови для вашого бізнесу.',
                items: ['Оптові ціни', 'Персональні тарифи', 'Табличний каталог', 'Рахунки-фактури'],
                // Веде на /opt, а не одразу в /login?next=/catalog: людина, яка ще
                // не знає умов, потрапляла прямо на форму входу. Тепер спершу
                // сторінка з умовами, а вхід і реєстрація — кнопками на ній
                // (як у картці дропшипінгу, рішення власника).
                href: '/opt', cta: 'Дізнатись більше',
              },
              {
                icon: PackageCheck, color: '#0891B2', title: 'Дропшипінг',
                text: 'Для онлайн-продавців. Продавайте наші товари без складу — ми відправляємо напряму Вашим клієнтам.',
                items: ['Без власного складу', 'Актуальний XML/YML прайс', 'Проста передача замовлень', 'Персональні ціни'],
                href: '/dropship', cta: 'Дізнатись більше',
              },
            ].map(({ icon: Icon, color, title, text, items, href, cta }, i) => (
              <Reveal key={title} delay={i * 120}>
                <div className="home-path-card" style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  borderTop: `3px solid ${color}`,
                  borderRadius: '2px 2px 14px 14px',
                  padding: '20px 22px 22px',
                  display: 'flex', flexDirection: 'column', gap: '12px',
                  boxShadow: '0 2px 12px rgba(0,0,0,0.07)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{
                      width: '40px', height: '40px', borderRadius: '11px',
                      background: `linear-gradient(135deg, ${color}22 0%, ${color}0e 100%)`,
                      border: `1.5px solid ${color}30`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
                      <Icon size={20} color={color} strokeWidth={1.75} />
                    </div>
                    <h3 style={{ fontSize: '17px', fontWeight: 800, color: 'var(--text-primary)', margin: 0, minWidth: 0, overflowWrap: 'break-word' }}>{title}</h3>
                  </div>
                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
                    {text}
                  </p>
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    {items.map(item => (
                      <li key={item} style={{ fontSize: '13px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'var(--text-secondary)', flexShrink: 0, opacity: 0.4 }} />
                        {item}
                      </li>
                    ))}
                  </ul>
                  <Link href={href} style={{
                    marginTop: 'auto', height: '40px', borderRadius: '10px',
                    background: color, color: '#fff', fontSize: '13px', fontWeight: 700,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                    textDecoration: 'none',
                  }}>
                    <Icon size={14} />{cta}
                  </Link>
                </div>
              </Reveal>
            ))}

          </div>
        </div>
      </section>

      {/* Categories carousel + interactive preview */}
      {categories.length > 0 && (
        <section className="home-category-section" style={{ background: 'var(--bg-soft)', padding: '20px 0 44px', borderTop: '1px solid var(--border)' }}>
          <div className="page-container">
            <Reveal>
              <h2 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)', textAlign: 'center', marginBottom: '6px' }}>
                Швидкий перегляд товарів
              </h2>
              <p style={{ fontSize: '14px', color: 'var(--text-secondary)', textAlign: 'center', marginBottom: '32px' }}>
                Оберіть категорію зліва — і подивіться товари з цінами, не залишаючи головну
              </p>
            </Reveal>
            <Reveal delay={80}>
              <CategorySection categories={categories} products={products} reviewStats={reviewStats} />
            </Reveal>
          </div>
        </section>
      )}

      {/* Warehouse + Map section */}
      <section style={{ background: 'var(--bg-card)', padding: '60px 0', borderTop: '1px solid var(--border)' }}>
        <div className="page-container">
          <Reveal>
            <h2 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', textAlign: 'center', marginBottom: '8px' }}>
              Склад і доставка
            </h2>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', textAlign: 'center', marginBottom: '32px' }}>
              Власні складські потужності та мережа доставки по всій Україні
            </p>
          </Reveal>
          <div className="home-warehouse-grid" style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '32px',
            alignItems: 'stretch',
          }}>
            {/* Left: Warehouse photo card — brand top stripe (same recipe as the "Оберіть формат" / "Категорії" cards) so it reads as its own card instead of blurring into the map card next to it */}
            <Reveal y={26} duration={1600} style={{ height: '100%' }}>
            <div className="home-warehouse-card" style={{
              position: 'relative', overflow: 'hidden',
              borderRadius: '20px',
              // Фірмовий градієнт hero — фото лягає поверх нього multiply-шаром
              background: 'radial-gradient(560px 300px at 85% -10%, rgba(94,234,212,0.14), transparent 60%), linear-gradient(160deg, #0F172A 0%, #1E3A5F 60%, #123B54 100%)',
              height: '360px', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
              // Isolates the stacked filter/blend-mode layers below into their own composited
              // layer, pre-flattened before the Reveal wrapper's opacity/translateY transition
              // runs — otherwise the browser has to re-blend all 4 layers on every animation
              // frame, which is what made the entrance look jerky.
              isolation: 'isolate', willChange: 'opacity',
            }}>
              {/* Photo — grayscale поверх фірмового градієнта, тонування в гамі hero */}
              <BgFadeImage src="/images/warehouse-quality.webp" style={{
                position: 'absolute', inset: 0,
                backgroundPosition: '22% center', backgroundSize: 'cover', backgroundRepeat: 'no-repeat',
                filter: 'grayscale(1) contrast(1.2) brightness(1.5)',
              }} />
              <div style={{ position: 'absolute', inset: 0, background: '#0F172A', mixBlendMode: 'multiply', opacity: 0.3 }} />
              <div style={{ position: 'absolute', inset: 0, background: '#1E3A5F', mixBlendMode: 'color', opacity: 0.65 }} />
              <div style={{ position: 'absolute', inset: 0, background: '#7DB8E8', mixBlendMode: 'screen', opacity: 0.24 }} />
              <div className="home-warehouse-scrim" style={{
                position: 'absolute', inset: 0,
                background: 'linear-gradient(to top, rgba(8,15,30,0.92) 0%, rgba(8,15,30,0.15) 65%)',
              }} />
              <div className="home-warehouse-content" style={{ position: 'relative', padding: '32px 28px' }}>
                {/* Більший відступ під заголовком: він піднімає рядок вище, і логотип
                    FIXLINE на куртці лишається повністю видимим */}
                <h2 className="home-warehouse-title" style={{ fontSize: '22px', fontWeight: 800, color: '#fff', marginBottom: '30px', lineHeight: 1.2 }}>
                  Власний склад та контроль якості
                </h2>
                <ul className="home-warehouse-list" style={{ listStyle: 'none', padding: 0, margin: '0 0 22px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {[
                    // Цифра з бази (той самий список, що годує стрічку хітів) —
                    // раніше тут висіло «більше 700», яке ніхто не оновлював.
                    `${allProducts.length} товарів постійно в наявності`,
                    'Відповідальне зберігання та дотримання умов виробника',
                    'Контроль якості на кожному етапі',
                    'Швидка комплектація замовлень',
                  ].map(item => (
                    <li key={item} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', fontSize: '14px', color: 'rgba(255,255,255,0.88)', lineHeight: 1.5 }}>
                      <CheckCircle size={17} color="#5EEAD4" strokeWidth={2.5} style={{ flexShrink: 0, marginTop: '2px' }} />
                      {item}
                    </li>
                  ))}
                </ul>
                <Link href="/shop" className="home-warehouse-link" style={{
                  fontSize: '14px', fontWeight: 700, color: '#93C5FD', textDecoration: 'none',
                }}>
                  До магазину →
                </Link>
              </div>
            </div>
            </Reveal>

            {/* Right: Map card — animation starts once it scrolls into view */}
            <Reveal delay={150} y={26} duration={1600} style={{ height: '100%' }}>
              <DeliveryMapCard />
            </Reveal>
          </div>
        </div>
      </section>

      {/* Blog with scroll arrows */}
      <section style={{ background: 'var(--bg-soft)', padding: '48px 0', borderTop: '1px solid var(--border)' }}>
        <div className="page-container">
          <Reveal>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '28px' }}>
              <h2 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                Корисні статті
              </h2>
              <Link href="/blog" style={{ fontSize: '13px', color: '#4880B8', fontWeight: 600, textDecoration: 'none' }}>
                Всі статті →
              </Link>
            </div>
            <BlogCarousel articles={blogArticles} />
          </Reveal>
        </div>
      </section>

      {/* CTA */}
      <section className="home-cta-section" style={{ background: 'radial-gradient(700px 320px at 82% -20%, rgba(94,234,212,0.13), transparent 60%), linear-gradient(160deg, #0F172A 0%, #1E3A5F 60%, #123B54 100%)', padding: '28px 0', textAlign: 'center' }}>
        <div className="page-container">
          <Reveal>
            <h2 style={{ fontSize: '24px', fontWeight: 800, color: '#fff', marginBottom: '10px' }}>
              Готові зробити замовлення?
            </h2>
            <p style={{ fontSize: '14px', color: '#94A3B8', marginBottom: '28px' }}>
              Магазин — без реєстрації. Оптовий каталог — після входу в акаунт.
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <Link href="/shop" className="btn-primary" style={{
                height: '44px', padding: '0 24px', borderRadius: '10px',
                background: '#4880B8', color: '#fff', fontSize: '14px', fontWeight: 700,
                display: 'inline-flex', alignItems: 'center', gap: '7px',
              }}>
                <Store size={15} />До магазину
              </Link>
              <Link href="/login?next=/catalog" style={{
                height: '44px', padding: '0 24px', borderRadius: '10px',
                border: '1px solid rgba(255,255,255,0.12)', color: '#94A3B8',
                fontSize: '14px', fontWeight: 600,
                display: 'inline-flex', alignItems: 'center', gap: '7px', background: 'transparent',
                textDecoration: 'none',
              }}>
                <LayoutGrid size={15} />Оптовий каталог
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      <Footer />
    </>
  );
}

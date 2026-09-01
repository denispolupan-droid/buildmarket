import type { Metadata } from 'next';
import Link from 'next/link';

export const revalidate = 300;

const BASE = 'https://fixline.com.ua';

export const metadata: Metadata = {
  title: 'FIXLINE — профессиональная строительная химия оптом и в розницу',
  description: 'Герметики, монтажные пены, клеи, грунтовки от ведущих брендов. Оптовые цены для дилеров и подрядчиков. Доставка по всей Украине от 1 единицы.',
  keywords: ['будівельна хімія', 'строительная химия', 'герметики', 'монтажна піна', 'монтажная пена', 'клеї', 'клеи', 'ґрунтовки', 'грунтовки', 'строительная химия оптом', 'купити', 'купить', 'Україна', 'Украина'],
  alternates: { canonical: `${BASE}/ru`, languages: { 'uk': BASE, 'ru': `${BASE}/ru`, 'x-default': BASE } },
  openGraph: {
    title: 'FIXLINE — профессиональная строительная химия',
    description: 'Герметики, монтажные пены, клеи, грунтовки. Оптовые цены, доставка по Украине.',
    url: `${BASE}/ru`,
    siteName: 'FIXLINE',
    locale: 'ru_RU',
    type: 'website',
  },
};
import { Truck, Store, LayoutGrid, CheckCircle, PackageCheck, ShoppingCart, Phone, ArrowRight } from 'lucide-react';
import { getPublishedPostsCached } from '../../lib/blog-db';
import { getCategoriesCached, getPreviewProductsCached, getBrandLogosCached, getVisibleBrandLogosCached, getReviewStatsCached, getProductsCached } from '../../lib/supabase';
import { getShowcaseSkusCached } from '../../lib/showcase-server';
import { mergeVisibleBrands } from '../../lib/brands';
import { WHOLESALE_MIN } from '../../lib/site';
import Footer from '../components/Footer';
import HomeSearch from '../components/HomeSearch';
import HeroHitChips from '../components/HeroHitChips';
import HomeCategoryCards from '../components/HomeCategoryCards';
import CategorySection from '../components/CategorySection';
import PromoBanner from '../components/PromoBanner';
import BrandsCarousel from '../components/BrandsCarousel';
import BlogCarousel from '../components/BlogCarousel';
import DeliveryMapCard from '../components/DeliveryMapCard';
import Reveal from '../components/Reveal';
import BgFadeImage from '../components/BgFadeImage';



export default async function HomeRu() {
  const categories = await getCategoriesCached();
  const allSlugs = categories.map(c => c.slug);
  const products = await getPreviewProductsCached(allSlugs, 2);
  const brandLogos = await getBrandLogosCached();
  const visibleBrandLogos = await getVisibleBrandLogosCached();
  const brandTiles = mergeVisibleBrands(visibleBrandLogos);
  const reviewStats = await getReviewStatsCached();

  // Чипы хитов возле поиска — закреплённая витрина магазина + добор is_hit
  // (та же логика, что в украинской версии app/page.tsx)
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

  // Карусель блога: опубликованные статьи из БД (только с обложкой)
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
      // Обкладинка з вшитим заголовком — російський варіант, фолбек на укр
      image: (p.image_ru ?? p.image) as string,
    }));

  const orgLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${BASE}/#organization`,
    name: 'FIXLINE',
    url: BASE,
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
    url: BASE,
    potentialAction: {
      '@type': 'SearchAction',
      target: { '@type': 'EntryPoint', urlTemplate: `${BASE}/shop?q={search_term_string}` },
      'query-input': 'required name=search_term_string',
    },
  };

  const localBusinessLd = {
    '@context': 'https://schema.org',
    '@type': ['LocalBusiness', 'HardwareStore'],
    '@id': `${BASE}/#organization`,
    name: 'FIXLINE',
    description: 'B2B поставщик строительной химии: герметики, монтажные пены, клеи, грунтовки оптом и в розницу.',
    url: BASE,
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

      {/* Hero — узкая фирменная шапка, как на странице блога */}
      <section style={{
        background: 'radial-gradient(900px 460px at 85% -20%, rgba(94,234,212,0.16), transparent 60%), radial-gradient(700px 420px at -5% 120%, rgba(72,128,184,0.32), transparent 60%), linear-gradient(160deg, #0F172A 0%, #1E3A5F 60%, #123B54 100%)',
        padding: '56px 0 52px',
      }}>
        <div className="page-container">
          <div className="home-hero-grid" style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '48px', alignItems: 'center' }}>
            <Reveal>
              <span className="eyebrow on-dark">Цифровая платформа строительных решений</span>
              <h1 style={{ fontSize: 'clamp(28px, 3.8vw, 44px)', fontWeight: 900, color: '#fff', lineHeight: 1.18, margin: '14px 0 16px', letterSpacing: '-0.8px', maxWidth: '760px' }}>
                Строительная химия <span className="grad-text">оптом и в розницу</span>
              </h1>
              <p style={{ fontSize: '16px', color: '#94A3B8', lineHeight: 1.7, margin: 0, maxWidth: '620px' }}>
                Герметики, монтажные пены, клеи и грунтовки от ведущих брендов.
                Отправка в день заказа: Новая Почта или точки выдачи ROZETKA по всей Украине.
              </p>
            </Reveal>
            <Reveal delay={110}>
              <div className="home-hero-ctas">
                <Link href="/ru/shop" className="hero-cta-btn" style={{
                  height: '46px', padding: '0 26px', borderRadius: '11px',
                  background: 'var(--brand-blue)', color: '#fff', fontSize: '14px', fontWeight: 700,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                  textDecoration: 'none', boxShadow: 'var(--brand-shadow)',
                }}>
                  В магазин <ArrowRight size={15} />
                </Link>
                <Link href="/register" className="hero-cta-btn" style={{
                  height: '46px', padding: '0 22px', borderRadius: '11px',
                  border: '1.5px solid rgba(255,255,255,0.2)', color: '#E2E8F0',
                  fontSize: '14px', fontWeight: 600,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                  textDecoration: 'none', background: 'rgba(255,255,255,0.04)',
                }}>
                  Стать партнёром
                </Link>
              </div>
            </Reveal>
          </div>

        </div>
      </section>

      {/* Поиск + популярные категории — первый экран под hero */}
      <section style={{ background: 'var(--bg-soft)', padding: '14px 0 40px' }}>
        <div className="page-container">
          {/* zIndex: transform от Reveal создаёт stacking context — без него
              выпадашка поиска оказалась бы ПОД карточками категорий */}
          <Reveal style={{ position: 'relative', zIndex: 50 }}>
            <div className="home-search-bar">
              <HomeSearch lang="ru" />
              <HeroHitChips products={heroHits} lang="ru" />
            </div>
          </Reveal>
          <HomeCategoryCards categories={categories} lang="ru" />
        </div>
      </section>

      {/* Brands auto-scroll carousel — right after hero */}
      <BrandsCarousel logos={brandLogos} brands={brandTiles} />

      {/* Categories carousel + interactive preview */}
      {categories.length > 0 && (
        <section className="home-category-section" style={{ background: 'var(--bg-soft)', padding: '20px 0 44px', borderTop: '1px solid var(--border)' }}>
          <div className="page-container">
            <Reveal>
              <h2 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)', textAlign: 'center', marginBottom: '6px' }}>
                Быстрый просмотр товаров
              </h2>
              <p style={{ fontSize: '14px', color: 'var(--text-secondary)', textAlign: 'center', marginBottom: '32px' }}>
                Выберите категорию слева — и посмотрите товары с ценами, не покидая главную
              </p>
            </Reveal>
            <Reveal delay={80}>
              <CategorySection categories={categories} products={products} reviewStats={reviewStats} />
            </Reveal>
          </div>
        </section>
      )}

      {/* Three paths — умови співпраці. Секція на фірмовій підкладці (tint
          бренду), щоб виділятись серед сусідніх блоків на --bg-soft. */}
      <section className="home-paths-section">
        <div className="page-container">
          <Reveal>
            <p className="home-paths-eyebrow">Условия сотрудничества</p>
            <h2 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', textAlign: 'center', marginBottom: '8px' }}>
              Выберите удобный формат сотрудничества
            </h2>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', textAlign: 'center', marginBottom: '32px' }}>
              Розница от 1 штуки, опт от {WHOLESALE_MIN.toLocaleString('uk-UA')} ₴, дропшиппинг без склада
            </p>
          </Reveal>
          <div className="home-paths-grid">

            {[
              {
                icon: Store, color: '#4880B8', title: 'Магазин',
                text: 'Для частных покупателей. Покупайте от 1 единицы по привлекательным ценам. Регистрация необязательна.',
                items: ['От 1 штуки', 'Лучшие цены', 'Без регистрации', 'Доставка по Украине'],
                href: '/ru/shop', cta: 'Перейти в магазин',
              },
              {
                icon: LayoutGrid, color: '#7B8CC8', title: 'Оптовый каталог',
                text: 'Для дилеров, подрядчиков и магазинов. Оптовые цены и персональные условия для вашего бизнеса.',
                items: ['Оптовые цены', 'Персональные тарифы', 'Табличный каталог', 'Счета-фактуры'],
                // Веде на /opt, а не одразу в /login?next=/catalog: людина, яка ще
                // не знає умов, потрапляла прямо на форму входу. Тепер спершу
                // сторінка з умовами, а вхід і реєстрація — кнопками на ній
                // (як у картці дропшипінгу, рішення власника).
                href: '/ru/opt', cta: 'Узнать больше',
              },
              {
                icon: PackageCheck, color: '#35809E', title: 'Дропшиппинг',
                text: 'Для онлайн-продавцов. Продавайте наши товары без склада — мы отправляем напрямую вашим клиентам.',
                items: ['Без собственного склада', 'Актуальный XML/YML прайс', 'Простая передача заказов', 'Персональные цены'],
                href: '/ru/dropship', cta: 'Узнать больше',
              },
            ].map(({ icon: Icon, color, title, text, items, href, cta }, i) => (
              <Reveal key={title} delay={i * 120} style={{ height: '100%' }}>
                <div className="home-path-card" style={{
                  height: '100%',
                  background: 'var(--bg-card)',
                  border: `1px solid color-mix(in srgb, ${color} 28%, var(--border))`,
                  borderRadius: '16px', overflow: 'hidden',
                  display: 'flex', flexDirection: 'column',
                  boxShadow: '0 4px 16px rgba(15,23,42,0.08)',
                }}>
                  {/* Шапка насиченіша (18% на білому), бо секція сама на синій підкладці —
                      інакше шапка зливається з фоном секції */}
                  <div style={{
                    height: '96px', flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: `color-mix(in srgb, ${color} 16%, var(--bg-card))`,
                    borderBottom: `1px solid color-mix(in srgb, ${color} 16%, transparent)`,
                  }}>
                    <span style={{
                      width: '54px', height: '54px', borderRadius: '15px',
                      background: color, color: '#fff',
                      boxShadow: `0 6px 16px color-mix(in srgb, ${color} 35%, transparent)`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }} aria-hidden>
                      <Icon size={26} strokeWidth={1.75} />
                    </span>
                  </div>
                  <div style={{ padding: '18px 22px 22px', display: 'flex', flexDirection: 'column', gap: '12px', flex: 1 }}>
                    <h3 style={{ fontSize: '17px', fontWeight: 800, color: 'var(--text-primary)', margin: 0, minWidth: 0, overflowWrap: 'break-word' }}>{title}</h3>
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
                    <Link href={href} className="btn-lift" style={{
                      marginTop: 'auto', height: '40px', borderRadius: '10px',
                      background: color, color: '#fff', fontSize: '13px', fontWeight: 700,
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                      textDecoration: 'none',
                    }}>
                      <Icon size={14} />{cta}
                    </Link>
                  </div>
                </div>
              </Reveal>
            ))}

          </div>
        </div>
      </section>

      {/* Warehouse + Map section */}
      <section style={{ background: 'var(--bg-card)', padding: '60px 0', borderTop: '1px solid var(--border)' }}>
        <div className="page-container">
          <Reveal>
            <h2 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', textAlign: 'center', marginBottom: '8px' }}>
              Склад и доставка
            </h2>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', textAlign: 'center', marginBottom: '32px' }}>
              Собственные складские мощности и сеть доставки по всей Украине
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
              borderRadius: '16px',
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
                  Собственный склад и контроль качества
                </h2>
                <ul className="home-warehouse-list" style={{ listStyle: 'none', padding: 0, margin: '0 0 22px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {[
                    // Цифра з бази (той самий список, що годує стрічку хітів) —
                    // раніше тут висіло «більше 700», яке ніхто не оновлював.
                    // Без «постійно»: число живе від залишків постачальника і
                    // змінюється щодня, тож обіцянка сталості була б неправдою.
                    `${allProducts.length} товаров в наличии`,
                    'Ответственное хранение и соблюдение условий производителя',
                    'Контроль качества на каждом этапе',
                    'Быстрая комплектация заказов',
                  ].map(item => (
                    <li key={item} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', fontSize: '14px', color: 'rgba(255,255,255,0.88)', lineHeight: 1.5 }}>
                      <CheckCircle size={17} color="#5EEAD4" strokeWidth={2.5} style={{ flexShrink: 0, marginTop: '2px' }} />
                      {item}
                    </li>
                  ))}
                </ul>
                <Link href="/ru/shop" className="home-warehouse-link" style={{
                  fontSize: '14px', fontWeight: 700, color: '#93C5FD', textDecoration: 'none',
                }}>
                  В магазин →
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

      {/* Як ми працюємо */}
      <section style={{ background: 'var(--bg-soft)', padding: '56px 0', borderTop: '1px solid var(--border)' }}>
        <div className="page-container">
          <Reveal>
            <h2 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', textAlign: 'center', marginBottom: '8px' }}>
              Как мы работаем
            </h2>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', textAlign: 'center', marginBottom: '40px' }}>
              Прозрачная и простая схема от заказа до доставки
            </p>
          </Reveal>
          <div className="how-we-work-grid" style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
            gap: '16px',
          }}>
            {[
              { icon: ShoppingCart, title: 'Оформите заказ',         text: 'Добавьте товары в корзину или отправьте запрос менеджеру — как удобно', color: '#7B8CC8' },
              { icon: Phone,        title: 'Подтверждение',          text: 'Менеджер свяжется, согласует оплату и детали отправки',        color: '#4880B8' },
              { icon: PackageCheck, title: 'Комплектация заказа',    text: 'Собираем заказ и передаём перевозчику', color: '#35809E' },
              { icon: Truck,        title: 'Получение',              text: 'Новая Почта или точка выдачи ROZETKA — в любом городе Украины', color: '#C06A45' },
            ].map(({ icon: Icon, title, text, color }, i) => (
              <Reveal key={title} delay={i * 110} style={{ height: '100%' }}>
                <div className="home-step-card" style={{
                  height: '100%',
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  borderRadius: '16px', overflow: 'hidden',
                  display: 'flex', flexDirection: 'column',
                  boxShadow: '0 2px 12px rgba(0,0,0,0.07)',
                }}>
                  <div style={{
                    position: 'relative', overflow: 'hidden',
                    height: '96px', flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: `color-mix(in srgb, ${color} 16%, var(--bg-card))`,
                  }}>
                    <span aria-hidden style={{
                      position: 'absolute', right: '16px', top: '50%', transform: 'translateY(-52%)',
                      fontSize: '72px', fontWeight: 800, lineHeight: 1,
                      color: `color-mix(in srgb, ${color} 24%, transparent)`,
                      userSelect: 'none',
                    }}>{i + 1}</span>
                    <span style={{
                      position: 'relative', width: '54px', height: '54px', borderRadius: '15px',
                      background: `color-mix(in srgb, ${color} 18%, transparent)`, color,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }} aria-hidden>
                      <Icon size={27} strokeWidth={1.75} />
                    </span>
                  </div>
                  <div style={{ padding: '16px 20px 18px', display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
                    <h3 style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)', margin: 0, lineHeight: 1.3 }}>{title}</h3>
                    <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>{text}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>


      {/* CTA */}
      <section className="home-cta-section" style={{ background: 'var(--bg-soft)', padding: '0 0 52px' }}>
        <div className="page-container">
          <Reveal>
            <div style={{
              background: 'color-mix(in srgb, var(--brand-teal) 8%, var(--bg-card))',
              border: '1px solid color-mix(in srgb, var(--brand-teal) 28%, var(--border))',
              borderRadius: '16px',
              boxShadow: '0 2px 12px rgba(0,0,0,0.05)',
              padding: '28px 32px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              gap: '20px', flexWrap: 'wrap',
            }}>
              <div>
                <h2 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 6px' }}>
                  Готовы сделать заказ?
                </h2>
                <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: 0 }}>
                  Магазин — без регистрации. Оптовый каталог — после входа в аккаунт.
                </p>
              </div>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <Link href="/ru/shop" className="btn-primary" style={{
                  height: '44px', padding: '0 24px', borderRadius: '10px',
                  background: '#4880B8', color: '#fff', fontSize: '14px', fontWeight: 700,
                  display: 'inline-flex', alignItems: 'center', gap: '7px',
                }}>
                  <Store size={15} />В магазин
                </Link>
                <Link href="/ru/login?next=/catalog" className="btn-lift" style={{
                  height: '44px', padding: '0 24px', borderRadius: '10px',
                  border: '1.5px solid var(--border)', color: 'var(--text-secondary)',
                  fontSize: '14px', fontWeight: 600,
                  display: 'inline-flex', alignItems: 'center', gap: '7px', background: 'var(--bg-card)',
                  textDecoration: 'none',
                }}>
                  <LayoutGrid size={15} />Оптовый каталог
                </Link>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Blog with scroll arrows */}
      <section style={{ background: 'var(--bg-card)', padding: '48px 0', borderTop: '1px solid var(--border)' }}>
        <div className="page-container">
          <Reveal>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '28px' }}>
              <h2 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                Полезные статьи
              </h2>
              <Link href="/ru/blog" style={{ fontSize: '13px', color: '#4880B8', fontWeight: 600, textDecoration: 'none' }}>
                Все статьи →
              </Link>
            </div>
            <BlogCarousel articles={blogArticles} />
          </Reveal>
        </div>
      </section>

      <Footer />
    </>
  );
}

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
import { ShieldCheck, Truck, Store, LayoutGrid, CheckCircle, MessageCircle, Tag, PackageCheck, ShoppingCart, Phone, Package, ArrowRight } from 'lucide-react';
import { getCategoriesCached, getPreviewProductsCached, getBrandLogosCached } from '../lib/supabase';
import Footer from './components/Footer';
import CategorySection from './components/CategorySection';
import PromoBanner from './components/PromoBanner';
import BrandsCarousel from './components/BrandsCarousel';
import BlogCarousel from './components/BlogCarousel';
import DeliveryMapCard from './components/DeliveryMapCard';
import Reveal from './components/Reveal';
import AnimatedNumber from './components/AnimatedNumber';
import BgFadeImage from './components/BgFadeImage';
import { ARTICLES } from '../lib/blog';


export default async function Home() {
  const categories = await getCategoriesCached();
  const allSlugs = categories.map(c => c.slug);
  const products = await getPreviewProductsCached(allSlugs, 2);
  const brandLogos = await getBrandLogosCached();

  const orgLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
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
    name: 'FIXLINE',
    description: 'B2B постачальник будівельної хімії: герметики, монтажні піни, клеї, ґрунтовки оптом і в роздріб.',
    url: 'https://fixline.com.ua',
    logo: 'https://fixline.com.ua/fixline-logo.png',
    image: 'https://fixline.com.ua/fixline-logo.png',
    telephone: '+380991997788',
    email: 'info@fixline.com.ua',
    address: {
      '@type': 'PostalAddress',
      streetAddress: 'Площа Свободи',
      addressLocality: 'Харків',
      addressRegion: 'Харківська область',
      postalCode: '61000',
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
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(orgLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(localBusinessLd) }} />
      <PromoBanner />

      {/* Hero */}
      <section style={{ position: 'relative', overflow: 'hidden', minHeight: '560px', display: 'flex', flexDirection: 'column' }}>
        {/* Warehouse / wholesale background — shifted to the left third of the frame so more of its
            own dark panel sits under the headline instead of the busy shelving */}
        <BgFadeImage src="/images/warehouse-hero.webp" style={{
          position: 'absolute', inset: 0,
          backgroundPosition: '25% center', backgroundSize: 'cover', backgroundRepeat: 'no-repeat',
          filter: 'grayscale(1) contrast(1.3) brightness(1.1)',
        }} />
        {/* Duotone — shadows tinted brand navy (multiply), highlights tinted soft blue (screen),
            so the photo reads as one piece with the site instead of a desaturated stock shot.
            Both layers run at partial opacity so the photo keeps real contrast instead of flattening into haze. */}
        <div style={{ position: 'absolute', inset: 0, background: '#14243F', mixBlendMode: 'multiply', opacity: 0.55 }} />
        <div style={{ position: 'absolute', inset: 0, background: '#8FC3F0', mixBlendMode: 'screen', opacity: 0.22 }} />
        {/* Gradient overlay — deepened so the text stays legible regardless of what part of the photo lands underneath */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(100deg, rgba(8,15,30,0.66) 0%, rgba(12,24,52,0.4) 38%, rgba(12,24,52,0.15) 62%, transparent 90%)',
        }} />
        {/* Bottom scrim — the left/right gradient above fades out before the right edge, so the benefits bar needs its own contrast strip regardless of what's behind it (bright concrete floor on the right otherwise washes the text out) */}
        <div style={{
          position: 'absolute', left: 0, right: 0, bottom: 0, height: '170px',
          background: 'linear-gradient(to top, rgba(6,12,26,0.96) 0%, rgba(6,12,26,0.8) 45%, rgba(6,12,26,0) 100%)',
        }} />

        {/* Main content */}
        <div className="page-container hero-content" style={{ position: 'relative', zIndex: 1, flex: 1 }}>

          {/* Text block constrained to left column so warehouse photo shows on right */}
          <div style={{ maxWidth: '560px' }}>
            <h1 style={{
              fontSize: 'clamp(30px, 4vw, 54px)', fontWeight: 900,
              lineHeight: 1.1, marginBottom: '16px',
              letterSpacing: '-0.5px',
              background: 'linear-gradient(135deg, #ffffff 0%, #93C5FD 60%, #5EEAD4 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}>
              Професійна будівельна хімія для бізнесу
            </h1>

            <p style={{
              fontSize: '17px', color: 'rgba(255,255,255,0.6)',
              marginBottom: '28px', lineHeight: 1.55, maxWidth: '480px',
            }}>
              Герметики, піни, клеї та ґрунтовки оптом і в роздріб.
            </p>

            {/* Stat chips with icons — numbers count up on load */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '32px' }}>
              {[
                { icon: Package, value: 700, label: 'SKU' },
                { icon: Tag,     value: 40,  label: 'брендів' },
              ].map(({ icon: Icon, value, label }) => (
                <span key={label} style={{
                  display: 'inline-flex', alignItems: 'center', gap: '7px',
                  padding: '7px 16px', borderRadius: '999px',
                  background: 'rgba(255,255,255,0.07)',
                  border: '1px solid rgba(255,255,255,0.13)',
                  whiteSpace: 'nowrap',
                }}>
                  <Icon size={14} strokeWidth={2} color="#93C5FD" />
                  <span style={{ fontSize: '17px', fontWeight: 800, color: '#93C5FD', lineHeight: 1 }}>
                    <AnimatedNumber value={value} suffix="+" duration={1300} />
                  </span>
                  <span style={{ fontSize: '13px', fontWeight: 500, color: 'rgba(255,255,255,0.7)' }}>{label}</span>
                </span>
              ))}
            </div>

            {/* CTA buttons */}
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <Link href="/shop" style={{
                height: '50px', padding: '0 30px', borderRadius: '12px',
                background: '#4880B8', color: '#fff', fontSize: '15px', fontWeight: 700,
                display: 'inline-flex', alignItems: 'center', gap: '8px',
                textDecoration: 'none', boxShadow: '0 4px 20px rgba(72,128,184,0.4)',
              }}>
                До магазину <ArrowRight size={16} strokeWidth={2.5} />
              </Link>
              <Link href="/register" style={{
                height: '50px', padding: '0 28px', borderRadius: '12px',
                background: 'rgba(255,255,255,0.07)',
                border: '1px solid rgba(255,255,255,0.2)',
                color: '#fff', fontSize: '15px', fontWeight: 600,
                display: 'inline-flex', alignItems: 'center', gap: '8px',
                textDecoration: 'none',
              }}>
                Стати партнером
              </Link>
            </div>
          </div>

          {/* Benefits bar — full width, pinned to bottom of hero */}
          <div className="hero-benefits-grid" style={{ borderTop: '1px solid rgba(255,255,255,0.08)', marginTop: '48px', paddingTop: 0 }}>
            {[
              { icon: ShieldCheck,   title: 'Прямі поставки',          text: 'Своєчасно та без затримок' },
              { icon: Tag,           title: 'Вигідні ціни',            text: 'Конкурентні тарифи для партнерів' },
              { icon: Truck,         title: 'Доставка по всій Україні',text: 'Нова Пошта та власна логістика' },
              { icon: MessageCircle, title: 'Персональний менеджер',   text: 'Підтримка та консультації' },
            ].map(({ icon: Icon, title, text }, i) => (
              <div key={title} style={{
                display: 'flex', alignItems: 'center', gap: '12px',
                padding: '20px 24px',
                borderLeft: i > 0 ? '1px solid rgba(255,255,255,0.08)' : 'none',
              }}>
                <Icon size={22} color="#7DB8E8" strokeWidth={1.75} style={{ flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#F1F5F9', marginBottom: '2px' }}>{title}</div>
                  <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.58)', lineHeight: 1.4 }}>{text}</div>
                </div>
              </div>
            ))}
          </div>

        </div>

        {/* Mobile scroll hint */}
        <div className="hero-scroll-hint">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </div>

      </section>

      {/* Brands auto-scroll carousel — right after hero */}
      <BrandsCarousel logos={brandLogos} />

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
              { icon: Truck,        title: 'Доставка Новою Поштою',   text: 'Отримайте замовлення у будь-якому відділенні України',           color: '#D97706' },
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
                    <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.25 }}>
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
                href: '/login?next=/catalog', cta: 'Оптовий каталог',
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
                    <h3 style={{ fontSize: '17px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>{title}</h3>
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
                Категорії продукції
              </h2>
              <p style={{ fontSize: '14px', color: 'var(--text-secondary)', textAlign: 'center', marginBottom: '32px' }}>
                Оберіть категорію для швидкого доступу до магазину або оптового каталогу
              </p>
            </Reveal>
            <Reveal delay={80}>
              <CategorySection categories={categories} products={products} />
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
            <div style={{
              position: 'relative', overflow: 'hidden',
              borderTop: '3px solid #4880B8', borderRadius: '2px 2px 18px 18px',
              height: '440px', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
              // Isolates the stacked filter/blend-mode layers below into their own composited
              // layer, pre-flattened before the Reveal wrapper's opacity/translateY transition
              // runs — otherwise the browser has to re-blend all 4 layers on every animation
              // frame, which is what made the entrance look jerky.
              isolation: 'isolate', willChange: 'opacity',
            }}>
              {/* Photo — same duotone treatment as the hero background, so both photo cards read as one family */}
              <BgFadeImage src="/images/warehouse-quality.webp" style={{
                position: 'absolute', inset: 0,
                backgroundPosition: 'center', backgroundSize: 'cover', backgroundRepeat: 'no-repeat',
                filter: 'grayscale(1) contrast(1.25) brightness(1.3)',
              }} />
              <div style={{ position: 'absolute', inset: 0, background: '#14243F', mixBlendMode: 'multiply', opacity: 0.35 }} />
              {/* Color tint — paints the same navy hue as the map's background across the whole photo without touching brightness/contrast */}
              <div style={{ position: 'absolute', inset: 0, background: '#1E4D8C', mixBlendMode: 'color', opacity: 0.7 }} />
              <div style={{ position: 'absolute', inset: 0, background: '#8FC3F0', mixBlendMode: 'screen', opacity: 0.22 }} />
              <div style={{
                position: 'absolute', inset: 0,
                background: 'linear-gradient(to top, rgba(8,15,30,0.92) 0%, rgba(8,15,30,0.15) 65%)',
              }} />
              <div style={{ position: 'relative', padding: '32px 28px' }}>
                <h2 style={{ fontSize: '22px', fontWeight: 800, color: '#fff', marginBottom: '16px', lineHeight: 1.2 }}>
                  Власний склад та контроль якості
                </h2>
                <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 22px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {[
                    'Більше 700 товарів постійно в наявності',
                    'Відповідальне зберігання та дотримання умов виробника',
                    'Контроль якості на кожному етапі',
                    'Швидка комплектація замовлень',
                  ].map(item => (
                    <li key={item} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', fontSize: '14px', color: 'rgba(255,255,255,0.88)', lineHeight: 1.5 }}>
                      <CheckCircle size={17} color="#3DBFB8" strokeWidth={2.5} style={{ flexShrink: 0, marginTop: '2px' }} />
                      {item}
                    </li>
                  ))}
                </ul>
                <Link href="/shop" style={{
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
            <BlogCarousel articles={ARTICLES} />
          </Reveal>
        </div>
      </section>

      {/* CTA */}
      <section className="home-cta-section" style={{ background: '#1E3059', padding: '28px 0', textAlign: 'center' }}>
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

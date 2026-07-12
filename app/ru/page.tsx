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
import { ShieldCheck, Truck, Store, LayoutGrid, CheckCircle, MessageCircle, Tag, PackageCheck, ShoppingCart, Phone, Package, ArrowRight } from 'lucide-react';
import { getCategoriesCached, getPreviewProductsCached, getBrandLogosCached, getVisibleBrandLogosCached, getReviewStatsCached } from '../../lib/supabase';
import { mergeVisibleBrands } from '../../lib/brands';
import Footer from '../components/Footer';
import CategorySection from '../components/CategorySection';
import PromoBanner from '../components/PromoBanner';
import BrandsCarousel from '../components/BrandsCarousel';
import BlogCarousel from '../components/BlogCarousel';
import DeliveryMapCard from '../components/DeliveryMapCard';
import Reveal from '../components/Reveal';
import AnimatedNumber from '../components/AnimatedNumber';
import BgFadeImage from '../components/BgFadeImage';
import { ARTICLES } from '../../lib/blog';


export default async function HomeRu() {
  const categories = await getCategoriesCached();
  const allSlugs = categories.map(c => c.slug);
  const products = await getPreviewProductsCached(allSlugs, 2);
  const brandLogos = await getBrandLogosCached();
  const visibleBrandLogos = await getVisibleBrandLogosCached();
  const brandTiles = mergeVisibleBrands(visibleBrandLogos);
  const reviewStats = await getReviewStatsCached();

  const orgLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
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
    name: 'FIXLINE',
    description: 'B2B поставщик строительной химии: герметики, монтажные пены, клеи, грунтовки оптом и в розницу.',
    url: BASE,
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
        <BgFadeImage src="/images/warehouse-hero.webp" style={{
          position: 'absolute', inset: 0,
          backgroundPosition: '25% center', backgroundSize: 'cover', backgroundRepeat: 'no-repeat',
          filter: 'grayscale(1) contrast(1.3) brightness(1.1)',
        }} />
        <div style={{ position: 'absolute', inset: 0, background: '#14243F', mixBlendMode: 'multiply', opacity: 0.55 }} />
        <div style={{ position: 'absolute', inset: 0, background: '#8FC3F0', mixBlendMode: 'screen', opacity: 0.22 }} />
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(100deg, rgba(8,15,30,0.66) 0%, rgba(12,24,52,0.4) 38%, rgba(12,24,52,0.15) 62%, transparent 90%)',
        }} />
        <div style={{
          position: 'absolute', left: 0, right: 0, bottom: 0, height: '170px',
          background: 'linear-gradient(to top, rgba(6,12,26,0.96) 0%, rgba(6,12,26,0.8) 45%, rgba(6,12,26,0) 100%)',
        }} />

        <div className="page-container hero-content" style={{ position: 'relative', zIndex: 1, flex: 1 }}>

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
              Профессиональная строительная химия для бизнеса
            </h1>

            <p style={{
              fontSize: '17px', color: 'rgba(255,255,255,0.6)',
              marginBottom: '28px', lineHeight: 1.55, maxWidth: '480px',
            }}>
              Герметики, пены, клеи и грунтовки оптом и в розницу.
            </p>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '32px' }}>
              {[
                { icon: Package, value: 700, label: 'SKU' },
                { icon: Tag,     value: 40,  label: 'брендов' },
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

            <div className="hero-cta-row" style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <Link href="/ru/shop" className="hero-cta-btn" style={{
                height: '50px', padding: '0 30px', borderRadius: '12px',
                background: '#4880B8', color: '#fff', fontSize: '15px', fontWeight: 700,
                display: 'inline-flex', alignItems: 'center', gap: '8px',
                textDecoration: 'none', boxShadow: '0 4px 20px rgba(72,128,184,0.4)',
              }}>
                В магазин <ArrowRight size={16} strokeWidth={2.5} />
              </Link>
              <Link href="/register" className="hero-cta-btn" style={{
                height: '50px', padding: '0 28px', borderRadius: '12px',
                background: 'rgba(255,255,255,0.07)',
                border: '1px solid rgba(255,255,255,0.2)',
                color: '#fff', fontSize: '15px', fontWeight: 600,
                display: 'inline-flex', alignItems: 'center', gap: '8px',
                textDecoration: 'none',
              }}>
                Стать партнёром
              </Link>
            </div>
          </div>

          <div className="hero-benefits-grid" style={{ borderTop: '1px solid rgba(255,255,255,0.08)', marginTop: '48px', paddingTop: 0 }}>
            {[
              { icon: ShieldCheck,   title: 'Прямые поставки',           text: 'Своевременно и без задержек' },
              { icon: Tag,           title: 'Выгодные цены',             text: 'Конкурентные тарифы для партнёров' },
              { icon: Truck,         title: 'Доставка по всей Украине',  text: 'Новая Почта и собственная логистика' },
              { icon: MessageCircle, title: 'Персональный менеджер',     text: 'Поддержка и консультации' },
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

        <div className="hero-scroll-hint">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </div>

      </section>

      {/* Brands auto-scroll carousel — right after hero */}
      <BrandsCarousel logos={brandLogos} brands={brandTiles} />

      {/* Как мы работаем */}
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
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '16px',
          }}>
            {[
              { icon: Store,        title: 'Магазин или Опт',        text: 'Выбирайте формат: розница от 1 шт или оптовые условия для бизнеса', color: '#6366F1' },
              { icon: ShoppingCart, title: 'Оформите заказ',          text: 'Добавьте товары в корзину или отправьте запрос менеджеру',            color: '#4880B8' },
              { icon: Phone,        title: 'Подтверждение',           text: 'Менеджер подтвердит заказ и согласует детали',                        color: '#0891B2' },
              { icon: Truck,        title: 'Доставка Новой Почтой',   text: 'Получите заказ в любом отделении Украины',                            color: '#D97706' },
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


      {/* Три формата */}
      <section style={{ background: 'var(--bg-card)', padding: '48px 0' }}>
        <div className="page-container">
          <Reveal>
            <h2 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', textAlign: 'center', marginBottom: '8px' }}>
              Выберите удобный формат сотрудничества
            </h2>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', textAlign: 'center', marginBottom: '32px' }}>
              Розница, опт или дропшиппинг — найдём условия для каждого
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
                icon: LayoutGrid, color: '#6366F1', title: 'Оптовый каталог',
                text: 'Для дилеров, подрядчиков и магазинов. Оптовые цены и персональные условия для вашего бизнеса.',
                items: ['Оптовые цены', 'Персональные тарифы', 'Табличный каталог', 'Счета-фактуры'],
                href: '/ru/login?next=/catalog', cta: 'Оптовый каталог',
              },
              {
                icon: PackageCheck, color: '#0891B2', title: 'Дропшиппинг',
                text: 'Для онлайн-продавцов. Продавайте наши товары без склада — мы отправляем напрямую вашим клиентам.',
                items: ['Без собственного склада', 'Актуальный XML/YML прайс', 'Простая передача заказов', 'Персональные цены'],
                href: '/ru/dropship', cta: 'Узнать больше',
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
                Категории продукции
              </h2>
              <p style={{ fontSize: '14px', color: 'var(--text-secondary)', textAlign: 'center', marginBottom: '32px' }}>
                Выберите категорию для быстрого доступа к магазину или оптовому каталогу
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
            <Reveal y={26} duration={1600} style={{ height: '100%' }}>
            <div className="home-warehouse-card" style={{
              position: 'relative', overflow: 'hidden',
              borderTop: '3px solid #4880B8', borderRadius: '2px 2px 18px 18px',
              height: '440px', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
              isolation: 'isolate', willChange: 'opacity',
            }}>
              <BgFadeImage src="/images/warehouse-quality.webp" style={{
                position: 'absolute', inset: 0,
                backgroundPosition: 'center', backgroundSize: 'cover', backgroundRepeat: 'no-repeat',
                filter: 'grayscale(1) contrast(1.25) brightness(1.3)',
              }} />
              <div style={{ position: 'absolute', inset: 0, background: '#14243F', mixBlendMode: 'multiply', opacity: 0.35 }} />
              <div style={{ position: 'absolute', inset: 0, background: '#1E4D8C', mixBlendMode: 'color', opacity: 0.7 }} />
              <div style={{ position: 'absolute', inset: 0, background: '#8FC3F0', mixBlendMode: 'screen', opacity: 0.22 }} />
              <div className="home-warehouse-scrim" style={{
                position: 'absolute', inset: 0,
                background: 'linear-gradient(to top, rgba(8,15,30,0.92) 0%, rgba(8,15,30,0.15) 65%)',
              }} />
              <div className="home-warehouse-content" style={{ position: 'relative', padding: '32px 28px' }}>
                <h2 className="home-warehouse-title" style={{ fontSize: '22px', fontWeight: 800, color: '#fff', marginBottom: '16px', lineHeight: 1.2 }}>
                  Собственный склад и контроль качества
                </h2>
                <ul className="home-warehouse-list" style={{ listStyle: 'none', padding: 0, margin: '0 0 22px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {[
                    'Более 700 товаров постоянно в наличии',
                    'Ответственное хранение и соблюдение условий производителя',
                    'Контроль качества на каждом этапе',
                    'Быстрая комплектация заказов',
                  ].map(item => (
                    <li key={item} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', fontSize: '14px', color: 'rgba(255,255,255,0.88)', lineHeight: 1.5 }}>
                      <CheckCircle size={17} color="#3DBFB8" strokeWidth={2.5} style={{ flexShrink: 0, marginTop: '2px' }} />
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
                Полезные статьи
              </h2>
              <Link href="/ru/blog" style={{ fontSize: '13px', color: '#4880B8', fontWeight: 600, textDecoration: 'none' }}>
                Все статьи →
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
              Готовы сделать заказ?
            </h2>
            <p style={{ fontSize: '14px', color: '#94A3B8', marginBottom: '28px' }}>
              Магазин — без регистрации. Оптовый каталог — после входа в аккаунт.
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <Link href="/ru/shop" className="btn-primary" style={{
                height: '44px', padding: '0 24px', borderRadius: '10px',
                background: '#4880B8', color: '#fff', fontSize: '14px', fontWeight: 700,
                display: 'inline-flex', alignItems: 'center', gap: '7px',
              }}>
                <Store size={15} />В магазин
              </Link>
              <Link href="/ru/login?next=/catalog" style={{
                height: '44px', padding: '0 24px', borderRadius: '10px',
                border: '1px solid rgba(255,255,255,0.12)', color: '#94A3B8',
                fontSize: '14px', fontWeight: 600,
                display: 'inline-flex', alignItems: 'center', gap: '7px', background: 'transparent',
                textDecoration: 'none',
              }}>
                <LayoutGrid size={15} />Оптовый каталог
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      <Footer />
    </>
  );
}

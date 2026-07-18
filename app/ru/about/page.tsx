import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import Footer from '../../components/Footer';
import Reveal from '../../components/Reveal';
import { ShieldCheck, Users, Package, Award, Truck, MessageCircle } from 'lucide-react';
import { mergeVisibleBrands } from '../../../lib/brands';
import { getBrandLogosCached, getVisibleBrandLogosCached } from '../../../lib/supabase';

const BASE = 'https://fixline.com.ua';

export const metadata: Metadata = {
  title: 'О компании FIXLINE — поставщик строительной химии',
  description: 'Поставщик строительной химии на Украине: герметики, клеи, монтажные пены, грунтовки от проверенных производителей. 10+ лет на рынке, 500+ клиентов B2B.',
  keywords: ['о компании FIXLINE', 'поставщик строительной химии', 'оптовая строительная химия', 'герметики оптом поставщик', 'Харьков строительная химия'],
  alternates: {
    canonical: `${BASE}/ru/about`,
    languages: { 'uk': `${BASE}/about`, 'ru': `${BASE}/ru/about`, 'x-default': `${BASE}/about` },
  },
  openGraph: {
    title: 'О компании FIXLINE',
    description: 'Официальный поставщик строительной химии на Украине. 10+ лет, 500+ клиентов, 1000+ артикулов.',
    url: `${BASE}/ru/about`,
    siteName: 'FIXLINE',
    locale: 'ru_RU',
    type: 'website',
    images: [{ url: `${BASE}/opengraph-image`, width: 1200, height: 630, alt: 'FIXLINE — строительная химия' }],
  },
};

const stats = [
  { icon: Award,       stat: '10+',   label: 'лет на рынке',          text: 'Надёжный поставщик с подтверждённой репутацией среди дилеров и подрядчиков.' },
  { icon: Users,       stat: '500+',  label: 'активных клиентов',      text: 'B2B партнёры по всей Украине: строительные магазины, подрядчики, дропшиперы.' },
  { icon: Package,     stat: '1000+', label: 'артикулов',              text: 'Широкий ассортимент в наличии на складе с постоянным пополнением.' },
  { icon: ShieldCheck, stat: '100%',  label: 'сертифицированная продукция', text: 'Только оригинальные товары с документами качества и техническими паспортами.' },
];

const values = [
  { icon: ShieldCheck,   title: 'Качество без компромиссов', text: 'Мы работаем только с проверенными производителями и официальными дистрибьюторами. Каждая партия сопровождается документами качества.' },
  { icon: Truck,         title: 'Надёжная логистика',        text: 'Собственная логистика и Новая Почта по всей Украине. Заказы, принятые до 14:00, отправляем в тот же день.' },
  { icon: MessageCircle, title: 'Персональный подход',        text: 'За каждым клиентом закреплён менеджер. Консультируем по выбору материалов и подбору аналогов.' },
  { icon: Package,       title: 'Гибкие условия',            text: 'От 1 единицы в розницу до крупного опта. Индивидуальные цены и условия оплаты для постоянных партнёров.' },
];

export default async function AboutRuPage() {
  const brandLogos = await getBrandLogosCached();
  const visibleBrandLogos = await getVisibleBrandLogosCached();
  const brandTiles = mergeVisibleBrands(visibleBrandLogos);
  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Главная', item: `${BASE}/ru` },
      { '@type': 'ListItem', position: 2, name: 'О компании', item: `${BASE}/ru/about` },
    ],
  };

  const orgLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'FIXLINE',
    url: BASE,
    logo: `${BASE}/fixline-logo.png`,
    description: 'Поставщик строительной химии на Украине: герметики, монтажные пены, клеи, грунтовки оптом и в розницу.',
    address: { '@type': 'PostalAddress', addressLocality: 'Харьков', addressCountry: 'UA' },
    contactPoint: {
      '@type': 'ContactPoint',
      telephone: '+380991997788',
      email: 'info@fixline.com.ua',
      contactType: 'sales',
      availableLanguage: ['Ukrainian', 'Russian'],
    },
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd).replace(/</g, '\\u003c') }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(orgLd).replace(/</g, '\\u003c') }} />

      <div style={{ background: 'var(--bg-soft)', minHeight: '100vh' }}>

        {/* Hero */}
        <section style={{ background: 'linear-gradient(160deg, #1E293B 0%, #1E3A5F 100%)', padding: '64px 0 56px' }}>
          <div className="page-container">
            <nav style={{ fontSize: '13px', color: '#64748B', marginBottom: '24px', display: 'flex', gap: '6px', alignItems: 'center' }}>
              <Link href="/ru" style={{ color: '#64748B', textDecoration: 'none' }}>Главная</Link>
              <span>/</span>
              <span style={{ color: '#94A3B8' }}>О компании</span>
            </nav>
            <Reveal>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0', marginBottom: '28px', userSelect: 'none' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <span style={{
                  fontSize: 'clamp(40px, 6vw, 72px)', fontWeight: 900, letterSpacing: '-2px', lineHeight: 1,
                  background: 'linear-gradient(135deg, #fff 0%, #93C5FD 100%)',
                  WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
                }}>FIX</span>
                <span style={{ fontSize: '11px', fontWeight: 600, color: '#4880B8', letterSpacing: '0.15em', textTransform: 'uppercase', marginTop: '4px' }}>
                  фиксация
                </span>
              </div>
              <span style={{ fontSize: 'clamp(40px, 6vw, 72px)', fontWeight: 900, color: 'rgba(255,255,255,0.15)', margin: '0 2px', lineHeight: 1, alignSelf: 'flex-start', paddingTop: '2px' }}>+</span>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <span style={{
                  fontSize: 'clamp(40px, 6vw, 72px)', fontWeight: 900, letterSpacing: '-2px', lineHeight: 1,
                  background: 'linear-gradient(135deg, #93C5FD 0%, #5EEAD4 100%)',
                  WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
                }}>LINE</span>
                <span style={{ fontSize: '11px', fontWeight: 600, color: '#5EEAD4', letterSpacing: '0.15em', textTransform: 'uppercase', marginTop: '4px' }}>
                  линия
                </span>
              </div>
            </div>
            </Reveal>
            <Reveal delay={100}>
            <h1 style={{ fontSize: 'clamp(20px, 2.5vw, 30px)', fontWeight: 700, color: '#fff', lineHeight: 1.3, marginBottom: '16px', letterSpacing: '-0.3px' }}>
              Линия фиксации — всё для надёжного монтажа
            </h1>
            <p style={{ fontSize: '16px', color: '#94A3B8', lineHeight: 1.7, maxWidth: '580px', margin: 0 }}>
              Герметики, клеи, монтажные пены, грунтовки — материалы, которые фиксируют,
              защищают и держат. От проверенных производителей по конкурентным ценам.
            </p>
            </Reveal>
          </div>
        </section>

        {/* Name story */}
        <section style={{ background: 'var(--bg-soft)', borderBottom: '1px solid var(--border)', padding: '48px 0' }}>
          <div className="page-container">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '48px', alignItems: 'center' }} className="about-content-grid">
              <Reveal><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                {[
                  { word: 'FIX',  color: '#4880B8', bg: 'rgba(72,128,184,0.08)', border: 'rgba(72,128,184,0.2)',  meanings: ['Фиксировать', 'Крепить',      'Склеивать', 'Герметизировать'] },
                  { word: 'LINE', color: '#14B8A6', bg: 'rgba(20,184,166,0.08)',  border: 'rgba(20,184,166,0.2)', meanings: ['Линия',       'Ассортимент', 'Подбор',    'Система'] },
                ].map(({ word, color, bg, border, meanings }) => (
                  <div key={word} style={{ background: bg, border: `1px solid ${border}`, borderRadius: '16px', padding: '24px 20px' }}>
                    <div style={{ fontSize: '36px', fontWeight: 900, color, marginBottom: '16px', letterSpacing: '-1px', lineHeight: 1 }}>{word}</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {meanings.map(m => (
                        <span key={m} style={{ fontSize: '13px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ width: '4px', height: '4px', borderRadius: '50%', background: color, flexShrink: 0 }} />
                          {m}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
                <div style={{ gridColumn: '1 / -1', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '20px 24px', display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div style={{ fontSize: '22px', fontWeight: 900, letterSpacing: '-0.5px', flexShrink: 0 }}>
                    <span style={{ color: '#4880B8' }}>FIX</span><span style={{ color: '#14B8A6' }}>LINE</span>
                  </div>
                  <div style={{ width: '1px', height: '32px', background: 'var(--border)', flexShrink: 0 }} />
                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
                    Линия материалов для фиксации — полный ассортимент того, что крепит, клеит, герметизирует и защищает в строительстве и ремонте.
                  </p>
                </div>
              </div></Reveal>
              <Reveal delay={120}><div>
                <h2 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '16px', lineHeight: 1.3 }}>
                  Название — это концепция
                </h2>
                <div style={{ fontSize: '15px', color: 'var(--text-secondary)', lineHeight: 1.8, display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <p>
                    <strong style={{ color: 'var(--text-primary)' }}>FIX</strong> — от английского &ldquo;fix&rdquo;: фиксировать, крепить, устранять. Это суть строительной химии: клей держит, герметик защищает, пена фиксирует.
                  </p>
                  <p>
                    <strong style={{ color: 'var(--text-primary)' }}>LINE</strong> — линия, ассортимент, система. Не один продукт, а полная линейка материалов для любой задачи на стройплощадке или в ремонте.
                  </p>
                  <p>
                    Вместе <strong style={{ color: 'var(--text-primary)' }}>FIXLINE</strong> — это линия фиксации: всё что нужно, чтобы всё держалось надёжно.
                  </p>
                </div>
              </div></Reveal>
            </div>
          </div>
        </section>

        {/* Stats */}
        <section style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border)' }}>
          <div className="page-container" style={{ padding: '48px 32px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '32px' }} className="about-stats-grid">
              {stats.map(({ icon: Icon, stat, label, text }, i) => (
                <Reveal key={label} delay={i * 90}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                    <Icon size={22} color="#4880B8" strokeWidth={2} />
                  </div>
                  <div style={{ fontSize: '32px', fontWeight: 900, color: 'var(--text-primary)', lineHeight: 1 }}>{stat}</div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', margin: '4px 0 8px' }}>{label}</div>
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>{text}</p>
                </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* About text */}
        <section style={{ padding: '64px 0' }}>
          <div className="page-container">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '64px', alignItems: 'start' }} className="about-content-grid">
              <Reveal><div>
                <h2 style={{ fontSize: '26px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '20px' }}>
                  Кто мы
                </h2>
                <div style={{ fontSize: '15px', color: 'var(--text-secondary)', lineHeight: 1.8, display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <p>
                    FIXLINE — B2B поставщик строительной химии для дилеров, подрядчиков,
                    строительных магазинов и дропшиперов по всей Украине.
                  </p>
                  <p>
                    Мы не производитель — мы связываем клиентов с проверенными производителями и
                    брендами. Наша задача: широкий ассортимент, актуальные цены и быстрая
                    доставка Новой Почтой в любую точку Украины.
                  </p>
                  <p>
                    Работаем как с розничными покупателями от 1 единицы, так и с оптовыми
                    клиентами. Предлагаем гибкие условия и подбор аналогов под бюджет.
                  </p>
                </div>
              </div></Reveal>
              <Reveal delay={120}><div>
                <h2 style={{ fontSize: '26px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '20px' }}>
                  Доставка и логистика
                </h2>
                <div style={{ fontSize: '15px', color: 'var(--text-secondary)', lineHeight: 1.8, display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <p>
                    Отправляем Новой Почтой по всей Украине. Заказы до 14:00 — отправка
                    в тот же день. Широкий ассортимент поддерживается в постоянном наличии.
                  </p>
                  <p>
                    Для крупных оптовых партий — адресная доставка по Харькову и региону,
                    условия обсуждаются с менеджером индивидуально.
                  </p>
                  <p>
                    Дропшиперам предоставляем XML/YML-фид с актуальными остатками и ценами,
                    который обновляется несколько раз в день. Доставляем напрямую клиенту
                    от имени вашего магазина.
                  </p>
                </div>
              </div></Reveal>
            </div>
          </div>
        </section>

        {/* Values */}
        <section style={{ background: 'var(--bg-card)', borderTop: '1px solid var(--border)', padding: '64px 0' }}>
          <div className="page-container">
            <Reveal>
            <h2 style={{ fontSize: '26px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '40px', textAlign: 'center' }}>
              Наши принципы
            </h2>
            </Reveal>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '24px' }} className="about-values-grid">
              {values.map(({ icon: Icon, title, text }, i) => (
                <Reveal key={title} delay={i * 90}>
                <div style={{ background: 'var(--bg-soft)', border: '1px solid var(--border)', borderRadius: '16px', padding: '28px 24px' }}>
                  <div style={{ width: '44px', height: '44px', borderRadius: '10px', background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
                    <Icon size={20} color="#4880B8" strokeWidth={2} />
                  </div>
                  <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '10px' }}>{title}</h3>
                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>{text}</p>
                </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* Brands */}
        <section style={{ padding: '64px 0', borderTop: '1px solid var(--border)' }}>
          <div className="page-container">
            <Reveal>
            <h2 style={{ fontSize: '26px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '8px', textAlign: 'center' }}>
              Бренды, с которыми мы работаем
            </h2>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', textAlign: 'center', marginBottom: '40px' }}>
              Продукция от проверенных производителей строительной химии
            </p>
            </Reveal>
            <Reveal delay={100}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '12px' }} className="brands-grid">
              {brandTiles.map(({ name, logo, href, color, style }) => {
                const logoSrc = brandLogos[name.toUpperCase()] ?? logo;
                return (
                  <Link key={name} href={`/ru${href}`} style={{
                    background: 'var(--bg-card)', border: '1px solid var(--border)',
                    borderRadius: '12px', padding: '12px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    aspectRatio: '3/2', textDecoration: 'none',
                    transition: 'box-shadow 0.2s, transform 0.2s, border-color 0.2s',
                  }} className="about-brand-tile">
                    {logoSrc ? (
                      <Image src={logoSrc} alt={name} width={160} height={80} style={{ objectFit: 'contain', width: '100%', height: '100%' }} />
                    ) : (
                      <span style={{ color, textAlign: 'center', ...style }}>{name}</span>
                    )}
                  </Link>
                );
              })}
            </div>
            </Reveal>
          </div>
        </section>

        {/* CTA */}
        <section style={{ background: '#1E3059', padding: '56px 0', textAlign: 'center' }}>
          <div className="page-container">
            <Reveal>
            <h2 style={{ fontSize: '24px', fontWeight: 800, color: '#fff', marginBottom: '12px' }}>
              Стать партнёром FIXLINE
            </h2>
            <p style={{ fontSize: '14px', color: '#94A3B8', marginBottom: '32px', maxWidth: '480px', margin: '0 auto 32px' }}>
              Дилеры, подрядчики, строительные магазины — регистрируйтесь и получайте
              доступ к оптовым ценам и персональному менеджеру.
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
              <Link href="/register" style={{ height: '48px', padding: '0 28px', borderRadius: '10px', background: '#4880B8', color: '#fff', fontSize: '14px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>
                Зарегистрироваться
              </Link>
              <Link href="/ru/contacts" style={{ height: '48px', padding: '0 28px', borderRadius: '10px', border: '1.5px solid rgba(255,255,255,0.2)', color: '#E2E8F0', fontSize: '14px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', textDecoration: 'none', background: 'transparent' }}>
                Связаться с нами
              </Link>
            </div>
            </Reveal>
          </div>
        </section>

      </div>
      <Footer />
      <style>{`
        .about-brand-tile:hover { box-shadow: 0 6px 20px rgba(0,0,0,0.10); border-color: #93C5FD; transform: translateY(-2px); }
        @media (max-width: 768px) {
          .about-stats-grid  { grid-template-columns: repeat(2, 1fr) !important; }
          .about-values-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .about-content-grid { grid-template-columns: 1fr !important; gap: 32px !important; }
          .brands-grid { grid-template-columns: repeat(3, 1fr) !important; }
        }
        @media (max-width: 480px) {
          .about-stats-grid  { grid-template-columns: 1fr !important; }
          .about-values-grid { grid-template-columns: 1fr !important; }
          .brands-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }
      `}</style>
    </>
  );
}

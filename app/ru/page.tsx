import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { Users, Package, ShieldCheck, Truck, Store, LayoutGrid, CheckCircle, MessageCircle, Award, Tag, PackageCheck } from 'lucide-react';
import { getCategoriesCached } from '../../lib/supabase';
import { getCategoryNameRu } from '../../lib/ru';
import { getCatIcon, getCatColor } from '../../lib/category-visuals';
import Footer from '../components/Footer';
import { ARTICLES } from '../../lib/blog';

const BASE = 'https://fixline.com.ua';

export const revalidate = 300;

export const metadata: Metadata = {
  title: 'FIXLINE — строительная химия оптом и в розницу',
  description: 'Герметики, монтажная пена, клеи, грунтовки от ведущих брендов. Оптовые цены для дилеров и подрядчиков. Доставка по всей Украине от 1 единицы.',
  keywords: ['строительная химия', 'герметики', 'монтажная пена', 'клеи', 'грунтовки', 'строительная химия оптом', 'купить', 'Украина'],
  alternates: {
    canonical: `${BASE}/ru`,
    languages: {
      'uk': BASE,
      'ru': `${BASE}/ru`,
      'x-default': BASE,
    },
  },
  openGraph: {
    title: 'FIXLINE — строительная химия',
    description: 'Герметики, монтажная пена, клеи, грунтовки. Оптовые цены, доставка по Украине.',
    url: `${BASE}/ru`,
    siteName: 'FIXLINE',
    locale: 'ru_RU',
    type: 'website',
  },
};

const trust = [
  {
    icon: Award,
    stat: '10+ лет',
    title: 'на рынке',
    text: 'Надёжный поставщик строительной химии с подтверждённой репутацией.',
  },
  {
    icon: Users,
    stat: '500+',
    title: 'активных клиентов',
    text: 'Дилеры, подрядчики, строительные магазины по всей Украине.',
  },
  {
    icon: Package,
    stat: '1000+',
    title: 'артикулов',
    text: 'Широкий ассортимент в наличии на складе с постоянным пополнением.',
  },
  {
    icon: ShieldCheck,
    stat: '100%',
    title: 'сертифицированная продукция',
    text: 'Оригинальные товары с документами и техническими паспортами.',
  },
];

export default async function RuHomePage() {
  const categories = await getCategoriesCached();
  const parentCats = categories.filter(c => !c.parent_slug);

  return (
    <>
      {/* Hero */}
      <section style={{
        background: 'linear-gradient(160deg, #1E293B 0%, #243F6B 100%)',
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', top: '-120px', right: '-80px',
          width: '500px', height: '500px', borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(14,165,233,0.18) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute', bottom: '-100px', left: '-60px',
          width: '420px', height: '420px', borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(72,128,184,0.2) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />

        <div className="page-container hero-content" style={{ position: 'relative', zIndex: 1 }}>
          <h1 style={{
            fontSize: 'clamp(28px, 4vw, 52px)', fontWeight: 900,
            lineHeight: 1.15, marginBottom: '28px',
            letterSpacing: '-0.5px',
            background: 'linear-gradient(135deg, #ffffff 0%, #93C5FD 60%, #5EEAD4 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}>
            Строительная химия оптом
          </h1>

          <ul className="hero-checklist">
            {[
              'Оригинальная продукция от производителей',
              'Для дилеров, подрядчиков и магазинов',
              'От 1 единицы или крупным оптом',
            ].map(item => (
              <li key={item} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px', color: '#CBD5E1' }}>
                <CheckCircle size={16} color="#4880B8" strokeWidth={2.5} style={{ flexShrink: 0 }} />
                {item}
              </li>
            ))}
          </ul>

          <div className="hero-benefits-grid" style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
            {[
              { icon: ShieldCheck,   title: 'Прямые поставки',           text: 'Своевременно и без задержек' },
              { icon: Tag,           title: 'Выгодные цены',             text: 'Конкурентные тарифы для партнёров' },
              { icon: Truck,         title: 'Доставка по всей Украине',  text: 'Новая Почта и собственная логистика' },
              { icon: MessageCircle, title: 'Персональный менеджер',     text: 'Поддержка и консультации' },
            ].map(({ icon: Icon, title, text }, i) => (
              <div key={title} style={{
                display: 'flex', alignItems: 'center', gap: '12px',
                padding: '0 24px',
                borderLeft: i > 0 ? '1px solid rgba(255,255,255,0.1)' : 'none',
              }}>
                <Icon size={24} color="#4880B8" strokeWidth={1.75} style={{ flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: '15px', fontWeight: 700, color: '#F1F5F9', marginBottom: '3px' }}>{title}</div>
                  <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.4)', lineHeight: 1.4 }}>{text}</div>
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

      {/* Three paths */}
      <section style={{ background: 'var(--bg-card)', padding: '48px 0' }}>
        <div className="page-container">
          <h2 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', textAlign: 'center', marginBottom: '8px' }}>
            Выберите удобный формат сотрудничества
          </h2>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', textAlign: 'center', marginBottom: '32px' }}>
            Розница, опт или дропшиппинг — найдём условия для каждого
          </p>
          <div className="home-paths-grid">

            {/* Retail */}
            <div style={{
              border: '1px solid var(--border)', borderRadius: '16px',
              padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: '14px',
              background: 'var(--bg-soft)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Store size={20} color="var(--text-secondary)" strokeWidth={1.75} />
                </div>
                <h3 style={{ fontSize: '17px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Магазин</h3>
              </div>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
                Для частных покупателей. Покупайте от 1 единицы по привлекательным ценам. Регистрация не обязательна.
              </p>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '5px' }}>
                {['От 1 штуки', 'Лучшие цены', 'Без регистрации', 'Доставка по Украине'].map(item => (
                  <li key={item} style={{ fontSize: '13px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'var(--text-secondary)', flexShrink: 0, opacity: 0.4 }} />
                    {item}
                  </li>
                ))}
              </ul>
              <Link href="/ru/shop" className="btn-primary" style={{
                marginTop: 'auto', height: '40px', borderRadius: '10px',
                background: '#4880B8', color: '#fff', fontSize: '13px', fontWeight: 700,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
              }}>
                <Store size={14} />Перейти в магазин
              </Link>
            </div>

            {/* Wholesale */}
            <div style={{
              border: '1px solid var(--border)', borderRadius: '16px',
              padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: '14px',
              background: 'var(--bg-soft)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <LayoutGrid size={20} color="var(--text-secondary)" strokeWidth={1.75} />
                </div>
                <h3 style={{ fontSize: '17px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Оптовый каталог</h3>
              </div>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
                Для дилеров, подрядчиков и магазинов. Оптовые цены и персональные условия для вашего бизнеса.
              </p>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '5px' }}>
                {['Оптовые цены', 'Персональные тарифы', 'Табличный каталог', 'Счета-фактуры'].map(item => (
                  <li key={item} style={{ fontSize: '13px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'var(--text-secondary)', flexShrink: 0, opacity: 0.4 }} />
                    {item}
                  </li>
                ))}
              </ul>
              <Link href="/ru/login?next=/ru/catalog" style={{
                marginTop: 'auto', height: '40px', borderRadius: '10px',
                background: '#4880B8', color: '#fff', fontSize: '13px', fontWeight: 700,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                textDecoration: 'none',
              }}>
                <LayoutGrid size={14} />Оптовый каталог
              </Link>
            </div>

            {/* Dropship */}
            <div style={{
              border: '1px solid var(--border)', borderRadius: '16px',
              padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: '14px',
              background: 'var(--bg-soft)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <PackageCheck size={20} color="var(--text-secondary)" strokeWidth={1.75} />
                </div>
                <h3 style={{ fontSize: '17px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Дропшиппинг</h3>
              </div>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
                Для онлайн-продавцов. Продавайте наши товары без склада — мы отправляем напрямую вашим клиентам.
              </p>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '5px' }}>
                {['Без собственного склада', 'Актуальный XML/YML прайс', 'Простая передача заказов', 'Персональные цены'].map(item => (
                  <li key={item} style={{ fontSize: '13px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'var(--text-secondary)', flexShrink: 0, opacity: 0.4 }} />
                    {item}
                  </li>
                ))}
              </ul>
              <Link href="/ru/dropship" className="btn-primary" style={{
                marginTop: 'auto', height: '40px', borderRadius: '10px',
                background: '#4880B8', color: '#fff', fontSize: '13px', fontWeight: 700,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
              }}>
                <PackageCheck size={14} />Узнать больше
              </Link>
            </div>

          </div>
        </div>
      </section>

      {/* Categories grid */}
      {parentCats.length > 0 && (
        <section style={{ background: 'var(--bg-soft)', padding: '20px 0 44px', borderTop: '1px solid var(--border)' }}>
          <div className="page-container">
            <h2 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)', textAlign: 'center', marginBottom: '6px' }}>
              Категории продукции
            </h2>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', textAlign: 'center', marginBottom: '32px' }}>
              Выберите категорию для быстрого перехода в магазин
            </p>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
              gap: '12px',
              maxWidth: '1100px',
              margin: '0 auto',
            }}>
              {parentCats.map((cat, i) => {
                const Icon = getCatIcon(cat.slug, i);
                const color = getCatColor(cat.slug, i);
                return (
                  <Link
                    key={cat.slug}
                    href={`/ru/shop/${cat.slug}`}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '12px',
                      padding: '14px 16px', borderRadius: '12px',
                      border: '1px solid var(--border)', background: 'var(--bg-card)',
                      textDecoration: 'none',
                    }}
                  >
                    <div style={{
                      width: '36px', height: '36px', borderRadius: '9px', flexShrink: 0,
                      background: color, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Icon size={17} color="#fff" strokeWidth={1.75} />
                    </div>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.3 }}>
                      {getCategoryNameRu(cat.slug, cat.name)}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* Trust strip */}
      <section className="home-trust-section" style={{ background: 'var(--bg-card)', padding: '24px 0', borderTop: '1px solid var(--border)' }}>
        <div className="page-container">
          <div className="home-trust-grid">
            {trust.map(({ icon: Icon, stat, title, text }) => (
              <div key={title} style={{ textAlign: 'center' }}>
                <div style={{
                  width: '44px', height: '44px', borderRadius: '12px', flexShrink: 0,
                  background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  margin: '0 auto 12px',
                }}>
                  <Icon size={20} color="#4880B8" strokeWidth={2} />
                </div>
                <div style={{ fontSize: '28px', fontWeight: 900, color: 'var(--text-primary)', lineHeight: 1 }}>
                  {stat}
                </div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', margin: '4px 0 6px' }}>
                  {title}
                </div>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Blog */}
      <section style={{ background: 'var(--bg-soft)', padding: '48px 0', borderTop: '1px solid var(--border)' }}>
        <div className="page-container">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '28px' }}>
            <h2 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
              Полезные статьи
            </h2>
            <Link href="/ru/blog" style={{ fontSize: '13px', color: '#4880B8', fontWeight: 600, textDecoration: 'none' }}>
              Все статьи →
            </Link>
          </div>
          <div className="blog-carousel">
            {ARTICLES.slice(0, 3).map(article => (
              <Link key={article.slug} href={`/ru/blog/${article.slug}`} className="blog-carousel__card">
                <div style={{ aspectRatio: '16/9', overflow: 'hidden' }}>
                  <Image src={article.image} alt={article.titleRu ?? article.title} width={600} height={338} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                </div>
                <div style={{ padding: '16px', flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: '#4880B8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {article.category === 'Поради' ? 'Советы' : article.category}
                  </span>
                  <p style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', margin: 0, lineHeight: 1.4 }}>
                    {article.titleRu ?? article.title}
                  </p>
                  <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0, lineHeight: 1.5, flex: 1 }}>
                    {article.descriptionRu ?? article.description}
                  </p>
                  <span style={{ fontSize: '12px', color: '#4880B8', fontWeight: 600, marginTop: '4px' }}>
                    Читать →
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="home-cta-section" style={{ background: '#1E3059', padding: '28px 0', textAlign: 'center' }}>
        <div className="page-container">
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
            <Link href="/ru/login?next=/ru/catalog" style={{
              height: '44px', padding: '0 24px', borderRadius: '10px',
              border: '1px solid rgba(255,255,255,0.12)', color: '#94A3B8',
              fontSize: '14px', fontWeight: 600,
              display: 'inline-flex', alignItems: 'center', gap: '7px', background: 'transparent',
              textDecoration: 'none',
            }}>
              <LayoutGrid size={15} />Оптовый каталог
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </>
  );
}

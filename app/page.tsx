import type { Metadata } from 'next';
import Link from 'next/link';
import fs from 'fs';
import path from 'path';

export const revalidate = 300;

export const metadata: Metadata = {
  title: 'FIXLINE — професійна будівельна хімія оптом та в роздріб',
  description: 'Герметики, монтажні піни, клеї, ґрунтовки від провідних брендів. Оптові ціни для дилерів та підрядників. Доставка по всій Україні.',
  keywords: ['будівельна хімія', 'герметики', 'монтажні піни', 'клеї', 'ґрунтовки', 'опт', 'Україна'],
  alternates: { canonical: 'https://fixline.com.ua' },
  openGraph: {
    title: 'FIXLINE — професійна будівельна хімія',
    description: 'Герметики, монтажні піни, клеї, ґрунтовки. Оптові ціни, доставка по Україні.',
    url: 'https://fixline.com.ua',
    siteName: 'FIXLINE',
    locale: 'uk_UA',
    type: 'website',
  },
};
import { Users, Package, ShieldCheck, Truck, Store, LayoutGrid, CheckCircle, MessageCircle, Award, Tag, PackageCheck } from 'lucide-react';
import { getCategoriesCached, getPreviewProductsCached, getBrandsCached } from '../lib/supabase';
import Footer from './components/Footer';
import CategorySection from './components/CategorySection';
import PromoBanner from './components/PromoBanner';

function getBrandLogoMap(): Record<string, string> {
  try {
    const dir = path.join(process.cwd(), 'public', 'brands');
    const files = fs.readdirSync(dir);
    const map: Record<string, string> = {};
    for (const file of files) {
      const key = file.replace(/\.[^.]+$/, '').toLowerCase();
      map[key] = `/brands/${file}`;
    }
    return map;
  } catch {
    return {};
  }
}

const trust = [
  {
    icon: Award,
    bg: '#EFF6FF', iconColor: '#4880B8',
    stat: '10+ років',
    title: 'на ринку',
    text: 'Надійний постачальник будівельної хімії з підтвердженою репутацією.',
  },
  {
    icon: Users,
    bg: '#EFF6FF', iconColor: '#4880B8',
    stat: '500+',
    title: 'активних клієнтів',
    text: 'Дилери, підрядники, будівельні магазини по всій Україні.',
  },
  {
    icon: Package,
    bg: '#EFF6FF', iconColor: '#4880B8',
    stat: '1000+',
    title: 'артикулів',
    text: 'Широкий асортимент у наявності на складі з постійним поповненням.',
  },
  {
    icon: ShieldCheck,
    bg: '#EFF6FF', iconColor: '#4880B8',
    stat: '100%',
    title: 'сертифікована продукція',
    text: 'Оригінальні товари з документами та технічними паспортами.',
  },
];


export default async function Home() {
  const [categories, brands] = await Promise.all([
    getCategoriesCached(),
    getBrandsCached(),
  ]);
  const allSlugs = categories.map(c => c.slug);
  const products = await getPreviewProductsCached(allSlugs, 2);

  const brandLogoMap = getBrandLogoMap();

  const orgLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'FIXLINE',
    url: 'https://fixline.com.ua',
    logo: 'https://fixline.com.ua/fixline-logo.png',
    contactPoint: { '@type': 'ContactPoint', contactType: 'sales', availableLanguage: 'Ukrainian' },
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(orgLd) }} />
      <PromoBanner />

      {/* Hero */}
      <section style={{
        background: 'linear-gradient(160deg, #1E293B 0%, #243F6B 100%)',
        position: 'relative', overflow: 'hidden',
      }}>

        {/* Orb — teal top-right */}
        <div style={{
          position: 'absolute', top: '-120px', right: '-80px',
          width: '500px', height: '500px', borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(14,165,233,0.18) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />

        {/* Orb — blue bottom-left */}
        <div style={{
          position: 'absolute', bottom: '-100px', left: '-60px',
          width: '420px', height: '420px', borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(72,128,184,0.2) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />

        {/* Main content */}
        <div className="page-container" style={{ position: 'relative', zIndex: 1, padding: '52px 40px 48px', textAlign: 'center' }}>

          <h1 style={{
            fontSize: 'clamp(28px, 4vw, 52px)', fontWeight: 900,
            color: '#fff', lineHeight: 1.15, marginBottom: '28px',
            letterSpacing: '-0.5px',
          }}>
            Професійна будівельна хімія
          </h1>

          <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 36px', display: 'flex', gap: '28px', flexWrap: 'wrap', justifyContent: 'center' }}>
            {[
              'Оригінальна продукція від виробників',
              'Для дилерів, підрядників та магазинів',
              'Від 1 одиниці або великим оптом',
            ].map(item => (
              <li key={item} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px', color: '#CBD5E1' }}>
                <CheckCircle size={16} color="#4880B8" strokeWidth={2.5} style={{ flexShrink: 0 }} />
                {item}
              </li>
            ))}
          </ul>

          <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '28px', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0' }}>
            {[
              { icon: ShieldCheck,   title: 'Прямі поставки',          text: 'Своєчасно та без затримок' },
              { icon: Tag,           title: 'Вигідні ціни',            text: 'Конкурентні тарифи для партнерів' },
              { icon: Truck,         title: 'Доставка по всій Україні',text: 'Нова Пошта та власна логістика' },
              { icon: MessageCircle, title: 'Персональний менеджер',   text: 'Підтримка та консультації' },
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

        {/* Brand logos strip */}
        <div style={{ background: 'rgba(0,0,0,0.15)', borderTop: '1px solid rgba(255,255,255,0.06)', position: 'relative', zIndex: 1 }}>
          <div className="page-container" style={{ padding: '8px 40px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'space-between', flexWrap: 'nowrap' }}>
              {brands.slice(0, 14).map(brand => (
                <Link
                  key={brand}
                  href={`/shop?brand=${encodeURIComponent(brand)}`}
                  className="brand-logo-link"
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    height: '30px', padding: '0 12px', borderRadius: '7px',
                    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.09)',
                    textDecoration: 'none', minWidth: '72px',
                  }}
                >
                  {brandLogoMap[brand.toLowerCase()] ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={brandLogoMap[brand.toLowerCase()]}
                      alt={brand}
                      style={{ width: '64px', height: '24px', objectFit: 'contain' }}
                    />
                  ) : (
                    <span style={{ fontSize: '11px', fontWeight: 800, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                      {brand}
                    </span>
                  )}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>


      {/* Three paths */}
      <section style={{ background: 'var(--bg-card)', padding: '48px 0' }}>
        <div className="page-container">
          <h2 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', textAlign: 'center', marginBottom: '8px' }}>
            Оберіть зручний формат співпраці
          </h2>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', textAlign: 'center', marginBottom: '32px' }}>
            Роздріб, опт або дропшипінг — знайдемо умови для кожного
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px', maxWidth: '1100px', margin: '0 auto' }}>

            {/* Retail */}
            <div style={{
              border: '1px solid var(--border)', borderRadius: '16px',
              padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: '14px',
              background: '#F1F5F9',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Store size={20} color="var(--text-secondary)" strokeWidth={1.75} />
                </div>
                <h3 style={{ fontSize: '17px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Магазин</h3>
              </div>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
                Для приватних покупців. Купуйте від 1 одиниці за привабливими цінами. Реєстрація не обов&apos;язкова.
              </p>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '5px' }}>
                {['Від 1 штуки', 'Кращі ціни', 'Без реєстрації', 'Доставка по Україні'].map(item => (
                  <li key={item} style={{ fontSize: '13px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'var(--text-secondary)', flexShrink: 0, opacity: 0.4 }} />
                    {item}
                  </li>
                ))}
              </ul>
              <Link href="/shop" className="btn-primary" style={{
                marginTop: 'auto', height: '40px', borderRadius: '10px',
                background: '#4880B8', color: '#fff', fontSize: '13px', fontWeight: 700,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
              }}>
                <Store size={14} />Перейти до магазину
              </Link>
            </div>

            {/* Wholesale */}
            <div style={{
              border: '1px solid var(--border)', borderRadius: '16px',
              padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: '14px',
              background: '#F1F5F9',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <LayoutGrid size={20} color="var(--text-secondary)" strokeWidth={1.75} />
                </div>
                <h3 style={{ fontSize: '17px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Оптовий каталог</h3>
              </div>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
                Для дилерів, підрядників та магазинів. Оптові ціни та персональні умови для вашого бізнесу.
              </p>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '5px' }}>
                {['Оптові ціни', 'Персональні тарифи', 'Табличний каталог', 'Рахунки-фактури'].map(item => (
                  <li key={item} style={{ fontSize: '13px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'var(--text-secondary)', flexShrink: 0, opacity: 0.4 }} />
                    {item}
                  </li>
                ))}
              </ul>
              <Link href="/login?next=/catalog" style={{
                marginTop: 'auto', height: '40px', borderRadius: '10px',
                background: '#4880B8', color: '#fff', fontSize: '13px', fontWeight: 700,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                textDecoration: 'none',
              }}>
                <LayoutGrid size={14} />Оптовий каталог
              </Link>
            </div>

            {/* Dropship */}
            <div style={{
              border: '1px solid var(--border)', borderRadius: '16px',
              padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: '14px',
              background: '#F1F5F9',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <PackageCheck size={20} color="var(--text-secondary)" strokeWidth={1.75} />
                </div>
                <h3 style={{ fontSize: '17px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Дропшипінг</h3>
              </div>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
                Для онлайн-продавців. Продавайте наші товари без складу — ми відправляємо напряму Вашим клієнтам.
              </p>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '5px' }}>
                {['Без власного складу', 'Актуальний XML/YML прайс', 'Проста передача замовлень', 'Персональні ціни'].map(item => (
                  <li key={item} style={{ fontSize: '13px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'var(--text-secondary)', flexShrink: 0, opacity: 0.4 }} />
                    {item}
                  </li>
                ))}
              </ul>
              <Link href="/dropship" className="btn-primary" style={{
                marginTop: 'auto', height: '40px', borderRadius: '10px',
                background: '#4880B8', color: '#fff', fontSize: '13px', fontWeight: 700,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
              }}>
                <PackageCheck size={14} />Дізнатись більше
              </Link>
            </div>

          </div>
        </div>
      </section>

      {/* Categories carousel + interactive preview */}
      {categories.length > 0 && (
        <section style={{ background: 'var(--bg-soft)', padding: '20px 0 44px', borderTop: '1px solid var(--border)' }}>
          <div className="page-container">
            <h2 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)', textAlign: 'center', marginBottom: '6px' }}>
              Категорії продукції
            </h2>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', textAlign: 'center', marginBottom: '32px' }}>
              Оберіть категорію для швидкого доступу до магазину або оптового каталогу
            </p>
            <CategorySection categories={categories} products={products} />
          </div>
        </section>
      )}

      {/* Trust strip */}
      <section style={{ background: 'var(--bg-card)', padding: '40px 0', borderTop: '1px solid var(--border)' }}>
        <div className="page-container">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '24px' }}>
            {trust.map(({ icon: Icon, bg, iconColor, stat, title, text }) => (
              <div key={title} style={{ textAlign: 'center' }}>
                <div style={{
                  width: '44px', height: '44px', borderRadius: '12px', flexShrink: 0,
                  background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  margin: '0 auto 12px',
                }}>
                  <Icon size={20} color={iconColor} strokeWidth={2} />
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

      {/* CTA */}
      <section style={{ background: '#1E3059', padding: '28px 0', textAlign: 'center' }}>
        <div className="page-container">
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
        </div>
      </section>

      <Footer />
    </>
  );
}

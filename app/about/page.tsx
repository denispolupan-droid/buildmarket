import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import Footer from '../components/Footer';
import { ShieldCheck, Users, Package, Award, Truck, MessageCircle } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Про компанію FIXLINE — постачальник будівельної хімії',
  description: 'Постачальник будівельної хімії в Україні: герметики, клеї, монтажні піни, ґрунтовки від перевірених виробників. 10+ років на ринку, 500+ клієнтів B2B.',
  keywords: ['про компанію FIXLINE', 'постачальник будівельної хімії', 'поставщик строительной химии Украина', 'оптова будівельна хімія', 'герметики оптом постачальник', 'Харків будівельна хімія'],
  alternates: { canonical: 'https://fixline.com.ua/about', languages: { 'uk': 'https://fixline.com.ua/about', 'ru': 'https://fixline.com.ua/ru/about', 'x-default': 'https://fixline.com.ua/about' } },
  openGraph: {
    title: 'Про компанію FIXLINE',
    description: 'Офіційний постачальник будівельної хімії в Україні. 10+ років, 500+ клієнтів, 1000+ артикулів.',
    url: 'https://fixline.com.ua/about',
    siteName: 'FIXLINE',
    locale: 'uk_UA',
    type: 'website',
    images: [{ url: 'https://fixline.com.ua/opengraph-image', width: 1200, height: 630, alt: 'FIXLINE — будівельна хімія' }],
  },
};

const stats = [
  { icon: Award,         stat: '10+',   label: 'років на ринку',        text: 'Надійний постачальник з підтвердженою репутацією серед дилерів та підрядників.' },
  { icon: Users,         stat: '500+',  label: 'активних клієнтів',     text: 'B2B партнери по всій Україні: будівельні магазини, підрядники, дропшипери.' },
  { icon: Package,       stat: '1000+', label: 'артикулів',             text: 'Широкий асортимент у наявності на складі з постійним поповненням.' },
  { icon: ShieldCheck,   stat: '100%',  label: 'сертифікована продукція', text: 'Тільки оригінальні товари з документами якості та технічними паспортами.' },
];

const brands = [
  { name: 'Lacrysil',      src: '/brands/Lacrysil.png' },
  { name: 'Ceresit',       src: '/brands/ceresit.webp' },
  { name: 'Pattex',        src: '/brands/pattex.webp' },
  { name: 'Ataman',        src: '/brands/ataman.jpg' },
  { name: 'Aqua Protect',  src: '/brands/Aqua Protect.png' },
  { name: 'Bitugum',       src: '/brands/bitugum.webp' },
];

const values = [
  { icon: ShieldCheck,   title: 'Якість без компромісів',  text: 'Ми працюємо тільки з перевіреними виробниками та офіційними дистриб\'юторами. Кожна партія супроводжується документами якості.' },
  { icon: Truck,         title: 'Надійна логістика',       text: 'Власна логістика та Нова Пошта по всій Україні. Замовлення, прийняті до 14:00, відправляємо того ж дня.' },
  { icon: MessageCircle, title: 'Персональний підхід',     text: 'За кожним клієнтом закріплений менеджер. Консультуємо щодо вибору матеріалів і підбору аналогів.' },
  { icon: Package,       title: 'Гнучкі умови',            text: 'Від 1 одиниці в роздріб до великого опту. Індивідуальні ціни та умови оплати для постійних партнерів.' },
];

export default function AboutPage() {
  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Головна', item: 'https://fixline.com.ua' },
      { '@type': 'ListItem', position: 2, name: 'Про компанію', item: 'https://fixline.com.ua/about' },
    ],
  };

  const orgLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'FIXLINE',
    url: 'https://fixline.com.ua',
    logo: 'https://fixline.com.ua/fixline-logo.png',
    description: 'Постачальник будівельної хімії в Україні: герметики, монтажні піни, клеї, ґрунтовки оптом і в роздріб.',
    address: {
      '@type': 'PostalAddress',
      addressLocality: 'Харків',
      addressCountry: 'UA',
    },
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
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(orgLd) }} />

      <div style={{ background: 'var(--bg-soft)', minHeight: '100vh' }}>

        {/* Hero */}
        <section style={{ background: 'linear-gradient(160deg, #1E293B 0%, #1E3A5F 100%)', padding: '64px 0 56px' }}>
          <div className="page-container">
            <nav style={{ fontSize: '13px', color: '#64748B', marginBottom: '24px', display: 'flex', gap: '6px', alignItems: 'center' }}>
              <Link href="/" style={{ color: '#64748B', textDecoration: 'none' }}>Головна</Link>
              <span>/</span>
              <span style={{ color: '#94A3B8' }}>Про компанію</span>
            </nav>
            {/* Name breakdown */}
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0', marginBottom: '28px', userSelect: 'none' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <span style={{
                  fontSize: 'clamp(40px, 6vw, 72px)', fontWeight: 900, letterSpacing: '-2px', lineHeight: 1,
                  background: 'linear-gradient(135deg, #fff 0%, #93C5FD 100%)',
                  WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
                }}>FIX</span>
                <span style={{ fontSize: '11px', fontWeight: 600, color: '#4880B8', letterSpacing: '0.15em', textTransform: 'uppercase', marginTop: '4px' }}>
                  фіксація
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
                  лінія
                </span>
              </div>
            </div>

            <h1 style={{ fontSize: 'clamp(20px, 2.5vw, 30px)', fontWeight: 700, color: '#fff', lineHeight: 1.3, marginBottom: '16px', letterSpacing: '-0.3px' }}>
              Лінія фіксації — все для надійного монтажу
            </h1>
            <p style={{ fontSize: '16px', color: '#94A3B8', lineHeight: 1.7, maxWidth: '580px', margin: 0 }}>
              Герметики, клеї, монтажні піни, ґрунтовки — матеріали, що фіксують,
              захищають і тримають. Від перевірених виробників за конкурентними цінами.
            </p>
          </div>
        </section>

        {/* Name story */}
        <section style={{ background: 'var(--bg-soft)', borderBottom: '1px solid var(--border)', padding: '48px 0' }}>
          <div className="page-container">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '48px', alignItems: 'center' }} className="about-content-grid">

              {/* Left — concept cards */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                {[
                  { word: 'FIX',      color: '#4880B8', bg: 'rgba(72,128,184,0.08)', border: 'rgba(72,128,184,0.2)',  meanings: ['Фіксувати',  'Кріпити',    'Склеювати', 'Герметизувати'] },
                  { word: 'LINE',     color: '#14B8A6', bg: 'rgba(20,184,166,0.08)',  border: 'rgba(20,184,166,0.2)', meanings: ['Лінія',      'Асортимент', 'Підбір',    'Система'] },
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

                {/* Combined */}
                <div style={{ gridColumn: '1 / -1', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '20px 24px', display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div style={{ fontSize: '22px', fontWeight: 900, letterSpacing: '-0.5px', flexShrink: 0 }}>
                    <span style={{ color: '#4880B8' }}>FIX</span>
                    <span style={{ color: '#14B8A6' }}>LINE</span>
                  </div>
                  <div style={{ width: '1px', height: '32px', background: 'var(--border)', flexShrink: 0 }} />
                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
                    Лінія матеріалів для фіксації — повний асортимент того, що кріпить, клеїть, герметизує та захищає в будівництві та ремонті.
                  </p>
                </div>
              </div>

              {/* Right — text */}
              <div>
                <h2 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '16px', lineHeight: 1.3 }}>
                  Назва — це концепція
                </h2>
                <div style={{ fontSize: '15px', color: 'var(--text-secondary)', lineHeight: 1.8, display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <p>
                    <strong style={{ color: 'var(--text-primary)' }}>FIX</strong> — від англійського {'"'}fix{'"'}: фіксувати, кріпити, усувати. Це суть будівельної хімії: клей тримає, герметик захищає, піна фіксує.
                  </p>
                  <p>
                    <strong style={{ color: 'var(--text-primary)' }}>LINE</strong> — лінія, асортимент, система. Не один продукт, а повна лінійка матеріалів для будь-якого завдання на будмайданчику або в ремонті.
                  </p>
                  <p>
                    Разом <strong style={{ color: 'var(--text-primary)' }}>FIXLINE</strong> — це лінія фіксації: все що потрібно, щоб усе трималося надійно.
                  </p>
                </div>
              </div>

            </div>
          </div>
        </section>

        {/* Stats */}
        <section style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border)' }}>
          <div className="page-container" style={{ padding: '48px 32px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '32px' }} className="about-stats-grid">
              {stats.map(({ icon: Icon, stat, label, text }) => (
                <div key={label} style={{ textAlign: 'center' }}>
                  <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                    <Icon size={22} color="#4880B8" strokeWidth={2} />
                  </div>
                  <div style={{ fontSize: '32px', fontWeight: 900, color: 'var(--text-primary)', lineHeight: 1 }}>{stat}</div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', margin: '4px 0 8px' }}>{label}</div>
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>{text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* About text */}
        <section style={{ padding: '64px 0' }}>
          <div className="page-container">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '64px', alignItems: 'start' }} className="about-content-grid">
              <div>
                <h2 style={{ fontSize: '26px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '20px' }}>
                  Хто ми
                </h2>
                <div style={{ fontSize: '15px', color: 'var(--text-secondary)', lineHeight: 1.8, display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <p>
                    FIXLINE — B2B постачальник будівельної хімії для дилерів, підрядників,
                    будівельних магазинів та дропшиперів по всій Україні.
                  </p>
                  <p>
                    Ми не виробник — ми зв&apos;язуємо клієнтів з перевіреними виробниками та
                    брендами. Наша задача: широкий асортимент, актуальні ціни та швидка
                    доставка Новою Поштою в будь-яку точку України.
                  </p>
                  <p>
                    Працюємо як з роздрібними покупцями від 1 одиниці, так і з оптовими
                    клієнтами. Пропонуємо гнучкі умови та підбір аналогів під бюджет.
                  </p>
                </div>
              </div>
              <div>
                <h2 style={{ fontSize: '26px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '20px' }}>
                  Доставка та логістика
                </h2>
                <div style={{ fontSize: '15px', color: 'var(--text-secondary)', lineHeight: 1.8, display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <p>
                    Відправляємо Новою Поштою по всій Україні. Замовлення до 14:00 — відправка
                    того ж дня. Широкий асортимент підтримується в постійній наявності.
                  </p>
                  <p>
                    Для великих оптових партій — адресна доставка по Харкову та регіону,
                    умови обговорюються з менеджером індивідуально.
                  </p>
                  <p>
                    Дропшиперам надаємо XML/YML-фід з актуальними залишками та цінами,
                    що оновлюється кілька разів на день. Доставляємо напряму клієнту
                    від імені вашого магазину.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Values */}
        <section style={{ background: 'var(--bg-card)', borderTop: '1px solid var(--border)', padding: '64px 0' }}>
          <div className="page-container">
            <h2 style={{ fontSize: '26px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '40px', textAlign: 'center' }}>
              Наші принципи
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '24px' }} className="about-values-grid">
              {values.map(({ icon: Icon, title, text }) => (
                <div key={title} style={{ background: 'var(--bg-soft)', border: '1px solid var(--border)', borderRadius: '16px', padding: '28px 24px' }}>
                  <div style={{ width: '44px', height: '44px', borderRadius: '10px', background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
                    <Icon size={20} color="#4880B8" strokeWidth={2} />
                  </div>
                  <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '10px' }}>{title}</h3>
                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>{text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Brands */}
        <section style={{ padding: '64px 0', borderTop: '1px solid var(--border)' }}>
          <div className="page-container">
            <h2 style={{ fontSize: '26px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '8px', textAlign: 'center' }}>
              Бренди, з якими ми працюємо
            </h2>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', textAlign: 'center', marginBottom: '40px' }}>
              Продукція від перевірених виробників будівельної хімії
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '12px' }} className="brands-grid">
              {brands.map(({ name, src }) => (
                <div key={name} style={{
                  background: 'var(--bg-card)', border: '1px solid var(--border)',
                  borderRadius: '12px', padding: '12px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  aspectRatio: '3/2',
                }}>
                  <Image src={src} alt={name} width={160} height={80} style={{ objectFit: 'contain', width: '100%', height: '100%' }} />
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section style={{ background: '#1E3059', padding: '56px 0', textAlign: 'center' }}>
          <div className="page-container">
            <h2 style={{ fontSize: '24px', fontWeight: 800, color: '#fff', marginBottom: '12px' }}>
              Стати партнером FIXLINE
            </h2>
            <p style={{ fontSize: '14px', color: '#94A3B8', marginBottom: '32px', maxWidth: '480px', margin: '0 auto 32px' }}>
              Дилери, підрядники, будівельні магазини — реєструйтесь та отримуйте
              доступ до оптових цін і персонального менеджера.
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
              <Link href="/register" style={{ height: '48px', padding: '0 28px', borderRadius: '10px', background: '#4880B8', color: '#fff', fontSize: '14px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>
                Зареєструватись
              </Link>
              <Link href="/contacts" style={{ height: '48px', padding: '0 28px', borderRadius: '10px', border: '1.5px solid rgba(255,255,255,0.2)', color: '#E2E8F0', fontSize: '14px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', textDecoration: 'none', background: 'transparent' }}>
                Зв&apos;язатися з нами
              </Link>
            </div>
          </div>
        </section>

      </div>
      <Footer />
      <style>{`
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

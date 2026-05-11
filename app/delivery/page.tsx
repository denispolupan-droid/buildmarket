import type { Metadata } from 'next';
import Link from 'next/link';
import Footer from '../components/Footer';
import { Truck, Clock, MapPin, Package, CreditCard, Phone } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Умови доставки | FIXLINE',
  description: 'Доставка будівельної хімії по всій Україні. Нова Пошта, адресна доставка. Замовлення до 14:00 — відправка в той самий день.',
  keywords: ['доставка будівельна хімія', 'Нова Пошта будматеріали', 'доставка строительная химия Украина', 'умови доставки'],
  alternates: { canonical: 'https://fixline.com.ua/delivery', languages: { 'uk': 'https://fixline.com.ua/delivery', 'ru': 'https://fixline.com.ua/delivery', 'x-default': 'https://fixline.com.ua/delivery' } },
  openGraph: {
    title: 'Умови доставки — FIXLINE',
    description: 'Доставка по всій Україні. Нова Пошта, адресна доставка. Відправка в день замовлення.',
    url: 'https://fixline.com.ua/delivery',
    siteName: 'FIXLINE',
    locale: 'uk_UA',
  },
};

export default function DeliveryPage() {
  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Головна', item: 'https://fixline.com.ua' },
      { '@type': 'ListItem', position: 2, name: 'Умови доставки', item: 'https://fixline.com.ua/delivery' },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
      <div style={{ background: 'var(--bg-soft)', minHeight: '100vh' }}>
        <div style={{ maxWidth: '860px', margin: '0 auto', padding: '48px 32px 80px' }}>

          <nav style={{ fontSize: '13px', color: '#94A3B8', marginBottom: '24px', display: 'flex', gap: '6px', alignItems: 'center' }}>
            <Link href="/" style={{ color: '#94A3B8', textDecoration: 'none' }}>Головна</Link>
            <span>/</span>
            <span>Умови доставки</span>
          </nav>

          <h1 style={{ fontSize: '28px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '8px' }}>Умови доставки</h1>
          <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '48px' }}>Відправляємо по всій Україні щоденно, пн–пт</p>

          {/* Methods */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '48px' }} className="delivery-grid">

            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '28px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                <div style={{ width: '44px', height: '44px', borderRadius: '10px', background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Truck size={20} color="#4880B8" strokeWidth={2} />
                </div>
                <h2 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Нова Пошта</h2>
              </div>
              <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.7, margin: '0 0 12px' }}>
                Доставка до відділення або поштомату Нової Пошти по всій Україні. Найшвидший і найзручніший спосіб для більшості замовлень.
              </p>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {['Доставка 1–2 дні', 'Понад 6000 відділень по Україні', 'Відстеження посилки в реальному часі', 'Накладений платіж або передоплата'].map(i => (
                  <li key={i} style={{ fontSize: '13px', color: 'var(--text-secondary)', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                    <span style={{ color: '#4880B8', flexShrink: 0, marginTop: '2px' }}>✓</span>{i}
                  </li>
                ))}
              </ul>
            </div>

            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '28px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                <div style={{ width: '44px', height: '44px', borderRadius: '10px', background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <MapPin size={20} color="#4880B8" strokeWidth={2} />
                </div>
                <h2 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Адресна доставка</h2>
              </div>
              <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.7, margin: '0 0 12px' }}>
                Для великих оптових замовлень — доставка власним транспортом або перевізником по Харкову та найближчих регіонах.
              </p>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {['Від 50 кг або від 5000 грн', 'Харків та область — безкоштовно', 'Умови обговорюються з менеджером'].map(i => (
                  <li key={i} style={{ fontSize: '13px', color: 'var(--text-secondary)', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                    <span style={{ color: '#4880B8', flexShrink: 0, marginTop: '2px' }}>✓</span>{i}
                  </li>
                ))}
              </ul>
            </div>

          </div>

          {/* Terms */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '32px', marginBottom: '32px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '24px' }}>Терміни та умови</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {[
                { icon: Clock,      title: 'Обробка замовлення',  text: 'Замовлення, розміщені до 14:00 у робочі дні, відправляємо в той самий день. Замовлення після 14:00 — наступного робочого дня.' },
                { icon: Package,    title: 'Упаковка',            text: 'Товар упаковується в картонні коробки з наповнювачем. Для крихких і рідких матеріалів — посилена упаковка без додаткової оплати.' },
                { icon: CreditCard, title: 'Оплата при отриманні', text: 'Накладений платіж через Нову Пошту — оплачуєте при отриманні посилки. Для оптових клієнтів — передоплата на рахунок або через платіжну систему.' },
              ].map(({ icon: Icon, title, text }) => (
                <div key={title} style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
                  <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'var(--bg-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: '1px solid var(--border)' }}>
                    <Icon size={18} color="#4880B8" strokeWidth={2} />
                  </div>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>{title}</div>
                    <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>{text}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Questions */}
          <div style={{ background: '#1E3A5F', borderRadius: '16px', padding: '28px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
            <div>
              <div style={{ fontSize: '16px', fontWeight: 700, color: '#fff', marginBottom: '4px' }}>Залишились питання щодо доставки?</div>
              <div style={{ fontSize: '13px', color: '#94A3B8' }}>Менеджер відповість протягом кількох хвилин</div>
            </div>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <a href="tel:+380991997788" style={{ height: '40px', padding: '0 20px', borderRadius: '8px', background: '#4880B8', color: '#fff', fontSize: '13px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '6px', textDecoration: 'none' }}>
                <Phone size={14} /> Зателефонувати
              </a>
              <Link href="/contacts" style={{ height: '40px', padding: '0 20px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.2)', color: '#E2E8F0', fontSize: '13px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', textDecoration: 'none', background: 'transparent' }}>
                Написати
              </Link>
            </div>
          </div>

        </div>
      </div>
      <Footer />
      <style>{`
        @media (max-width: 640px) { .delivery-grid { grid-template-columns: 1fr !important; } }
      `}</style>
    </>
  );
}

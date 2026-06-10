import type { Metadata } from 'next';
import Link from 'next/link';
import Footer from '../../components/Footer';
import { Truck, Clock, MapPin, Package, CreditCard, Phone } from 'lucide-react';

const BASE = 'https://fixline.com.ua';

export const metadata: Metadata = {
  title: 'Условия доставки',
  description: 'Доставка строительной химии по всей Украине. Новая Почта, адресная доставка. Заказ до 14:00 — отправка в тот же день.',
  keywords: ['доставка строительная химия', 'Новая Почта стройматериалы', 'условия доставки'],
  alternates: {
    canonical: `${BASE}/ru/delivery`,
    languages: { 'uk': `${BASE}/delivery`, 'ru': `${BASE}/ru/delivery`, 'x-default': `${BASE}/delivery` },
  },
  openGraph: {
    title: 'Условия доставки — FIXLINE',
    description: 'Доставка по всей Украине. Новая Почта, адресная доставка. Отправка в день заказа.',
    url: `${BASE}/ru/delivery`,
    siteName: 'FIXLINE',
    locale: 'ru_RU',
    type: 'website',
    images: [{ url: `${BASE}/opengraph-image`, width: 1200, height: 630, alt: 'FIXLINE — строительная химия' }],
  },
};

export default function DeliveryRuPage() {
  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Главная', item: `${BASE}/ru` },
      { '@type': 'ListItem', position: 2, name: 'Условия доставки', item: `${BASE}/ru/delivery` },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
      <div style={{ background: 'var(--bg-soft)', minHeight: '100vh' }}>
        <div style={{ maxWidth: '860px', margin: '0 auto', padding: '48px 32px 80px' }}>

          <nav style={{ fontSize: '13px', color: '#94A3B8', marginBottom: '24px', display: 'flex', gap: '6px', alignItems: 'center' }}>
            <Link href="/ru" style={{ color: '#94A3B8', textDecoration: 'none' }}>Главная</Link>
            <span>/</span>
            <span>Условия доставки</span>
          </nav>

          <h1 style={{ fontSize: '28px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '8px' }}>Условия доставки</h1>
          <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '48px' }}>Отправляем по всей Украине ежедневно, пн–пт</p>

          {/* Methods */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '48px' }} className="delivery-grid">

            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '28px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                <div style={{ width: '44px', height: '44px', borderRadius: '10px', background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Truck size={20} color="#4880B8" strokeWidth={2} />
                </div>
                <h2 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Новая Почта</h2>
              </div>
              <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.7, margin: '0 0 12px' }}>
                Доставка до отделения или постамата Новой Почты по всей Украине. Самый быстрый и удобный способ для большинства заказов.
              </p>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {['Доставка 1–2 дня', 'Более 6000 отделений по Украине', 'Отслеживание посылки в реальном времени', 'Наложенный платёж или предоплата'].map(i => (
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
                <h2 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Адресная доставка</h2>
              </div>
              <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.7, margin: '0 0 12px' }}>
                Для крупных оптовых заказов — доставка собственным транспортом или перевозчиком по Харькову и ближайшим регионам.
              </p>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {['От 50 кг или от 5000 грн', 'Харьков и область — бесплатно', 'Условия обсуждаются с менеджером'].map(i => (
                  <li key={i} style={{ fontSize: '13px', color: 'var(--text-secondary)', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                    <span style={{ color: '#4880B8', flexShrink: 0, marginTop: '2px' }}>✓</span>{i}
                  </li>
                ))}
              </ul>
            </div>

          </div>

          {/* Terms */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '32px', marginBottom: '32px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '24px' }}>Сроки и условия</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {[
                { icon: Clock,      title: 'Обработка заказа',   text: 'Заказы, размещённые до 14:00 в рабочие дни, отправляем в тот же день. Заказы после 14:00 — на следующий рабочий день.' },
                { icon: Package,    title: 'Упаковка',            text: 'Товар упаковывается в картонные коробки с наполнителем. Для хрупких и жидких материалов — усиленная упаковка без дополнительной оплаты.' },
                { icon: CreditCard, title: 'Оплата при получении', text: 'Наложенный платёж через Новую Почту — оплачиваете при получении посылки. Для оптовых клиентов — предоплата на счёт или через платёжную систему.' },
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
              <div style={{ fontSize: '16px', fontWeight: 700, color: '#fff', marginBottom: '4px' }}>Остались вопросы по доставке?</div>
              <div style={{ fontSize: '13px', color: '#94A3B8' }}>Менеджер ответит в течение нескольких минут</div>
            </div>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <a href="tel:+380991997788" style={{ height: '40px', padding: '0 20px', borderRadius: '8px', background: '#4880B8', color: '#fff', fontSize: '13px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '6px', textDecoration: 'none' }}>
                <Phone size={14} /> Позвонить
              </a>
              <Link href="/ru/contacts" style={{ height: '40px', padding: '0 20px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.2)', color: '#E2E8F0', fontSize: '13px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', textDecoration: 'none', background: 'transparent' }}>
                Написать
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

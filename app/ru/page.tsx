import type { Metadata } from 'next';
import Link from 'next/link';
import Footer from '../components/Footer';

const BASE = 'https://fixline.com.ua';

export const revalidate = 300;

export const metadata: Metadata = {
  title: 'FIXLINE — строительная химия оптом и в розницу',
  description: 'Герметики, монтажная пена, клеи, грунтовки от ведущих брендов. Оптовые цены для дилеров и подрядчиков. Доставка по всей Украине.',
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

export default function RuHomePage() {
  return (
    <>
      <div style={{ background: 'var(--bg-page)', minHeight: '80vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 24px', gap: '24px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: 800, color: 'var(--text-primary)', textAlign: 'center', margin: 0 }}>
          FIXLINE — строительная химия оптом
        </h1>
        <p style={{ fontSize: '16px', color: 'var(--text-secondary)', textAlign: 'center', maxWidth: '480px', lineHeight: 1.6, margin: 0 }}>
          Герметики, монтажная пена, клеи, грунтовки от ведущих брендов. Оптовые цены для дилеров и подрядчиков. Доставка по всей Украине.
        </p>
        <Link
          href="/ru/shop"
          style={{
            display: 'inline-block',
            background: '#4880B8',
            color: '#fff',
            padding: '14px 32px',
            borderRadius: '10px',
            fontWeight: 700,
            fontSize: '16px',
            textDecoration: 'none',
          }}
        >
          Перейти в магазин
        </Link>
      </div>
      <Footer />
    </>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';
import Footer from '../../components/Footer';
import { MapPin, Phone, Mail, Clock, Send } from 'lucide-react';

const BASE = 'https://fixline.com.ua';

export const metadata: Metadata = {
  title: { absolute: 'Контакты | FIXLINE — строительная химия B2B' },
  description: 'Свяжитесь с FIXLINE: +38 (099) 199-77-88, info@fixline.com.ua. Доставка по всей Украине. Строительная химия оптом — контакты поставщика.',
  keywords: ['контакты FIXLINE', 'поставщик строительная химия', 'оптовая строительная химия контакты', 'Харьков строительная химия'],
  alternates: {
    canonical: `${BASE}/ru/contacts`,
    languages: { 'uk': `${BASE}/contacts`, 'ru': `${BASE}/ru/contacts`, 'x-default': `${BASE}/contacts` },
  },
  openGraph: {
    title: 'Контакты FIXLINE — строительная химия оптом',
    description: 'Телефон: +38 (099) 199-77-88 | Email: info@fixline.com.ua | График: пн–пт 9–16 | Харьков',
    url: `${BASE}/ru/contacts`,
    siteName: 'FIXLINE',
    locale: 'ru_RU',
    type: 'website',
    images: [{ url: `${BASE}/opengraph-image`, width: 1200, height: 630, alt: 'FIXLINE — строительная химия' }],
  },
};

export default function ContactsRuPage() {
  const localBusinessLd = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: 'FIXLINE',
    description: 'B2B поставщик строительной химии: герметики, клеи, монтажные пены',
    url: BASE,
    telephone: '+380991997788',
    email: 'info@fixline.com.ua',
    address: {
      '@type': 'PostalAddress',
      streetAddress: 'Площадь Свободы',
      addressLocality: 'Харьков',
      addressRegion: 'Харьковская область',
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
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(localBusinessLd) }} />
      <div style={{ background: 'var(--bg-soft)', minHeight: '100vh' }}>
        <div style={{ maxWidth: '960px', margin: '0 auto', padding: '48px 32px 64px' }}>

          <h1 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '8px' }}>Контакты</h1>
          <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '40px' }}>
            Работаем с B2B клиентами по всей Украине
          </p>

          <div className="contacts-grid">
            {[
              {
                icon: Phone,
                title: 'Телефон',
                lines: [
                  <a key="p1" href="tel:+380991997788" style={{ color: 'var(--brand-blue)', fontWeight: 600, fontSize: '15px' }}>+38 (099) 199-77-88</a>,
                  <span key="p2" style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Менеджер по продажам</span>,
                ],
              },
              {
                icon: Mail,
                title: 'Email',
                lines: [
                  <a key="e1" href="mailto:info@fixline.com.ua" style={{ color: 'var(--brand-blue)', fontWeight: 600, fontSize: '15px' }}>info@fixline.com.ua</a>,
                  <span key="e2" style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Отвечаем в течение дня</span>,
                ],
              },
              {
                icon: Send,
                title: 'Telegram',
                lines: [
                  <a key="t1" href="https://t.me/380991997788" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--brand-blue)', fontWeight: 600, fontSize: '15px' }}>Написать в Telegram</a>,
                  <span key="t2" style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Быстрые ответы</span>,
                ],
              },
              {
                icon: MapPin,
                title: 'Регион',
                lines: [
                  <span key="a1" style={{ fontWeight: 600, fontSize: '15px', color: 'var(--text-primary)' }}>Украина</span>,
                  <span key="a2" style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Отправка по всей Украине</span>,
                ],
              },
              {
                icon: Clock,
                title: 'График работы',
                lines: [
                  <span key="h1" style={{ fontWeight: 600, fontSize: '15px', color: 'var(--text-primary)' }}>Пн–Пт: 9:00 – 16:00</span>,
                  <span key="h2" style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Сб–Вс: выходной</span>,
                ],
              },
            ].map(({ icon: Icon, title, lines }) => (
              <div key={title} style={{
                background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '14px',
                padding: '24px', display: 'flex', gap: '16px', alignItems: 'flex-start',
              }}>
                <div style={{
                  width: '44px', height: '44px', borderRadius: '12px',
                  background: 'var(--bg-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <Icon size={20} color="#4880B8" strokeWidth={1.8} />
                </div>
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
                    {title}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    {lines}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div style={{
            marginTop: '32px', background: '#1E3A5F', borderRadius: '16px',
            padding: '32px 40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            flexWrap: 'wrap', gap: '16px',
          }}>
            <div>
              <div style={{ fontSize: '18px', fontWeight: 800, color: '#fff', marginBottom: '4px' }}>
                Готовы к сотрудничеству?
              </div>
              <div style={{ fontSize: '14px', color: '#94A3B8' }}>
                Зарегистрируйтесь и получите доступ к оптовым ценам
              </div>
            </div>
            <Link href="/register" style={{
              display: 'inline-flex', alignItems: 'center', height: '44px', padding: '0 24px',
              borderRadius: '10px', background: '#fff', color: '#1E3A5F',
              fontSize: '14px', fontWeight: 700,
            }}>
              Зарегистрироваться →
            </Link>
          </div>

        </div>
      </div>
      <Footer />
    </>
  );
}

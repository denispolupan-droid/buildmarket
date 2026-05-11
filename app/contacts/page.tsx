import type { Metadata } from 'next';
import Link from 'next/link';
import Footer from '../components/Footer';
import { MapPin, Phone, Mail, Clock } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Контакти | FIXLINE — будівельна хімія B2B',
  description: 'Зв\'яжіться з FIXLINE: +38 (099) 199-77-88, info@fixline.com.ua. Доставка по всій Україні. Будівельна хімія оптом — контакти постачальника.',
  keywords: ['контакти FIXLINE', 'постачальник будівельна хімія', 'поставщик строительная химия Украина', 'оптова будівельна хімія контакти', 'Харків будівельна хімія'],
  alternates: { canonical: 'https://fixline.com.ua/contacts', languages: { 'uk': 'https://fixline.com.ua/contacts', 'ru': 'https://fixline.com.ua/contacts', 'x-default': 'https://fixline.com.ua/contacts' } },
  openGraph: {
    title: 'Контакти FIXLINE — будівельна хімія оптом',
    description: 'Телефон: +38 (099) 199-77-88 | Email: info@fixline.com.ua | Графік: пн–пт 9–16 | Харків',
    url: 'https://fixline.com.ua/contacts',
    siteName: 'FIXLINE',
    locale: 'uk_UA',
  },
};

export default function ContactsPage() {
  const localBusinessLd = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: 'FIXLINE',
    description: 'B2B постачальник будівельної хімії: герметики, клеї, монтажні піни',
    url: 'https://fixline.com.ua',
    telephone: '+380991997788',
    email: 'info@fixline.com.ua',
    address: {
      '@type': 'PostalAddress',
      addressCountry: 'UA',
      addressRegion: 'Харківська область',
    },
    openingHoursSpecification: {
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
      opens: '09:00',
      closes: '16:00',
    },
    priceRange: '$$',
    areaServed: { '@type': 'Country', name: 'Ukraine' },
    servesCuisine: undefined,
    sameAs: ['https://fixline.com.ua'],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(localBusinessLd) }} />
      <div style={{ background: 'var(--bg-soft)', minHeight: '100vh' }}>
        <div style={{ maxWidth: '960px', margin: '0 auto', padding: '48px 32px 64px' }}>

          <h1 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '8px' }}>Контакти</h1>
          <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '40px' }}>
            Працюємо з B2B клієнтами по всій Україні
          </p>

          <div className="contacts-grid">

            {/* Info cards */}
            {[
              {
                icon: Phone,
                title: 'Телефон',
                lines: [
                  <a key="p1" href="tel:+380991997788" style={{ color: 'var(--brand-blue)', fontWeight: 600, fontSize: '15px' }}>+38 (099) 199-77-88</a>,
                  <span key="p2" style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Менеджер з продажу</span>,
                ],
              },
              {
                icon: Mail,
                title: 'Email',
                lines: [
                  <a key="e1" href="mailto:info@fixline.com.ua" style={{ color: 'var(--brand-blue)', fontWeight: 600, fontSize: '15px' }}>info@fixline.com.ua</a>,
                  <span key="e2" style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Відповідаємо протягом дня</span>,
                ],
              },
              {
                icon: MapPin,
                title: 'Регіон',
                lines: [
                  <span key="a1" style={{ fontWeight: 600, fontSize: '15px', color: 'var(--text-primary)' }}>м. Харків, Україна</span>,
                  <span key="a2" style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Відправка по всій Україні</span>,
                ],
              },
              {
                icon: Clock,
                title: 'Графік роботи',
                lines: [
                  <span key="h1" style={{ fontWeight: 600, fontSize: '15px', color: 'var(--text-primary)' }}>Пн–Пт: 9:00 – 16:00</span>,
                  <span key="h2" style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Сб–Нд: вихідний</span>,
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

          {/* CTA */}
          <div style={{
            marginTop: '32px', background: '#1E3A5F', borderRadius: '16px',
            padding: '32px 40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            flexWrap: 'wrap', gap: '16px',
          }}>
            <div>
              <div style={{ fontSize: '18px', fontWeight: 800, color: '#fff', marginBottom: '4px' }}>
                Готові до співпраці?
              </div>
              <div style={{ fontSize: '14px', color: '#94A3B8' }}>
                Зареєструйтесь і отримайте доступ до оптових цін
              </div>
            </div>
            <Link href="/register" style={{
              display: 'inline-flex', alignItems: 'center', height: '44px', padding: '0 24px',
              borderRadius: '10px', background: '#fff', color: '#1E3A5F',
              fontSize: '14px', fontWeight: 700,
            }}>
              Зареєструватися →
            </Link>
          </div>

        </div>
      </div>
      <Footer />
    </>
  );
}

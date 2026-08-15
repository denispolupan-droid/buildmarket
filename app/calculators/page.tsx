import type { Metadata } from 'next';
import Link from 'next/link';
import Footer from '../components/Footer';
import CalculatorsClient from '../components/CalculatorsClient';

const BASE = 'https://fixline.com.ua';

export const metadata: Metadata = {
  // Без « | FIXLINE»: суфікс додає template у app/layout.tsx, інакше в title
  // виходило «… | FIXLINE | FIXLINE» на 86 символів (Google різав на ~65)
  title: 'Будівельні калькулятори — витрата герметика, піни, ґрунтовки, клею',
  description: 'Безкоштовні калькулятори витрати будівельної хімії: скільки картриджів герметика на шов, балонів піни на вікна, літрів ґрунтовки на площу, клею на монтаж. Розрахунок за 10 секунд.',
  keywords: ['калькулятор витрати герметика', 'калькулятор монтажної піни', 'розрахунок ґрунтовки на м2', 'витрата фарби калькулятор', 'скільки герметика потрібно на шов', 'калькулятор рідких цвяхів'],
  alternates: { canonical: `${BASE}/calculators`, languages: { 'uk': `${BASE}/calculators`, 'ru': `${BASE}/ru/calculators`, 'x-default': `${BASE}/calculators` } },
  openGraph: {
    title: 'Будівельні калькулятори витрати — FIXLINE',
    description: 'Скільки герметика, піни, ґрунтовки чи клею потрібно на вашу задачу — розрахунок за 10 секунд.',
    url: `${BASE}/calculators`,
    siteName: 'FIXLINE',
    locale: 'uk_UA',
    type: 'website',
  },
};

const FAQ = [
  {
    q: 'Як розрахувати витрату герметика на шов?',
    a: 'Об’єм у мілілітрах = довжина шва (м) × ширина (мм) × глибина (мм). Наприклад, шов 10 м при ширині 8 мм і глибині 6 мм — це 480 мл, тобто 2 картриджі по 300 мл із запасом 10%.',
  },
  {
    q: 'Скільки монтажної піни потрібно на одне вікно?',
    a: 'Периметр монтажного шва (м) × ширина зазору (мм) × глибина (мм) / 1000 = літри піни. Стандартне вікно з периметром 5 м, зазором 30 мм і глибиною 60 мм потребує ~9 л — з побутового балона з виходом 30–45 л запіните 3–4 вікна.',
  },
  {
    q: 'Яка норма витрати ґрунтовки на 1 м²?',
    a: 'Готові акрилові ґрунтовки — 100–200 мл/м² на шар залежно від поглинання основи; бетоноконтакт — 200–350 мл/м². Для пористих основ (газоблок, стара штукатурка) закладайте два шари.',
  },
  {
    q: 'Скільки монтажного клею («рідких цвяхів») у картриджі?',
    a: 'Стандартний картридж 280–310 мл. Джгут діаметром 6 мм — це ~28 мл на метр, тобто одного картриджа вистачає приблизно на 10–11 погонних метрів клейового шва.',
  },
];

export default function CalculatorsPage() {
  const faqLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQ.map(f => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };
  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Головна', item: BASE },
      { '@type': 'ListItem', position: 2, name: 'Калькулятори', item: `${BASE}/calculators` },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd).replace(/</g, '\\u003c') }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd).replace(/</g, '\\u003c') }} />

      <div style={{ background: 'var(--bg-soft)', minHeight: '100vh' }}>
        {/* Hero */}
        <section style={{ background: 'radial-gradient(800px 400px at 90% -10%, rgba(94,234,212,0.14), transparent 60%), linear-gradient(160deg, #0F172A 0%, #1E3A5F 100%)', padding: '52px 0 44px' }}>
          <div className="page-container">
            <nav style={{ fontSize: '13px', color: '#64748B', marginBottom: '20px', display: 'flex', gap: '6px' }}>
              <Link href="/" style={{ color: '#64748B', textDecoration: 'none' }}>Головна</Link>
              <span>/</span>
              <span style={{ color: '#94A3B8' }}>Калькулятори</span>
            </nav>
            <h1 style={{ fontSize: 'clamp(24px, 3.5vw, 38px)', fontWeight: 900, color: '#fff', margin: '0 0 12px', letterSpacing: '-0.5px' }}>
              Будівельні калькулятори витрати
            </h1>
            <p style={{ fontSize: '16px', color: '#94A3B8', lineHeight: 1.7, maxWidth: '640px', margin: 0 }}>
              Скільки герметика на шов, піни на вікна, ґрунтовки на стіни чи клею на монтаж —
              порахуйте за 10 секунд і одразу підберіть матеріал у каталозі.
            </p>
          </div>
        </section>

        {/* Calculators */}
        <section style={{ padding: '40px 0 24px' }}>
          <div className="page-container">
            <CalculatorsClient locale="uk" />
          </div>
        </section>

        {/* SEO / FAQ text */}
        <section style={{ padding: '24px 0 64px' }}>
          <div className="page-container" style={{ maxWidth: '860px' }}>
            <h2 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '20px' }}>
              Як рахуються ці формули
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {FAQ.map(f => (
                <div key={f.q} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '18px 22px' }}>
                  <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 8px' }}>{f.q}</h3>
                  <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.7, margin: 0 }}>{f.a}</p>
                </div>
              ))}
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.7, marginTop: '20px' }}>
              Розрахунки орієнтовні: фактична витрата залежить від рівності основи, температури,
              навичок нанесення та конкретного продукту. Точну норму завжди дивіться на упаковці —
              а якщо сумніваєтесь, напишіть нам, підберемо матеріал і порахуємо разом.
            </p>
          </div>
        </section>
      </div>
      <Footer />
    </>
  );
}

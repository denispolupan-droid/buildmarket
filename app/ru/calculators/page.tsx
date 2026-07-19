import type { Metadata } from 'next';
import Link from 'next/link';
import Footer from '../../components/Footer';
import CalculatorsClient from '../../components/CalculatorsClient';

const BASE = 'https://fixline.com.ua';

export const metadata: Metadata = {
  title: 'Строительные калькуляторы — расход герметика, пены, грунтовки, клея | FIXLINE',
  description: 'Бесплатные калькуляторы расхода строительной химии: сколько картриджей герметика на шов, баллонов пены на окна, литров грунтовки на площадь, клея на монтаж. Расчёт за 10 секунд.',
  keywords: ['калькулятор расхода герметика', 'калькулятор монтажной пены', 'расчет грунтовки на м2', 'расход краски калькулятор', 'сколько герметика нужно на шов', 'калькулятор жидких гвоздей'],
  alternates: { canonical: `${BASE}/ru/calculators`, languages: { 'uk': `${BASE}/calculators`, 'ru': `${BASE}/ru/calculators`, 'x-default': `${BASE}/calculators` } },
  openGraph: {
    title: 'Строительные калькуляторы расхода — FIXLINE',
    description: 'Сколько герметика, пены, грунтовки или клея нужно на вашу задачу — расчёт за 10 секунд.',
    url: `${BASE}/ru/calculators`,
    siteName: 'FIXLINE',
    locale: 'ru_RU',
    type: 'website',
  },
};

const FAQ = [
  {
    q: 'Как рассчитать расход герметика на шов?',
    a: 'Объём в миллилитрах = длина шва (м) × ширина (мм) × глубина (мм). Например, шов 10 м при ширине 8 мм и глубине 6 мм — это 480 мл, то есть 2 картриджа по 300 мл с запасом 10%.',
  },
  {
    q: 'Сколько монтажной пены нужно на одно окно?',
    a: 'Периметр монтажного шва (м) × ширина зазора (мм) × глубина (мм) / 1000 = литры пены. Стандартное окно с периметром 5 м, зазором 30 мм и глубиной 60 мм требует ~9 л — из бытового баллона с выходом 30–45 л запените 3–4 окна.',
  },
  {
    q: 'Какая норма расхода грунтовки на 1 м²?',
    a: 'Готовые акриловые грунтовки — 100–200 мл/м² на слой в зависимости от впитываемости основания; бетоноконтакт — 200–350 мл/м². Для пористых оснований (газоблок, старая штукатурка) закладывайте два слоя.',
  },
  {
    q: 'Сколько монтажного клея («жидких гвоздей») в картридже?',
    a: 'Стандартный картридж 280–310 мл. Жгут диаметром 6 мм — это ~28 мл на метр, то есть одного картриджа хватает примерно на 10–11 погонных метров клеевого шва.',
  },
];

export default function CalculatorsRuPage() {
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
      { '@type': 'ListItem', position: 1, name: 'Главная', item: `${BASE}/ru` },
      { '@type': 'ListItem', position: 2, name: 'Калькуляторы', item: `${BASE}/ru/calculators` },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd).replace(/</g, '\\u003c') }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd).replace(/</g, '\\u003c') }} />

      <div style={{ background: 'var(--bg-soft)', minHeight: '100vh' }}>
        <section style={{ background: 'radial-gradient(800px 400px at 90% -10%, rgba(94,234,212,0.14), transparent 60%), linear-gradient(160deg, #0F172A 0%, #1E3A5F 100%)', padding: '52px 0 44px' }}>
          <div className="page-container">
            <nav style={{ fontSize: '13px', color: '#64748B', marginBottom: '20px', display: 'flex', gap: '6px' }}>
              <Link href="/ru" style={{ color: '#64748B', textDecoration: 'none' }}>Главная</Link>
              <span>/</span>
              <span style={{ color: '#94A3B8' }}>Калькуляторы</span>
            </nav>
            <h1 style={{ fontSize: 'clamp(24px, 3.5vw, 38px)', fontWeight: 900, color: '#fff', margin: '0 0 12px', letterSpacing: '-0.5px' }}>
              Строительные калькуляторы расхода
            </h1>
            <p style={{ fontSize: '16px', color: '#94A3B8', lineHeight: 1.7, maxWidth: '640px', margin: 0 }}>
              Сколько герметика на шов, пены на окна, грунтовки на стены или клея на монтаж —
              посчитайте за 10 секунд и сразу подберите материал в каталоге.
            </p>
          </div>
        </section>

        <section style={{ padding: '40px 0 24px' }}>
          <div className="page-container">
            <CalculatorsClient locale="ru" />
          </div>
        </section>

        <section style={{ padding: '24px 0 64px' }}>
          <div className="page-container" style={{ maxWidth: '860px' }}>
            <h2 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '20px' }}>
              Как считаются эти формулы
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
              Расчёты ориентировочные: фактический расход зависит от ровности основания, температуры,
              навыков нанесения и конкретного продукта. Точную норму всегда смотрите на упаковке —
              а если сомневаетесь, напишите нам: подберём материал и посчитаем вместе.
            </p>
          </div>
        </section>
      </div>
      <Footer />
    </>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';
import {
  Package, RefreshCw, FileText, Truck, ArrowRight,
  ShieldCheck, BarChart2, Headphones, Key,
} from 'lucide-react';
import Footer from '../components/Footer';

export const metadata: Metadata = {
  title: 'Дропшипінг будівельної хімії | FIXLINE',
  description: 'Продавайте будівельну хімію без складу. Актуальний прайс, автоматичний обмін замовленнями, готові ТТН Нової Пошти.',
};

const steps = [
  {
    n: '01',
    icon: Key,
    title: 'Реєстрація та доступ',
    text: 'Зареєструйтесь як дропшипер — ми надамо доступ до каталогу з Вашими особистими цінами та API-ключ для інтеграції.',
  },
  {
    n: '02',
    icon: RefreshCw,
    title: 'Підключення прайс-фіду',
    text: 'Отримуєте посилання на XML/YML-фід із актуальними залишками та цінами. Підключаєте до свого магазину (Prom.ua, Horoshop, OpenCart та ін.).',
  },
  {
    n: '03',
    icon: FileText,
    title: 'Замовлення від Вашого клієнта',
    text: 'Клієнт робить замовлення у Вас. Ви створюєте ТТН у кабінеті Нової Пошти та передаєте нам замовлення разом із готовою етикеткою НП.',
  },
  {
    n: '04',
    icon: Truck,
    title: 'Ми відправляємо',
    text: 'Ми обробляємо замовлення, пакуємо товар та відправляємо напряму Вашому клієнту з готовою етикеткою НП.',
  },
];

const benefits = [
  { icon: BarChart2,   title: 'Актуальний прайс',        text: 'XML/YML-фід оновлюється автоматично. Залишки та ціни завжди актуальні.' },
  { icon: Package,     title: 'Без власного складу',      text: 'Не потрібно закуповувати і зберігати товар — продаєте те, що є у нас.' },
  { icon: ShieldCheck, title: 'Перевірена якість',        text: 'Тільки оригінальна продукція від перевірених постачальників.' },
  { icon: RefreshCw,   title: 'Автоматичний обмін',       text: 'API для передачі замовлень. Мінімум ручної роботи з Вашого боку.' },
  { icon: FileText,    title: 'Готові ТТН',               text: 'Ви самі створюєте ТТН — накладений платіж надходить одразу Вам.' },
  { icon: Headphones,  title: 'Підтримка',                text: 'Персональний менеджер для вирішення питань по замовленнях та інтеграції.' },
];

const faq = [
  {
    q: 'Яка мінімальна кількість замовлень?',
    a: 'Мінімальних обмежень немає. Можна починати з одного замовлення на день.',
  },
  {
    q: 'Як формуються ціни для дропшипера?',
    a: 'Вигідні ціни відразу після реєстрації — без переговорів та очікувань. Зареєструйтесь, отримайте доступ до каталогу та починайте продавати вже сьогодні.',
  },
  {
    q: 'Як передати замовлення, якщо немає своєї системи?',
    a: 'Є ручна форма в особистому кабінеті. Вказуєте SKU, кількість та прикріплюєте готову етикетку НП у форматі PDF — ми одразу друкуємо та відправляємо.',
  },
  {
    q: 'Хто є відправником для клієнта?',
    a: 'Ви створюєте ТТН у своєму кабінеті НП — відправник Ви, гроші з накладеного платежу надходять Вам.',
  },
  {
    q: 'Як вирішується питання повернень?',
    a: 'Повернення проходить через Вас. Ми компенсуємо вартість товару після отримання та перевірки повернення.',
  },
];

export default function DropshipPage() {
  const faqLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faq.map(({ q, a }) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: { '@type': 'Answer', text: a },
    })),
  };

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Головна', item: 'https://fixline.com.ua' },
      { '@type': 'ListItem', position: 2, name: 'Дропшипінг', item: 'https://fixline.com.ua/dropship' },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
      {/* Hero */}
      <section style={{
        background: 'linear-gradient(160deg, #0F172A 0%, #1E3A5F 100%)',
        padding: '64px 0 56px', position: 'relative', overflow: 'hidden',
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
        <div className="page-container" style={{ position: 'relative', zIndex: 1 }}>
          <div className="drop-hero-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '48px', alignItems: 'center' }}>

            {/* Left — text */}
            <div>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: '8px',
                background: 'rgba(72,128,184,0.2)', border: '1px solid rgba(72,128,184,0.4)',
                borderRadius: '20px', padding: '4px 14px', marginBottom: '24px',
              }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#7FB3D3', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                  Дропшипінг
                </span>
              </div>
              <h1 style={{
                fontSize: 'clamp(28px, 4vw, 48px)', fontWeight: 900,
                color: '#fff', lineHeight: 1.15, marginBottom: '20px', letterSpacing: '-0.5px',
              }}>
                Продавайте будівельну хімію без власного складу
              </h1>
              <p style={{ fontSize: '16px', color: '#94A3B8', lineHeight: 1.7, marginBottom: '36px' }}>
                Ми постачаємо — Ви продаєте. Актуальний прайс-фід, автоматичний обмін замовленнями, доставка напряму Вашому клієнту.
              </p>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <Link href="/register?type=dropship" className="btn-primary" style={{
                  height: '48px', padding: '0 28px', borderRadius: '10px',
                  background: '#4880B8', color: '#fff', fontSize: '15px', fontWeight: 700,
                  display: 'inline-flex', alignItems: 'center', gap: '8px',
                }}>
                  Зареєструватись <ArrowRight size={16} />
                </Link>
              </div>
            </div>

            {/* Right — flow diagram */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0', alignItems: 'stretch' }}>
              {[
                { emoji: '👤', label: 'Ваш клієнт',    sub: 'Робить замовлення у Вас',          color: 'rgba(255,255,255,0.08)' },
                { emoji: '🛍️', label: 'Ви',             sub: 'Передаєте замовлення + ТТН',       color: 'rgba(72,128,184,0.2)'   },
                { emoji: '📦', label: 'FIXLINE',        sub: 'Пакуємо та відправляємо',          color: 'rgba(72,128,184,0.2)'   },
                { emoji: '🏠', label: 'Клієнт отримує', sub: 'Доставка від Вашого імені',        color: 'rgba(22,163,74,0.15)'   },
              ].map(({ emoji, label, sub, color }, i, arr) => (
                <div key={label}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '14px',
                    background: color,
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '12px', padding: '14px 18px',
                  }}>
                    <span style={{ fontSize: '24px', flexShrink: 0 }}>{emoji}</span>
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: 700, color: '#F1F5F9' }}>{label}</div>
                      <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '2px' }}>{sub}</div>
                    </div>
                  </div>
                  {i < arr.length - 1 && (
                    <div style={{ display: 'flex', justifyContent: 'center', padding: '6px 0' }}>
                      <svg width="16" height="20" viewBox="0 0 16 20" fill="none">
                        <path d="M8 0 L8 14 M2 10 L8 18 L14 10" stroke="rgba(72,128,184,0.6)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                  )}
                </div>
              ))}
            </div>

          </div>
        </div>
      </section>

      {/* How it works */}
      <section style={{ background: 'var(--bg-soft)', padding: '64px 0' }}>
        <div className="page-container">
          <h2 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '8px', textAlign: 'center' }}>
            Як це працює
          </h2>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', textAlign: 'center', marginBottom: '48px' }}>
            Чотири кроки від реєстрації до першого відправлення
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '24px' }} className="drop-steps">
            {steps.map(({ n, icon: Icon, title, text }) => (
              <div key={n} style={{
                background: 'var(--bg-card)', border: '1px solid var(--border)',
                borderRadius: '16px', padding: '28px 24px',
                display: 'flex', flexDirection: 'column', gap: '16px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{
                    fontSize: '11px', fontWeight: 800, color: '#4880B8',
                    letterSpacing: '0.1em', opacity: 0.6,
                  }}>{n}</span>
                  <div style={{
                    width: '40px', height: '40px', borderRadius: '10px',
                    background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    <Icon size={20} color="#4880B8" strokeWidth={1.75} />
                  </div>
                </div>
                <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>{title}</h3>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section style={{ background: 'var(--bg-card)', padding: '64px 0' }}>
        <div className="page-container">
          <h2 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '40px', textAlign: 'center' }}>
            Що Ви отримуєте
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px' }} className="drop-benefits">
            {benefits.map(({ icon: Icon, title, text }) => (
              <div key={title} style={{
                display: 'flex', gap: '16px', alignItems: 'flex-start',
                background: 'var(--bg-soft)', borderRadius: '14px', padding: '20px',
                border: '1px solid var(--border)',
              }}>
                <div style={{
                  width: '40px', height: '40px', borderRadius: '10px',
                  background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <Icon size={18} color="#4880B8" strokeWidth={2} />
                </div>
                <div>
                  <h3 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px' }}>{title}</h3>
                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>{text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section style={{ background: 'var(--bg-card)', padding: '64px 0' }}>
        <div className="page-container">
          <h2 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '40px', textAlign: 'center' }}>
            Часті питання
          </h2>
          <div style={{ maxWidth: '720px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {faq.map(({ q, a }) => (
              <div key={q} style={{
                background: 'var(--bg-soft)', border: '1px solid var(--border)',
                borderRadius: '12px', padding: '20px 24px',
              }}>
                <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>{q}</div>
                <div style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>{a}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ background: '#1E3059', padding: '56px 0', textAlign: 'center' }}>
        <div className="page-container">
          <h2 style={{ fontSize: '24px', fontWeight: 800, color: '#fff', marginBottom: '12px' }}>
            Готові розпочати?
          </h2>
          <p style={{ fontSize: '14px', color: '#94A3B8', marginBottom: '32px', maxWidth: '480px', margin: '0 auto 32px' }}>
            Зареєструйтесь — отримайте доступ до каталогу та починайте продавати вже сьогодні.
          </p>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/register?type=dropship" className="btn-primary" style={{
              height: '48px', padding: '0 32px', borderRadius: '10px',
              background: '#4880B8', color: '#fff', fontSize: '15px', fontWeight: 700,
              display: 'inline-flex', alignItems: 'center', gap: '8px',
            }}>
              Зареєструватись <ArrowRight size={16} />
            </Link>
            <a href="mailto:drop@fixline.com.ua" className="btn-ghost" style={{
              height: '48px', padding: '0 28px', borderRadius: '10px',
              border: '1.5px solid rgba(255,255,255,0.2)', color: '#E2E8F0',
              fontSize: '15px', fontWeight: 600,
              display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'transparent',
            }}>
              Задати питання
            </a>
          </div>
        </div>
      </section>

      <Footer />
    </>
  );
}

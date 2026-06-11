import type { Metadata } from 'next';
import Link from 'next/link';
import {
  Package, RefreshCw, FileText, Truck, ArrowRight,
  ShieldCheck, BarChart2, Headphones, Wallet, AlertCircle,
  CheckCircle, XCircle, CreditCard, ArrowDownCircle,
} from 'lucide-react';
import Footer from '../components/Footer';

export const metadata: Metadata = {
  title: 'Дропшипінг будівельної хімії',
  description: 'Продавайте будівельну хімію без складу. Баланс-система, автоматичне оформлення замовлень, доставка напряму клієнту від вашого імені по всій Україні.',
  keywords: ['дропшипінг будівельна хімія', 'дропшиппинг строительная химия', 'продавати без складу', 'продавать без склада', 'XML прайс будівельна хімія', 'дропшип Україна'],
  alternates: { canonical: 'https://fixline.com.ua/dropship', languages: { 'uk': 'https://fixline.com.ua/dropship', 'ru': 'https://fixline.com.ua/ru/dropship', 'x-default': 'https://fixline.com.ua/dropship' } },
  openGraph: {
    title: 'Дропшипінг будівельної хімії | FIXLINE',
    description: 'Продавайте будівельну хімію без складу. Баланс-система, автоматичне оформлення замовлень по Україні.',
    url: 'https://fixline.com.ua/dropship',
    siteName: 'FIXLINE',
    locale: 'uk_UA',
    type: 'website',
    images: [{ url: 'https://fixline.com.ua/opengraph-image', width: 1200, height: 630, alt: 'FIXLINE — дропшипінг будівельної хімії' }],
  },
};

const steps = [
  {
    n: '01', icon: Wallet,
    title: 'Реєстрація та поповнення балансу',
    text: 'Реєструєтесь як дропшипер, отримуєте доступ до особистого кабінету з Вашими цінами та поповнюєте баланс — це Ваш робочий рахунок для розрахунків.',
  },
  {
    n: '02', icon: RefreshCw,
    title: 'Підключення прайс-фіду',
    text: 'Отримуєте особисте посилання на XML/YML-фід з актуальними залишками та Вашими цінами. Підключаєте до Prom.ua, Horoshop, OpenCart або будь-якого іншого магазину.',
  },
  {
    n: '03', icon: FileText,
    title: 'Оформлення замовлення в кабінеті',
    text: 'Клієнт замовляє у Вас. Передплату Ви отримуєте самостійно (картка, Monobank тощо). Потім оформлюєте замовлення в кабінеті — вказуєте товари та дані клієнта. Все інше — автоматично.',
  },
  {
    n: '04', icon: Truck,
    title: 'Ми відправляємо та розраховуємось',
    text: 'Ми створюємо ТТН, пакуємо та відправляємо від свого імені. При накладеному платежі кошти надходять нам — ми нараховуємо Ваш заробіток на баланс. При передоплаті — Ваш клієнт вже розрахувався з Вами, ми просто відправляємо.',
  },
];

const benefits = [
  { icon: BarChart2,   title: 'Актуальний прайс',        text: 'XML/YML-фід оновлюється кожні 2 години. Залишки та ціни завжди актуальні.' },
  { icon: Package,     title: 'Без власного складу',      text: 'Не потрібно закуповувати і зберігати товар — продаєте те, що є у нас.' },
  { icon: ShieldCheck, title: 'Перевірена якість',        text: 'Тільки оригінальна продукція від перевірених постачальників.' },
  { icon: RefreshCw,   title: 'Автоматичне оформлення',  text: 'Оформлення замовлення займає 2 хвилини. ТТН та відправку беремо на себе.' },
  { icon: Wallet,      title: 'Прозора фінансова модель', text: 'Зрозумілий баланс, кожна транзакція з поясненням. Ви бачите кожну гривню.' },
  { icon: Headphones,  title: 'Підтримка',                text: 'Персональний менеджер для питань по замовленнях, цінах та інтеграції.' },
];

const faq = [
  {
    q: 'Яка мінімальна сума поповнення балансу?',
    a: 'Мінімальна сума поповнення — 500 грн. Баланс повинен покривати вартість замовлення за Вашою дроп-ціною — без достатнього балансу оформлення замовлення недоступне.',
  },
  {
    q: 'Як формуються мої ціни?',
    a: 'Ви отримуєте особисті дроп-ціни — зазвичай нижчі за роздрібні. Різниця між Вашою ціною продажу клієнту та Вашою закупочною ціною — це Ваш заробіток.',
  },
  {
    q: 'Які способи оплати підтримуються?',
    a: 'Два варіанти: 1) Накладений платіж — клієнт оплачує при отриманні у відділенні НП. Гроші надходять нам, і ми нараховуємо Ваш заробіток на баланс. 2) Передплата — клієнт переказує кошти безпосередньо Вам (Monobank, PrivatBank, картка тощо). Ви самостійно отримуєте оплату від клієнта, а потім оформлюєте замовлення в кабінеті — ми відправляємо без накладеного платежу. У будь-якому випадку Ваша закупочна ціна списується з балансу при оформленні замовлення.',
  },
  {
    q: 'Хто є відправником для мого клієнта?',
    a: 'Ми відправляємо від свого імені (FIXLINE). Це стандартна практика для дропшипінгу — клієнт отримує якісно упакований товар, ми несемо відповідальність за відправку.',
  },
  {
    q: 'Коли я отримую свій заробіток?',
    a: 'Залежить від способу оплати. Накладений платіж: кошти від клієнта надходять нам через НП (зазвичай 3-7 днів), після чого Ваш заробіток нараховується на баланс. Передплата: Ви самостійно отримали кошти від клієнта — ми просто відправляємо, нічого додатково не переказуємо. Ваша закупочна ціна списується з балансу в момент оформлення замовлення.',
  },
  {
    q: 'Що відбувається, якщо клієнт не забрав посилку?',
    a: 'Посилка повертається до нас. Вартість зворотньої доставки списується з Вашого балансу. Закупочна ціна товару повертається на баланс, товар — до нашого каталогу.',
  },
  {
    q: 'Як вивести накопичені кошти?',
    a: 'Два варіанти: 1) Товарний залік — купуєте товар для себе або своїх клієнтів за рахунок балансу. 2) Банківський переказ — заявка в кабінеті, виплата 1 раз на місяць від 500 грн.',
  },
  {
    q: 'Чи є комісія за накладений платіж?',
    a: 'Нова Пошта утримує комісію ~2% за переказ накладеного платежу. Ця комісія списується з Вашого балансу окремим рядком — все прозоро. Для передплатних замовлень ця комісія відсутня.',
  },
  {
    q: 'Як передати замовлення, якщо немає своєї системи?',
    a: 'В особистому кабінеті є зручна форма оформлення: вказуєте товари, кількість, дані клієнта та спосіб оплати — ми все робимо автоматично. Також доступне завантаження замовлень через Excel-файл для пакетного оформлення.',
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
        <div style={{ position: 'absolute', top: '-120px', right: '-80px', width: '500px', height: '500px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(14,165,233,0.18) 0%, transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: '-100px', left: '-60px', width: '420px', height: '420px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(72,128,184,0.2) 0%, transparent 70%)', pointerEvents: 'none' }} />
        <div className="page-container" style={{ position: 'relative', zIndex: 1 }}>
          <div className="drop-hero-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '48px', alignItems: 'center' }}>
            <div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'rgba(72,128,184,0.2)', border: '1px solid rgba(72,128,184,0.4)', borderRadius: '20px', padding: '4px 14px', marginBottom: '24px' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#7FB3D3', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Дропшипінг</span>
              </div>
              <h1 style={{ fontSize: 'clamp(28px, 4vw, 48px)', fontWeight: 900, color: '#fff', lineHeight: 1.15, marginBottom: '20px', letterSpacing: '-0.5px' }}>
                Продавайте будівельну хімію без власного складу
              </h1>
              <p style={{ fontSize: '16px', color: '#94A3B8', lineHeight: 1.7, marginBottom: '36px' }}>
                Оформлюйте замовлення в особистому кабінеті — ми відправляємо, а Ваш заробіток автоматично надходить на баланс.
              </p>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <Link href="/register?type=dropship" style={{ height: '48px', padding: '0 28px', borderRadius: '10px', background: '#4880B8', color: '#fff', fontSize: '15px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '8px', textDecoration: 'none' }}>
                  Зареєструватись <ArrowRight size={16} />
                </Link>
                <Link href="/cabinet" style={{ height: '48px', padding: '0 22px', borderRadius: '10px', border: '1.5px solid rgba(255,255,255,0.2)', color: '#E2E8F0', fontSize: '14px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '8px', textDecoration: 'none', background: 'transparent' }}>
                  Вже партнер → Кабінет
                </Link>
              </div>
            </div>

            {/* Flow diagram */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0', alignItems: 'stretch' }}>
              {[
                { emoji: '👤', label: 'Ваш клієнт',     sub: 'Замовляє у Вас — платить Вам (передплата) або нам при отриманні (НП)', color: 'rgba(255,255,255,0.08)' },
                { emoji: '🛍️', label: 'Ви',              sub: 'Оформлюєте замовлення в кабінеті (2 хв)',  color: 'rgba(72,128,184,0.2)' },
                { emoji: '📦', label: 'FIXLINE',          sub: 'Створює ТТН, пакує і відправляє',          color: 'rgba(72,128,184,0.2)' },
                { emoji: '💰', label: 'Ваш заробіток',   sub: 'Автоматично нараховується на баланс',       color: 'rgba(22,163,74,0.15)' },
              ].map(({ emoji, label, sub, color }, i, arr) => (
                <div key={label}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px', background: color, border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '14px 18px' }}>
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
          <h2 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '8px', textAlign: 'center' }}>Як це працює</h2>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', textAlign: 'center', marginBottom: '48px' }}>Чотири кроки від реєстрації до першого заробітку</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '24px' }} className="drop-steps">
            {steps.map(({ n, icon: Icon, title, text }) => (
              <div key={n} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '28px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 800, color: '#4880B8', letterSpacing: '0.1em', opacity: 0.6 }}>{n}</span>
                  <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
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

      {/* Financial model — detailed */}
      <section style={{ background: 'var(--bg-card)', padding: '64px 0' }}>
        <div className="page-container">
          <h2 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '8px', textAlign: 'center' }}>
            Фінансова модель
          </h2>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', textAlign: 'center', marginBottom: '48px' }}>
            Прозора система балансу — Ви бачите кожну гривню
          </p>

          {/* Example calculation */}
          <div style={{ maxWidth: '820px', margin: '0 auto 48px', background: 'var(--bg-soft)', border: '1px solid var(--border)', borderRadius: '16px', padding: '32px' }}>
            <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '20px' }}>
              Приклад розрахунку
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px' }} className="drop-example">
              <div>
                <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px', fontWeight: 600 }}>Ваші умови</div>
                {[
                  ['Ваша ціна для клієнта',    '250 грн'],
                  ['Ваша закупочна ціна',      '180 грн'],
                  ['Ваш заробіток до комісій', '70 грн'],
                ].map(([label, val]) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border-light)' }}>
                    <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>{label}</span>
                    <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>{val}</span>
                  </div>
                ))}
              </div>
              <div>
                <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px', fontWeight: 600 }}>Рух коштів</div>
                {[
                  { label: 'З вашого балансу (закупочна)', val: '−180 грн', color: '#DC2626' },
                  { label: 'Клієнт оплатив НП', val: '+250 грн', color: '#15803D' },
                  { label: 'Комісія НП (~2%)', val: '−5 грн', color: '#B45309' },
                  { label: 'Ваш чистий заробіток', val: '+65 грн', color: '#15803D', bold: true },
                ].map(({ label, val, color, bold }) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border-light)' }}>
                    <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>{label}</span>
                    <span style={{ fontSize: bold ? '16px' : '14px', fontWeight: bold ? 800 : 700, color }}>{val}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Balance rules */}
          <div style={{ maxWidth: '820px', margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }} className="drop-rules">
            {[
              {
                icon: CreditCard, color: '#4880B8', bg: '#EFF6FF',
                title: 'Поповнення балансу',
                items: [
                  'Мінімальне поповнення: 500 грн',
                  'Банківський переказ на рахунок FIXLINE',
                  'Баланс має покривати закупочну ціну замовлення',
                  'Без балансу — оформлення замовлення недоступне',
                ],
              },
              {
                icon: CheckCircle, color: '#15803D', bg: '#F0FDF4',
                title: 'Після доставки',
                items: [
                  'Накладений платіж: клієнт сплачує НП при отриманні → кошти надходять нам → Ваш заробіток на баланс (3-7 днів)',
                  'Передплата: Ви вже отримали кошти від клієнта → ми просто відправляємо → закупочна ціна списується з балансу',
                  'Все відображається в розділі "Мої транзакції"',
                ],
              },
              {
                icon: XCircle, color: '#DC2626', bg: '#FEF2F2',
                title: 'Якщо клієнт не забрав',
                items: [
                  'Посилка повертається до нас',
                  'Вартість зворотньої доставки списується з Вашого балансу',
                  'Закупочна ціна повертається на баланс',
                  'Товар повертається в наш каталог',
                ],
              },
              {
                icon: ArrowDownCircle, color: '#6366F1', bg: '#EEF2FF',
                title: 'Виведення коштів',
                items: [
                  'Товарний залік: купуєте товар за рахунок балансу',
                  'Виплата: заявка в кабінеті, 1 раз на місяць від 500 грн',
                  'Банківський переказ протягом 3 робочих днів',
                  'Комісія за виведення: відсутня',
                ],
              },
            ].map(({ icon: Icon, color, bg, title, items }) => (
              <div key={title} style={{ background: 'var(--bg-soft)', border: '1px solid var(--border)', borderRadius: '14px', padding: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                  <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon size={18} color={color} />
                  </div>
                  <h3 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>{title}</h3>
                </div>
                <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {items.map(item => (
                    <li key={item} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                      <span style={{ color, flexShrink: 0, marginTop: '2px' }}>·</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section style={{ background: 'var(--bg-soft)', padding: '64px 0' }}>
        <div className="page-container">
          <h2 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '40px', textAlign: 'center' }}>Що ви отримуєте</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px' }} className="drop-benefits">
            {benefits.map(({ icon: Icon, title, text }) => (
              <div key={title} style={{ display: 'flex', gap: '16px', alignItems: 'flex-start', background: 'var(--bg-card)', borderRadius: '14px', padding: '20px', border: '1px solid var(--border)' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
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
          <h2 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '40px', textAlign: 'center' }}>Часті питання</h2>
          <div style={{ maxWidth: '720px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {faq.map(({ q, a }) => (
              <div key={q} style={{ background: 'var(--bg-soft)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px 24px' }}>
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
          <h2 style={{ fontSize: '24px', fontWeight: 800, color: '#fff', marginBottom: '12px' }}>Готові розпочати?</h2>
          <p style={{ fontSize: '14px', color: '#94A3B8', marginBottom: '32px', maxWidth: '480px', margin: '0 auto 32px' }}>
            Зареєструйтесь — отримайте доступ до особистого кабінету, каталогу з дроп-цінами та XML-фіду.
          </p>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/register?type=dropship" style={{
              height: '48px', padding: '0 32px', borderRadius: '10px',
              background: '#4880B8', color: '#fff', fontSize: '15px', fontWeight: 700,
              display: 'inline-flex', alignItems: 'center', gap: '8px', textDecoration: 'none',
            }}>
              Зареєструватись <ArrowRight size={16} />
            </Link>
            <Link href="/cabinet" style={{
              height: '48px', padding: '0 28px', borderRadius: '10px',
              border: '1.5px solid rgba(255,255,255,0.2)', color: '#E2E8F0',
              fontSize: '15px', fontWeight: 600,
              display: 'inline-flex', alignItems: 'center', gap: '8px',
              background: 'transparent', textDecoration: 'none',
            }}>
              Вже партнер → Кабінет
            </Link>
            <Link href="/contacts" style={{
              height: '48px', padding: '0 28px', borderRadius: '10px',
              border: '1.5px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)',
              fontSize: '15px', fontWeight: 500,
              display: 'inline-flex', alignItems: 'center', gap: '8px',
              background: 'transparent', textDecoration: 'none',
            }}>
              Задати питання
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </>
  );
}

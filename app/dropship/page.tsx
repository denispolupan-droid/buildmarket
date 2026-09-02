import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import {
  Package, RefreshCw, FileText, Truck, ArrowRight, ShieldCheck, BarChart2,
  Headphones, Wallet, CheckCircle, XCircle, CreditCard, ArrowDownCircle, Clock,
} from 'lucide-react';
import Footer from '../components/Footer';
import Reveal from '../components/Reveal';
import ModelCompare from '../components/ModelCompare';
import { mergeVisibleBrands } from '../../lib/brands';
import { getBrandLogosCached, getVisibleBrandLogosCached, getBrandsCached } from '../../lib/supabase';

const BASE = 'https://fixline.com.ua';

export const metadata: Metadata = {
  title: 'Дропшипінг будівельної хімії',
  description: 'Продавайте будівельну хімію без складу. Баланс-система, автоматичне оформлення замовлень, доставка напряму клієнту від вашого імені по всій Україні.',
  keywords: ['дропшипінг будівельна хімія', 'дропшиппинг строительная химия', 'продавати без складу', 'продавать без склада', 'XML прайс будівельна хімія', 'дропшип Україна'],
  alternates: { canonical: `${BASE}/dropship`, languages: { uk: `${BASE}/dropship`, ru: `${BASE}/ru/dropship`, 'x-default': `${BASE}/dropship` } },
  openGraph: {
    title: 'Дропшипінг будівельної хімії | FIXLINE',
    description: 'Продавайте будівельну хімію без складу. Баланс-система, автоматичне оформлення замовлень по Україні.',
    url: `${BASE}/dropship`,
    siteName: 'FIXLINE',
    locale: 'uk_UA',
    type: 'website',
    images: [{ url: `${BASE}/opengraph-image`, width: 1200, height: 630, alt: 'FIXLINE — дропшипінг будівельної хімії' }],
  },
};

const flow = [
  { emoji: '👤', label: 'Ваш клієнт',    sub: 'Замовляє у Вас — платить Вам (передплата) або нам при отриманні (НП)' },
  { emoji: '🛍️', label: 'Ви',            sub: 'Оформлюєте замовлення в кабінеті (2 хв)' },
  { emoji: '📦', label: 'FIXLINE',       sub: 'Створює ТТН, пакує і відправляє' },
  { emoji: '💰', label: 'Ваш заробіток', sub: 'Автоматично нараховується на баланс' },
];

const stats = [
  { icon: Wallet,    stat: '500 ₴',  label: 'мінімальне поповнення', text: 'Баланс — Ваш робочий рахунок для розрахунків' },
  { icon: RefreshCw, stat: '2 год',  label: 'оновлення фіду',        text: 'XML/YML із залишками та Вашими цінами' },
  { icon: Package,   stat: '700+',   label: 'позицій у прайсі',      text: 'Будівельна хімія та витратні матеріали' },
  { icon: Clock,     stat: '2 хв',   label: 'на оформлення',         text: 'ТТН і відправку беремо на себе' },
];

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

const rules = [
  {
    icon: CreditCard, color: 'var(--brand-blue)', bg: 'var(--brand-blue-light)',
    title: 'Поповнення балансу',
    items: [
      'Мінімальне поповнення: 500 грн',
      'Мінімальна сума замовлення: 300 грн',
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

export default async function DropshipPage() {
  const [brandLogos, visibleBrandLogos] = await Promise.all([
    getBrandLogosCached(),
    getVisibleBrandLogosCached(),
  ]);
  // Без обрізання до 12: заголовок обіцяє «Бренди, які ви продаєте», а показувати
  // дропшиперу неповний асортимент — вводити в оману. На /opt той самий блок і
  // так виводить усі бренди.
  const brandTiles = mergeVisibleBrands(visibleBrandLogos, await getBrandsCached());

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
      { '@type': 'ListItem', position: 1, name: 'Головна', item: BASE },
      { '@type': 'ListItem', position: 2, name: 'Дропшипінг', item: `${BASE}/dropship` },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd).replace(/</g, '\\u003c') }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd).replace(/</g, '\\u003c') }} />

      <div style={{ background: 'var(--bg-soft)' }}>

        {/* ===== Hero ===== */}
        <section style={{
          background: 'radial-gradient(1000px 520px at 88% -10%, rgba(94,234,212,0.16), transparent 60%), radial-gradient(800px 480px at -5% 110%, rgba(72,128,184,0.35), transparent 60%), linear-gradient(160deg, #0F172A 0%, #1E3A5F 55%, #123B54 100%)',
          padding: '72px 0',
        }}>
          <div className="page-container">
            <div className="drop-hero-grid" style={{ display: 'grid', gridTemplateColumns: '1.15fr 1fr', gap: '56px', alignItems: 'center' }}>
              <div>
                <Reveal>
                  <span className="eyebrow on-dark">Дропшипінг</span>
                  {/* Заголовок довший за /opt — менший максимум кегля, щоб «хімію»
                      не лишалася сиротою на власному рядку. */}
                  <h1 style={{ fontSize: 'clamp(28px, 3.6vw, 44px)', fontWeight: 900, color: '#fff', lineHeight: 1.18, margin: '14px 0 20px', letterSpacing: '-0.8px' }}>
                    Продавайте будівельну хімію<br />
                    <span className="grad-text">без власного складу</span>
                  </h1>
                </Reveal>
                <Reveal delay={90}>
                  <p style={{ fontSize: '17px', color: '#94A3B8', lineHeight: 1.7, marginBottom: '32px', maxWidth: '520px' }}>
                    Оформлюєте замовлення в особистому кабінеті — ми створюємо ТТН, пакуємо
                    й відправляємо, а Ваш заробіток автоматично надходить на баланс.
                  </p>
                  <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                    <Link href="/register?type=dropship" style={{ height: '50px', padding: '0 30px', borderRadius: '12px', background: 'var(--brand-blue)', color: '#fff', fontSize: '15px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '8px', textDecoration: 'none', boxShadow: 'var(--brand-shadow)' }}>
                      Зареєструватись <ArrowRight size={16} />
                    </Link>
                    <Link href="/cabinet" style={{ height: '50px', padding: '0 24px', borderRadius: '12px', border: '1.5px solid rgba(255,255,255,0.2)', color: '#E2E8F0', fontSize: '14px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '8px', textDecoration: 'none', background: 'rgba(255,255,255,0.04)' }}>
                      Вже партнер → Кабінет
                    </Link>
                  </div>
                </Reveal>
              </div>

              {/* Схема потоку */}
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {flow.map(({ emoji, label, sub }, i) => (
                  <Reveal key={label} delay={140 + i * 90}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: '16px', padding: '15px 18px', backdropFilter: 'blur(6px)' }}>
                      <span style={{ fontSize: '24px', flexShrink: 0 }}>{emoji}</span>
                      <div>
                        <div style={{ fontSize: '14px', fontWeight: 700, color: '#F1F5F9' }}>{label}</div>
                        <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '3px', lineHeight: 1.5 }}>{sub}</div>
                      </div>
                    </div>
                    {i < flow.length - 1 && (
                      <div style={{ display: 'flex', justifyContent: 'center', padding: '6px 0' }}>
                        <svg width="16" height="20" viewBox="0 0 16 20" fill="none">
                          <path d="M8 0 L8 14 M2 10 L8 18 L14 10" stroke="rgba(94,234,212,0.55)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </div>
                    )}
                  </Reveal>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ===== Цифри ===== */}
        <section style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border)', padding: '52px 0' }}>
          <div className="page-container">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '28px' }} className="opt-stats">
              {stats.map(({ icon: Icon, stat, label, text }, i) => (
                <Reveal key={label} delay={i * 90}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ width: '46px', height: '46px', borderRadius: '12px', background: 'var(--brand-blue-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                      <Icon size={21} color="var(--brand-blue)" strokeWidth={2} />
                    </div>
                    <div style={{ fontSize: 'clamp(24px, 3vw, 32px)', fontWeight: 900, color: 'var(--text-primary)', lineHeight: 1, letterSpacing: '-0.5px' }}>{stat}</div>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', margin: '6px 0' }}>{label}</div>
                    <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>{text}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ===== Як це працює ===== */}
        <section style={{ background: 'var(--bg-soft)', padding: '72px 0' }}>
          <div className="page-container">
            <Reveal>
              <div style={{ textAlign: 'center', maxWidth: '620px', margin: '0 auto 48px' }}>
                <span className="eyebrow">Як це працює</span>
                <h2 style={{ fontSize: 'clamp(24px, 3vw, 34px)', fontWeight: 900, color: 'var(--text-primary)', lineHeight: 1.3, margin: '12px 0 0', letterSpacing: '-0.5px' }}>
                  Чотири кроки від реєстрації до першого заробітку
                </h2>
              </div>
            </Reveal>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px' }} className="drop-steps">
              {steps.map(({ n, icon: Icon, title, text }, i) => (
                <Reveal key={n} delay={i * 90}>
                  <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '20px', padding: '30px 26px', display: 'flex', flexDirection: 'column', gap: '14px', height: '100%' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'var(--brand-blue-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Icon size={21} color="var(--brand-blue)" strokeWidth={1.75} />
                      </div>
                      <span style={{ fontSize: '28px', fontWeight: 900, color: 'var(--text-primary)', opacity: 0.10, lineHeight: 1, marginLeft: 'auto' }}>{n}</span>
                    </div>
                    <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>{title}</h3>
                    <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>{text}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ===== Фінансова модель ===== */}
        <section style={{ background: 'var(--bg-card)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: '72px 0' }}>
          <div className="page-container">
            <Reveal>
              <div style={{ textAlign: 'center', maxWidth: '620px', margin: '0 auto 44px' }}>
                <span className="eyebrow alt">Фінансова модель</span>
                <h2 style={{ fontSize: 'clamp(24px, 3vw, 34px)', fontWeight: 900, color: 'var(--text-primary)', lineHeight: 1.3, margin: '12px 0 0', letterSpacing: '-0.5px' }}>
                  Прозорий баланс — Ви бачите кожну гривню
                </h2>
              </div>
            </Reveal>

            <Reveal delay={100}>
              <div style={{ maxWidth: '860px', margin: '0 auto 44px', background: 'var(--bg-soft)', border: '1px solid var(--border)', borderRadius: '20px', padding: '34px' }}>
                <div className="eyebrow" style={{ color: 'var(--text-muted)', marginBottom: '22px' }}>Приклад розрахунку</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px' }} className="drop-example">
                  <div>
                    <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '14px', fontWeight: 700 }}>Ваші умови</div>
                    {[
                      ['Ваша ціна для клієнта',    '250 грн'],
                      ['Ваша закупочна ціна',      '180 грн'],
                      ['Ваш заробіток до комісій', '70 грн'],
                    ].map(([label, val]) => (
                      <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '11px 0', borderBottom: '1px solid var(--border-light)' }}>
                        <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>{label}</span>
                        <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>{val}</span>
                      </div>
                    ))}
                  </div>
                  <div>
                    <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '14px', fontWeight: 700 }}>Рух коштів</div>
                    {[
                      { label: 'З вашого балансу (закупочна)', val: '−180 грн', color: '#DC2626' },
                      { label: 'Клієнт оплатив НП',            val: '+250 грн', color: '#15803D' },
                      { label: 'Комісія НП (~2%)',             val: '−5 грн',   color: '#B45309' },
                      { label: 'Ваш чистий заробіток',         val: '+65 грн',  color: '#15803D', bold: true },
                    ].map(({ label, val, color, bold }) => (
                      <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '11px 0', borderBottom: '1px solid var(--border-light)' }}>
                        <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>{label}</span>
                        <span style={{ fontSize: bold ? '17px' : '14px', fontWeight: bold ? 900 : 700, color }}>{val}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </Reveal>

            <div style={{ maxWidth: '860px', margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }} className="drop-rules">
              {rules.map(({ icon: Icon, color, bg, title, items }, i) => (
                <Reveal key={title} delay={i * 80}>
                  <div style={{ background: 'var(--bg-soft)', border: '1px solid var(--border)', borderRadius: '18px', padding: '26px', height: '100%' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                      <div style={{ width: '40px', height: '40px', borderRadius: '11px', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Icon size={19} color={color} strokeWidth={1.75} />
                      </div>
                      <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>{title}</h3>
                    </div>
                    <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '9px' }}>
                      {items.map(item => (
                        <li key={item} style={{ display: 'flex', gap: '9px', alignItems: 'flex-start', fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                          <span style={{ color, flexShrink: 0, fontWeight: 900, marginTop: '-1px' }}>·</span>
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ===== Порівняння моделей ===== */}
        <section style={{ background: 'var(--bg-soft)', padding: '72px 0' }}>
          <div className="page-container">
            <Reveal>
              <div style={{ textAlign: 'center', maxWidth: '620px', margin: '0 auto 40px' }}>
                <span className="eyebrow">Що обрати</span>
                <h2 style={{ fontSize: 'clamp(24px, 3vw, 34px)', fontWeight: 900, color: 'var(--text-primary)', lineHeight: 1.3, margin: '12px 0 0', letterSpacing: '-0.5px' }}>
                  Роздріб, опт чи дропшипінг
                </h2>
              </div>
            </Reveal>
            <Reveal delay={100}>
              <ModelCompare lang="uk" highlight="drop" />
            </Reveal>
            <Reveal delay={160}>
              <p style={{ textAlign: 'center', fontSize: '14px', color: 'var(--text-secondary)', margin: '28px 0 0' }}>
                Готові викуповувати товар на свій склад?{' '}
                <Link href="/opt" style={{ color: 'var(--brand-blue)', fontWeight: 700, textDecoration: 'none' }}>
                  Умови опту →
                </Link>
              </p>
            </Reveal>
          </div>
        </section>

        {/* ===== Що ви отримуєте ===== */}
        <section style={{ background: 'var(--bg-card)', borderTop: '1px solid var(--border)', padding: '72px 0' }}>
          <div className="page-container">
            <Reveal>
              <div style={{ textAlign: 'center', maxWidth: '620px', margin: '0 auto 48px' }}>
                <span className="eyebrow alt">Умови роботи</span>
                <h2 style={{ fontSize: 'clamp(24px, 3vw, 34px)', fontWeight: 900, color: 'var(--text-primary)', lineHeight: 1.3, margin: '12px 0 0', letterSpacing: '-0.5px' }}>
                  Що ви отримуєте
                </h2>
              </div>
            </Reveal>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px' }} className="drop-benefits">
              {benefits.map(({ icon: Icon, title, text }, i) => (
                <Reveal key={title} delay={i * 70}>
                  <div style={{ background: 'var(--bg-soft)', border: '1px solid var(--border)', borderRadius: '18px', padding: '26px', height: '100%' }}>
                    <div style={{ width: '42px', height: '42px', borderRadius: '11px', background: 'var(--brand-blue-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
                      <Icon size={20} color="var(--brand-blue)" strokeWidth={1.75} />
                    </div>
                    <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 8px' }}>{title}</h3>
                    <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.65, margin: 0 }}>{text}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ===== Бренди ===== */}
        {brandTiles.length > 0 && (
          <section style={{ background: 'var(--bg-soft)', padding: '64px 0' }}>
            <div className="page-container">
              <Reveal>
                <div style={{ textAlign: 'center', maxWidth: '620px', margin: '0 auto 36px' }}>
                  <span className="eyebrow alt">Асортимент</span>
                  <h2 style={{ fontSize: 'clamp(22px, 2.6vw, 30px)', fontWeight: 900, color: 'var(--text-primary)', lineHeight: 1.3, margin: '12px 0 0', letterSpacing: '-0.5px' }}>
                    Бренди, які ви продаєте
                  </h2>
                </div>
              </Reveal>
              <Reveal delay={100}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '12px' }} className="opt-brands">
                  {brandTiles.map(({ name, logo, href, color, style }) => {
                    const logoSrc = brandLogos[name.toUpperCase()] ?? logo;
                    return (
                      <Link key={name} href={href} style={{
                        background: 'var(--bg-card)', border: '1px solid var(--border)',
                        borderRadius: '12px', padding: '12px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        aspectRatio: '3/2', textDecoration: 'none',
                      }}>
                        {logoSrc
                          ? <Image src={logoSrc} alt={name} width={160} height={80} style={{ objectFit: 'contain', width: '100%', height: '100%' }} />
                          : <span style={{ color, textAlign: 'center', ...style }}>{name}</span>}
                      </Link>
                    );
                  })}
                </div>
              </Reveal>
            </div>
          </section>
        )}

        {/* ===== FAQ ===== */}
        <section style={{ background: 'var(--bg-card)', borderTop: '1px solid var(--border)', padding: '72px 0' }}>
          <div className="page-container">
            <Reveal>
              <h2 style={{ fontSize: 'clamp(24px, 3vw, 32px)', fontWeight: 900, color: 'var(--text-primary)', marginBottom: '36px', textAlign: 'center', letterSpacing: '-0.5px' }}>
                Часті питання
              </h2>
            </Reveal>
            <div className="faq-accordion" style={{ maxWidth: '820px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {faq.map(({ q, a }, i) => (
                <Reveal key={q} delay={i * 40}>
                  <details style={{ background: 'var(--bg-soft)', border: '1px solid var(--border)', borderRadius: '14px', padding: '18px 22px' }}>
                    <summary style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', cursor: 'pointer', listStyle: 'none' }}>{q}</summary>
                    <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.7, margin: '12px 0 0' }}>{a}</p>
                  </details>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ===== CTA ===== */}
        <section style={{
          background: 'radial-gradient(900px 450px at 50% -20%, rgba(72,128,184,0.30), transparent 65%), radial-gradient(700px 400px at 95% 110%, rgba(94,234,212,0.10), transparent 60%), linear-gradient(160deg, #0F172A 0%, #1E3059 100%)',
          padding: '72px 0',
        }}>
          <div className="page-container" style={{ textAlign: 'center' }}>
            <Reveal>
              <h2 style={{ fontSize: 'clamp(24px, 3.4vw, 36px)', fontWeight: 900, color: '#fff', margin: '0 0 14px', letterSpacing: '-0.5px', lineHeight: 1.25 }}>
                Готові <span className="grad-text">розпочати</span>?
              </h2>
              <p style={{ fontSize: '16px', color: '#94A3B8', margin: '0 auto 32px', maxWidth: '520px', lineHeight: 1.7 }}>
                Зареєструйтесь — отримайте доступ до особистого кабінету, каталогу з дроп-цінами та XML-фіду.
              </p>
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
                <Link href="/register?type=dropship" style={{ height: '50px', padding: '0 32px', borderRadius: '12px', background: 'var(--brand-blue)', color: '#fff', fontSize: '15px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '8px', textDecoration: 'none', boxShadow: 'var(--brand-shadow)' }}>
                  Зареєструватись <ArrowRight size={16} />
                </Link>
                <Link href="/cabinet" style={{ height: '50px', padding: '0 28px', borderRadius: '12px', border: '1.5px solid rgba(255,255,255,0.18)', color: '#E2E8F0', fontSize: '15px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.04)', textDecoration: 'none' }}>
                  Вже партнер → Кабінет
                </Link>
                <Link href="/contacts" style={{ height: '50px', padding: '0 28px', borderRadius: '12px', border: '1.5px solid rgba(255,255,255,0.10)', color: 'rgba(255,255,255,0.55)', fontSize: '15px', fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'transparent', textDecoration: 'none' }}>
                  Задати питання
                </Link>
              </div>
            </Reveal>
          </div>
        </section>
      </div>

      <Footer />
    </>
  );
}

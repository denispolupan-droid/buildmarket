import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import Footer from '../components/Footer';
import Reveal from '../components/Reveal';
import { ShieldCheck, Users, Package, Award, X, Check, Zap, Eye, Cpu, TrendingUp, Gauge, Smartphone, Bot, CreditCard, Plug, FileText, Truck, PlayCircle, Calculator, RefreshCw, ClipboardList, Layers } from 'lucide-react';
import { mergeVisibleBrands } from '../../lib/brands';
import { getBrandLogosCached, getVisibleBrandLogosCached } from '../../lib/supabase';

export const metadata: Metadata = {
  title: 'Про компанію FIXLINE — цифрова платформа будівельних рішень',
  description: 'FIXLINE — цифрова платформа будівельних рішень: герметики, клеї, монтажні піни, ґрунтовки від перевірених виробників. B2B-кабінет, онлайн-залишки, доставка по Україні.',
  keywords: ['про компанію FIXLINE', 'постачальник будівельної хімії', 'цифрова платформа будівельних рішень', 'оптова будівельна хімія', 'герметики оптом постачальник', 'Харків будівельна хімія'],
  alternates: { canonical: 'https://fixline.com.ua/about', languages: { 'uk': 'https://fixline.com.ua/about', 'ru': 'https://fixline.com.ua/ru/about', 'x-default': 'https://fixline.com.ua/about' } },
  openGraph: {
    title: 'Про компанію FIXLINE',
    description: 'Цифрова платформа будівельних рішень. Ми робимо закупівлю матеріалів такою ж простою, як виклик таксі.',
    url: 'https://fixline.com.ua/about',
    siteName: 'FIXLINE',
    locale: 'uk_UA',
    type: 'website',
    images: [{ url: 'https://fixline.com.ua/opengraph-image', width: 1200, height: 630, alt: 'FIXLINE — будівельна хімія' }],
  },
};

const pains = [
  'Пошук по десятках сайтів',
  'Кілька постачальників на один об’єкт',
  'Різні ціни щотижня',
  'Ніхто не знає залишків',
  'Проблеми з рахунками й документами',
  'Втрачені години та дні',
];

const dayTasks = [
  { icon: Package,       text: 'Замовити піну' },
  { icon: Layers,        text: 'Перевірити залишки' },
  { icon: FileText,      text: 'Отримати рахунок' },
  { icon: ShieldCheck,   text: 'Завантажити сертифікат' },
  { icon: Award,         text: 'Оформити гарантію' },
  { icon: Truck,         text: 'Викликати доставку' },
  { icon: Calculator,    text: 'Дізнатися витрату клею' },
  { icon: RefreshCw,     text: 'Підібрати аналог герметика' },
  { icon: PlayCircle,    text: 'Подивитися відео застосування' },
  { icon: ClipboardList, text: 'Закрити об’єкт повністю' },
];

const beliefs = [
  'Технології мають економити час',
  'Закупівля матеріалів має займати хвилини, а не дні',
  'Інформація має бути прозорою: ціни, залишки, документи',
  'Клієнт не повинен шукати відповіді — сервіс має передбачати питання',
];

const principles = [
  { icon: Gauge,      title: 'Швидкість',   text: 'Кожен процес має бути швидшим, ніж учора. Якщо функція вповільнює клієнта — вона не виходить.' },
  { icon: Zap,        title: 'Простота',    text: 'Ми прибираємо складність з будівельного бізнесу. Якщо потрібно пояснювати — спрощуємо.' },
  { icon: Eye,        title: 'Прозорість',  text: 'Жодних прихованих умов. Ціна, залишок і строк видно до замовлення, а не після.' },
  { icon: Cpu,        title: 'Технології',  text: 'Автоматизуємо все, що можна автоматизувати. Ручна операція для нас — це баг.' },
  { icon: TrendingUp, title: 'Розвиток',    text: 'Сервіс вдосконалюється постійно. «Працює — не чіпай» — це не про нас.' },
];

const ecosystem = [
  { icon: Users,      title: 'B2B-кабінет партнера',        status: 'вже працює',  live: true },
  { icon: Plug,       title: 'XML/YML-фіди для дропшиперів', status: 'вже працює',  live: true },
  { icon: Layers,     title: 'Онлайн-залишки та ціни',       status: 'вже працює',  live: true },
  { icon: FileText,   title: 'Рахунки й документи онлайн',   status: 'вже працює',  live: true },
  { icon: Cpu,        title: 'API для інтеграцій',           status: 'будуємо',     live: false },
  { icon: Smartphone, title: 'Мобільний застосунок',         status: 'попереду',    live: false },
  { icon: Bot,        title: 'ШІ-помічник підбору матеріалів', status: 'попереду',  live: false },
  { icon: CreditCard, title: 'Відстрочка платежу для партнерів', status: 'попереду', live: false },
];

const stats = [
  { icon: Award,       stat: '10+',   label: 'років на ринку',        text: 'Надійний постачальник з підтвердженою репутацією серед дилерів та підрядників.' },
  { icon: Users,       stat: '500+',  label: 'активних клієнтів',     text: 'B2B партнери по всій Україні: будівельні магазини, підрядники, дропшипери.' },
  { icon: Package,     stat: '1000+', label: 'артикулів',             text: 'Широкий асортимент у наявності на складі з постійним поповненням.' },
  { icon: ShieldCheck, stat: '100%',  label: 'сертифікована продукція', text: 'Тільки оригінальні товари з документами якості та технічними паспортами.' },
];

export default async function AboutPage() {
  const brandLogos = await getBrandLogosCached();
  const visibleBrandLogos = await getVisibleBrandLogosCached();
  const brandTiles = mergeVisibleBrands(visibleBrandLogos);
  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Головна', item: 'https://fixline.com.ua' },
      { '@type': 'ListItem', position: 2, name: 'Про компанію', item: 'https://fixline.com.ua/about' },
    ],
  };

  const orgLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'FIXLINE',
    url: 'https://fixline.com.ua',
    logo: 'https://fixline.com.ua/fixline-logo.png',
    description: 'Цифрова платформа будівельних рішень: герметики, монтажні піни, клеї, ґрунтовки оптом і в роздріб.',
    address: {
      '@type': 'PostalAddress',
      addressLocality: 'Харків',
      addressCountry: 'UA',
    },
    contactPoint: {
      '@type': 'ContactPoint',
      telephone: '+380991997788',
      email: 'info@fixline.com.ua',
      contactType: 'sales',
      availableLanguage: ['Ukrainian', 'Russian'],
    },
  };

  const gradientText = {
    background: 'linear-gradient(135deg, #93C5FD 0%, #5EEAD4 100%)',
    WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
  } as const;

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd).replace(/</g, '\\u003c') }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(orgLd).replace(/</g, '\\u003c') }} />

      <div style={{ background: 'var(--bg-soft)', minHeight: '100vh' }}>

        {/* ===== Hero — манифест ===== */}
        <section style={{ background: 'radial-gradient(1000px 520px at 88% -10%, rgba(94,234,212,0.16), transparent 60%), radial-gradient(800px 480px at -5% 110%, rgba(72,128,184,0.35), transparent 60%), linear-gradient(160deg, #0F172A 0%, #1E3A5F 55%, #123B54 100%)', padding: '64px 0 64px' }}>
          <div className="page-container">
            <nav style={{ fontSize: '13px', color: '#64748B', marginBottom: '32px', display: 'flex', gap: '6px', alignItems: 'center' }}>
              <Link href="/" style={{ color: '#64748B', textDecoration: 'none' }}>Головна</Link>
              <span>/</span>
              <span style={{ color: '#94A3B8' }}>Про компанію</span>
            </nav>

            <Reveal>
            <span style={{ display: 'inline-block', fontSize: '12px', fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#5EEAD4', marginBottom: '20px' }}>
              Цифрова платформа будівельних рішень
            </span>
            </Reveal>

            <Reveal delay={80}>
            <h1 style={{ fontSize: 'clamp(28px, 4.5vw, 52px)', fontWeight: 900, color: '#fff', lineHeight: 1.2, marginBottom: '24px', letterSpacing: '-1px', maxWidth: '860px' }}>
              Ми не будуємо черговий інтернет-магазин.{' '}
              <span style={gradientText}>Ми будуємо цифрову платформу будівельного ринку України.</span>
            </h1>
            </Reveal>

            <Reveal delay={160}>
            <p style={{ fontSize: '17px', color: '#94A3B8', lineHeight: 1.7, maxWidth: '640px', margin: '0 0 28px' }}>
              Сьогодні — будівельна хімія: герметики, клеї, піни, ґрунтовки від перевірених
              виробників. Завтра — місце, де будівельний ринок працює щодня. Не купує. Працює.
            </p>
            </Reveal>

            <Reveal delay={240}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', border: '1px solid rgba(255,255,255,0.18)', borderRadius: '999px', padding: '10px 20px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#5EEAD4', flexShrink: 0 }} />
              <span style={{ fontSize: '14px', fontWeight: 700, color: '#E2E8F0', letterSpacing: '0.02em' }}>Все тримається на FIXLINE</span>
            </div>
            </Reveal>
          </div>
        </section>

        {/* ===== Манифест: почему существует FIXLINE ===== */}
        <section style={{ background: 'var(--bg-soft)', borderBottom: '1px solid var(--border)', padding: '72px 0' }}>
          <div className="page-container">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '56px', alignItems: 'center' }} className="about-content-grid">

              <Reveal><div>
                <span style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#4880B8' }}>
                  Чому існує FIXLINE
                </span>
                <h2 style={{ fontSize: 'clamp(24px, 3vw, 34px)', fontWeight: 900, color: 'var(--text-primary)', lineHeight: 1.3, margin: '12px 0 20px', letterSpacing: '-0.5px' }}>
                  Ми будуємо нову культуру закупівель будівельних матеріалів
                </h2>
                <div style={{ fontSize: '15px', color: 'var(--text-secondary)', lineHeight: 1.8, display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <p>Будівельний ринок України досі працює складно. Пошук товарів забирає години. Постачальників — кілька на один об’єкт. Ціни різні, залишків ніхто не знає, документи — окремий квест.</p>
                  <p style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text-primary)' }}>
                    Ми вважаємо, що це можна змінити.<br />Саме тому існує FIXLINE.
                  </p>
                </div>
              </div></Reveal>

              <Reveal delay={120}>
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '20px', padding: '28px' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '18px' }}>
                  Закупівля сьогодні — це:
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {pains.map(p => (
                    <div key={p} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span style={{ width: '26px', height: '26px', borderRadius: '8px', background: 'rgba(239,68,68,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <X size={14} color="#EF4444" strokeWidth={2.5} />
                      </span>
                      <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>{p}</span>
                    </div>
                  ))}
                </div>
              </div>
              </Reveal>

            </div>
          </div>
        </section>

        {/* ===== Завтра: один день с FIXLINE (dark) ===== */}
        <section style={{ background: 'radial-gradient(900px 450px at 50% -20%, rgba(72,128,184,0.30), transparent 65%), radial-gradient(700px 400px at 95% 110%, rgba(94,234,212,0.10), transparent 60%), linear-gradient(160deg, #0F172A 0%, #1E3059 100%)', padding: '72px 0' }}>
          <div className="page-container">
            <Reveal>
            <div style={{ textAlign: 'center', maxWidth: '640px', margin: '0 auto 40px' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#5EEAD4' }}>
                Уявіть завтрашній день
              </span>
              <h2 style={{ fontSize: 'clamp(22px, 3vw, 32px)', fontWeight: 900, color: '#fff', lineHeight: 1.35, margin: '12px 0 0', letterSpacing: '-0.5px' }}>
                Майстер відкриває телефон. Йому потрібно:
              </h2>
            </div>
            </Reveal>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px', marginBottom: '44px' }} className="about-tasks-grid">
              {dayTasks.map(({ icon: Icon, text }, i) => (
                <Reveal key={text} delay={i * 50}>
                <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: '14px', padding: '16px 14px', display: 'flex', flexDirection: 'column', gap: '10px', height: '100%' }}>
                  <Icon size={18} color="#93C5FD" strokeWidth={2} />
                  <span style={{ fontSize: '13px', fontWeight: 600, color: '#E2E8F0', lineHeight: 1.4 }}>{text}</span>
                </div>
                </Reveal>
              ))}
            </div>

            <Reveal delay={200}>
            <div style={{ textAlign: 'center', maxWidth: '560px', margin: '0 auto' }}>
              <p style={{ fontSize: 'clamp(22px, 3vw, 30px)', fontWeight: 900, color: '#fff', lineHeight: 1.3, margin: '0 0 16px', letterSpacing: '-0.5px' }}>
                Він відкриває <span style={gradientText}>FIXLINE</span>.
              </p>
              <p style={{ fontSize: '16px', color: '#94A3B8', lineHeight: 1.7, margin: 0 }}>
                Не тому, що дешевше. А тому, що зручно.<br />
                <span style={{ color: '#E2E8F0', fontWeight: 600 }}>Саме так народжується бренд.</span>
              </p>
            </div>
            </Reveal>
          </div>
        </section>

        {/* ===== Миссия и видение ===== */}
        <section style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border)', padding: '72px 0' }}>
          <div className="page-container">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }} className="about-mission-grid">
              <Reveal>
              <div style={{ background: 'var(--bg-soft)', border: '1px solid var(--border)', borderRadius: '20px', padding: '36px 32px', height: '100%' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#4880B8' }}>Місія</span>
                <p style={{ fontSize: 'clamp(20px, 2.2vw, 26px)', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.4, margin: '14px 0 0', letterSpacing: '-0.3px' }}>
                  Зробити закупівлю будівельних матеріалів такою ж простою, як виклик таксі.
                </p>
              </div>
              </Reveal>
              <Reveal delay={120}>
              <div style={{ background: 'var(--bg-soft)', border: '1px solid var(--border)', borderRadius: '20px', padding: '36px 32px', height: '100%' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#14B8A6' }}>Візія</span>
                <p style={{ fontSize: 'clamp(20px, 2.2vw, 26px)', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.4, margin: '14px 0 12px', letterSpacing: '-0.3px' }}>
                  Стати цифровим стандартом будівельного ринку України.
                </p>
                <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
                  Не найбільшим магазином. <strong style={{ color: 'var(--text-primary)' }}>Стандартом.</strong>
                </p>
              </div>
              </Reveal>
            </div>
          </div>
        </section>

        {/* ===== Во что мы верим ===== */}
        <section style={{ background: 'var(--bg-soft)', borderBottom: '1px solid var(--border)', padding: '64px 0' }}>
          <div className="page-container">
            <Reveal>
            <h2 style={{ fontSize: '26px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '32px', textAlign: 'center' }}>
              У що ми віримо
            </h2>
            </Reveal>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', maxWidth: '860px', margin: '0 auto' }} className="about-beliefs-grid">
              {beliefs.map((b, i) => (
                <Reveal key={b} delay={i * 80}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '20px 22px', height: '100%' }}>
                  <span style={{ width: '26px', height: '26px', borderRadius: '8px', background: 'rgba(20,184,166,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '1px' }}>
                    <Check size={15} color="#14B8A6" strokeWidth={2.5} />
                  </span>
                  <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.5 }}>{b}</span>
                </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ===== Принципы — правила решений ===== */}
        <section style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border)', padding: '64px 0' }}>
          <div className="page-container">
            <Reveal>
            <h2 style={{ fontSize: '26px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '8px', textAlign: 'center' }}>
              Наші принципи
            </h2>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', textAlign: 'center', marginBottom: '40px' }}>
              Це не цінності для стіни — це правила, за якими ми ухвалюємо рішення
            </p>
            </Reveal>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px' }} className="about-values-grid">
              {principles.map(({ icon: Icon, title, text }, i) => (
                <Reveal key={title} delay={i * 80}>
                <div style={{ background: 'var(--bg-soft)', border: '1px solid var(--border)', borderRadius: '16px', padding: '26px 24px', height: '100%' }}>
                  <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'linear-gradient(135deg, rgba(72,128,184,0.12) 0%, rgba(20,184,166,0.12) 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
                    <Icon size={20} color="#4880B8" strokeWidth={2} />
                  </div>
                  <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '8px' }}>{title}</h3>
                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.65, margin: 0 }}>{text}</p>
                </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ===== Куда мы идем — экосистема ===== */}
        <section style={{ background: 'var(--bg-soft)', borderBottom: '1px solid var(--border)', padding: '72px 0' }}>
          <div className="page-container">
            <Reveal>
            <div style={{ textAlign: 'center', maxWidth: '720px', margin: '0 auto 40px' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#4880B8' }}>
                Куди ми йдемо
              </span>
              <h2 style={{ fontSize: 'clamp(22px, 3vw, 32px)', fontWeight: 900, color: 'var(--text-primary)', lineHeight: 1.35, margin: '12px 0 14px', letterSpacing: '-0.5px' }}>
                Ми створюємо платформу, що об’єднає виробників, дилерів, будівельні компанії та майстрів в єдину екосистему
              </h2>
              <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.7, margin: 0 }}>
                «Екосистема» для нас — не гарне слово, а конкретний план. Ось що за ним стоїть — чесно, зі статусами:
              </p>
            </div>
            </Reveal>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }} className="about-eco-grid">
              {ecosystem.map(({ icon: Icon, title, status, live }, i) => (
                <Reveal key={title} delay={i * 60}>
                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '22px 20px', height: '100%', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Icon size={20} color="#4880B8" strokeWidth={2} />
                    <span style={{
                      fontSize: '11px', fontWeight: 700, padding: '4px 10px', borderRadius: '999px', whiteSpace: 'nowrap',
                      background: live ? 'rgba(20,184,166,0.12)' : 'rgba(100,116,139,0.10)',
                      color: live ? '#0D9488' : 'var(--text-secondary)',
                    }}>{status}</span>
                  </div>
                  <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.4 }}>{title}</span>
                </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ===== Цифры — фундамент ===== */}
        <section style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border)' }}>
          <div className="page-container" style={{ padding: '56px 32px' }}>
            <Reveal>
            <h2 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '36px', textAlign: 'center' }}>
              Амбіції стоять на міцному фундаменті
            </h2>
            </Reveal>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '32px' }} className="about-stats-grid">
              {stats.map(({ icon: Icon, stat, label, text }, i) => (
                <Reveal key={label} delay={i * 90}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                    <Icon size={22} color="#4880B8" strokeWidth={2} />
                  </div>
                  <div style={{ fontSize: '32px', fontWeight: 900, color: 'var(--text-primary)', lineHeight: 1 }}>{stat}</div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', margin: '4px 0 8px' }}>{label}</div>
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>{text}</p>
                </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ===== Имя — концепция ===== */}
        <section style={{ background: 'var(--bg-soft)', borderBottom: '1px solid var(--border)', padding: '56px 0' }}>
          <div className="page-container">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '48px', alignItems: 'center' }} className="about-content-grid">
              <Reveal><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                {[
                  { word: 'FIX',  color: '#4880B8', bg: 'rgba(72,128,184,0.08)', border: 'rgba(72,128,184,0.2)', meanings: ['Фіксувати', 'Кріпити', 'Склеювати', 'Герметизувати'] },
                  { word: 'LINE', color: '#14B8A6', bg: 'rgba(20,184,166,0.08)', border: 'rgba(20,184,166,0.2)', meanings: ['Лінія', 'Асортимент', 'Підбір', 'Система'] },
                ].map(({ word, color, bg, border, meanings }) => (
                  <div key={word} style={{ background: bg, border: `1px solid ${border}`, borderRadius: '16px', padding: '24px 20px' }}>
                    <div style={{ fontSize: '36px', fontWeight: 900, color, marginBottom: '16px', letterSpacing: '-1px', lineHeight: 1 }}>{word}</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {meanings.map(m => (
                        <span key={m} style={{ fontSize: '13px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ width: '4px', height: '4px', borderRadius: '50%', background: color, flexShrink: 0 }} />
                          {m}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
                <div style={{ gridColumn: '1 / -1', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '20px 24px', display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div style={{ fontSize: '22px', fontWeight: 900, letterSpacing: '-0.5px', flexShrink: 0 }}>
                    <span style={{ color: '#4880B8' }}>FIX</span><span style={{ color: '#14B8A6' }}>LINE</span>
                  </div>
                  <div style={{ width: '1px', height: '32px', background: 'var(--border)', flexShrink: 0 }} />
                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
                    Лінія фіксації — повний асортимент того, що кріпить, клеїть, герметизує та захищає в будівництві та ремонті.
                  </p>
                </div>
              </div></Reveal>
              <Reveal delay={120}><div>
                <h2 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '16px', lineHeight: 1.3 }}>
                  Назва — це концепція
                </h2>
                <div style={{ fontSize: '15px', color: 'var(--text-secondary)', lineHeight: 1.8, display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <p>
                    <strong style={{ color: 'var(--text-primary)' }}>FIX</strong> — фіксувати, кріпити, вирішувати. Це суть будівельної хімії: клей тримає, герметик захищає, піна фіксує.
                  </p>
                  <p>
                    <strong style={{ color: 'var(--text-primary)' }}>LINE</strong> — лінія, асортимент, система. Не один продукт, а повна лінійка рішень для будь-якого завдання на об’єкті.
                  </p>
                  <p>
                    Разом <strong style={{ color: 'var(--text-primary)' }}>FIXLINE</strong> — лінія, на якій усе тримається: і монтаж, і робота ринку.
                  </p>
                </div>
              </div></Reveal>
            </div>
          </div>
        </section>

        {/* ===== Бренды ===== */}
        <section style={{ padding: '64px 0' }}>
          <div className="page-container">
            <Reveal>
            <h2 style={{ fontSize: '26px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '8px', textAlign: 'center' }}>
              Бренди, з якими ми працюємо
            </h2>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', textAlign: 'center', marginBottom: '40px' }}>
              Продукція від перевірених виробників будівельної хімії
            </p>
            </Reveal>
            <Reveal delay={100}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '12px' }} className="brands-grid">
              {brandTiles.map(({ name, logo, href, color, style }) => {
                const logoSrc = brandLogos[name.toUpperCase()] ?? logo;
                return (
                  <Link key={name} href={href} style={{
                    background: 'var(--bg-card)', border: '1px solid var(--border)',
                    borderRadius: '12px', padding: '12px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    aspectRatio: '3/2', textDecoration: 'none',
                    transition: 'box-shadow 0.2s, transform 0.2s, border-color 0.2s',
                  }} className="about-brand-tile">
                    {logoSrc ? (
                      <Image src={logoSrc} alt={name} width={160} height={80} style={{ objectFit: 'contain', width: '100%', height: '100%' }} />
                    ) : (
                      <span style={{ color, textAlign: 'center', ...style }}>{name}</span>
                    )}
                  </Link>
                );
              })}
            </div>
            </Reveal>
          </div>
        </section>

        {/* ===== Философия + CTA ===== */}
        <section style={{ background: 'radial-gradient(800px 420px at 50% 120%, rgba(94,234,212,0.14), transparent 60%), radial-gradient(700px 400px at 5% -10%, rgba(72,128,184,0.28), transparent 60%), linear-gradient(160deg, #0F172A 0%, #1E3059 100%)', padding: '72px 0', textAlign: 'center' }}>
          <div className="page-container">
            <Reveal>
            <div style={{ maxWidth: '640px', margin: '0 auto 40px' }}>
              <p style={{ fontSize: 'clamp(20px, 2.6vw, 28px)', fontWeight: 800, color: '#fff', lineHeight: 1.45, margin: '0 0 18px', letterSpacing: '-0.3px' }}>
                Ми не прагнемо стати найбільшим магазином.<br />
                Ми прагнемо стати <span style={gradientText}>найзручнішим</span>.
              </p>
              <p style={{ fontSize: '16px', color: '#94A3B8', lineHeight: 1.7, margin: 0 }}>
                Тому що розмір можна купити рекламою.<br />
                <span style={{ color: '#E2E8F0', fontWeight: 600 }}>Довіру — ні.</span>
              </p>
            </div>
            </Reveal>
            <Reveal delay={150}>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
              <Link href="/register" style={{ height: '48px', padding: '0 28px', borderRadius: '10px', background: '#4880B8', color: '#fff', fontSize: '14px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>
                Приєднатися до платформи
              </Link>
              <Link href="/contacts" style={{ height: '48px', padding: '0 28px', borderRadius: '10px', border: '1.5px solid rgba(255,255,255,0.2)', color: '#E2E8F0', fontSize: '14px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', textDecoration: 'none', background: 'transparent' }}>
                Зв&apos;язатися з нами
              </Link>
            </div>
            </Reveal>
          </div>
        </section>

      </div>
      <Footer />
      <style>{`
        .about-brand-tile:hover { box-shadow: 0 6px 20px rgba(0,0,0,0.10); border-color: #93C5FD; transform: translateY(-2px); }
        @media (max-width: 900px) {
          .about-tasks-grid { grid-template-columns: repeat(3, 1fr) !important; }
          .about-eco-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }
        @media (max-width: 768px) {
          .about-stats-grid  { grid-template-columns: repeat(2, 1fr) !important; }
          .about-values-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .about-mission-grid { grid-template-columns: 1fr !important; }
          .about-beliefs-grid { grid-template-columns: 1fr !important; }
          .about-content-grid { grid-template-columns: 1fr !important; gap: 32px !important; }
          .brands-grid { grid-template-columns: repeat(3, 1fr) !important; }
        }
        @media (max-width: 480px) {
          .about-stats-grid  { grid-template-columns: 1fr !important; }
          .about-values-grid { grid-template-columns: 1fr !important; }
          .about-tasks-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .about-eco-grid { grid-template-columns: 1fr !important; }
          .brands-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }
      `}</style>
    </>
  );
}

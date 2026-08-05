import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import {
  ArrowRight, Handshake, Hammer, Store, UserPlus, MailCheck, Tags, Truck,
  FileText, Boxes, ShieldCheck, Package, Layers, Clock,
} from 'lucide-react';
import Footer from '../../components/Footer';
import Reveal from '../../components/Reveal';
import ModelCompare from '../../components/ModelCompare';
import { WHOLESALE_MIN } from '../../../lib/site';
import { mergeVisibleBrands } from '../../../lib/brands';
import { getBrandLogosCached, getVisibleBrandLogosCached } from '../../../lib/supabase';

const BASE = 'https://fixline.com.ua';

export const metadata: Metadata = {
  title: 'Строительная химия оптом — цены для дилеров, подрядчиков и магазинов',
  description: `Оптовые закупки строительной химии: герметики, монтажные пены, клеи, грунтовки, гидроизоляция. Оптовые цены в личном кабинете, минимальный заказ ${WHOLESALE_MIN} грн, доставка Новой почтой по всей Украине.`,
  keywords: [
    'строительная химия оптом', 'химия строительная оптом', 'герметики оптом',
    'монтажная пена оптом', 'клеи оптом', 'грунтовка оптом', 'опт стройматериалы',
    'поставщик строительной химии', 'дилер строительной химии',
  ],
  alternates: {
    canonical: `${BASE}/ru/opt`,
    languages: { uk: `${BASE}/opt`, ru: `${BASE}/ru/opt`, 'x-default': `${BASE}/opt` },
  },
  openGraph: {
    title: 'Строительная химия оптом | FIXLINE',
    description: `Оптовые цены для дилеров, подрядчиков и магазинов. Минимальный заказ ${WHOLESALE_MIN} грн, доставка по всей Украине.`,
    url: `${BASE}/ru/opt`,
    siteName: 'FIXLINE',
    locale: 'ru_UA',
    type: 'website',
    images: [{ url: `${BASE}/opengraph-image`, width: 1200, height: 630, alt: 'FIXLINE — строительная химия оптом' }],
  },
};

const audience = [
  { icon: Handshake, title: 'Дилерам и дистрибьюторам',    text: 'Актуальные остатки онлайн, чтобы не продавать то, чего нет на складе.' },
  { icon: Hammer,    title: 'Подрядчикам и стройкомпаниям', text: 'Материалы на объект одной поставкой — от пены до гидроизоляции.' },
  { icon: Store,     title: 'Магазинам и ритейлерам',       text: 'Наполнение полки ходовыми позициями известных брендов.' },
];

const stats = [
  { icon: Package, stat: '700+',    label: 'позиций в каталоге',    text: 'Строительная химия и расходные материалы' },
  { icon: Layers,  stat: '30+',     label: 'брендов',               text: 'Ceresit, Lacrysil, AURA, Knauf, Bitugum' },
  { icon: Tags,    stat: `${WHOLESALE_MIN.toLocaleString('ru-RU')} ₴`, label: 'минимальный заказ',     text: 'Дальше — ваша оптовая цена на каждую позицию' },
  { icon: Clock,   stat: '2 мин',   label: 'на регистрацию',        text: 'Доступ включается без ручной модерации' },
];

const steps = [
  { n: '01', icon: UserPlus,  title: 'Регистрация',             text: 'Выбираете свой тип: дилер, подрядчик или магазин. Бесплатно, заявку никто не рассматривает вручную.' },
  { n: '02', icon: MailCheck, title: 'Подтверждение почты',     text: 'Переходите по ссылке из письма. Оптовый статус включается автоматически.' },
  { n: '03', icon: Tags,      title: 'Оптовые цены в кабинете', text: 'В оптовом каталоге видите свою цену на каждую позицию и фактический остаток.' },
  { n: '04', icon: Truck,     title: 'Заказ и отгрузка',        text: `Минимальная сумма — ${WHOLESALE_MIN} грн. Отправляем Новой почтой по всей Украине.` },
];

const benefits = [
  { icon: Tags,        title: 'Цена закреплена за аккаунтом',  text: 'Оптовая цена видна сразу в каталоге — без прайсов в почте и переписки с менеджером.' },
  { icon: Boxes,       title: 'Остатки в реальном времени',    text: 'Склад синхронизируется с поставщиками автоматически, поэтому наличие соответствует фактическому.' },
  { icon: FileText,    title: 'Счёт и накладная',              text: 'На каждый заказ формируем счёт-фактуру и расходную накладную — сразу в кабинете.' },
  { icon: Truck,       title: 'Доставка по всей Украине',      text: 'Новая Почта в любое отделение или почтомат. Отгружаем с собственного склада.' },
  { icon: Layers,      title: 'Вся химия в одном заказе',      text: 'Герметики, пены, клеи, грунтовки, гидроизоляция, краски и пластификаторы вместе.' },
  { icon: ShieldCheck, title: 'Оригинал от производителей',    text: 'Работаем с официальными поставщиками — на каждую партию есть документы происхождения.' },
];

const faq = [
  {
    q: 'Какая минимальная сумма оптового заказа?',
    a: `Минимальная сумма оптового заказа — ${WHOLESALE_MIN} грн. В корзине видно, сколько осталось до минимума. Для розничной покупки минимума нет — можно брать от 1 штуки в обычном магазине.`,
  },
  {
    q: 'Кто может покупать оптом?',
    a: 'Дилеры и дистрибьюторы, подрядчики и строительные компании, владельцы магазинов и ритейлеры. Тип выбирается при регистрации — от него зависит ваша цена в каталоге.',
  },
  {
    q: 'Как увидеть оптовые цены?',
    a: 'Зарегистрируйтесь, выберите свой тип и подтвердите почту — после этого откроется оптовый каталог с ценами и остатками. Оптовые цены не показываются в публичном каталоге, поэтому увидеть их без регистрации не получится.',
  },
  {
    q: 'Нужно ли ждать одобрения заявки?',
    a: 'Нет. Оптовый доступ включается автоматически сразу после подтверждения почты — ручной модерации нет.',
  },
  {
    q: 'Какие документы вы предоставляете?',
    a: 'На каждый заказ формируем счёт-фактуру и расходную накладную. Документы доступны в личном кабинете сразу после оформления.',
  },
  {
    q: 'Как происходит доставка оптовых заказов?',
    a: 'Новой почтой по всей Украине — в отделение или почтомат. Отгружаем с собственного склада, поэтому отправление идёт день в день при наличии товара.',
  },
  {
    q: 'Чем опт отличается от дропшиппинга?',
    a: `В опте вы выкупаете товар на свой склад по оптовой цене от ${WHOLESALE_MIN} грн. В дропшиппинге склад не нужен — мы отправляем напрямую вашему клиенту от имени FIXLINE, а вы зарабатываете на разнице.`,
  },
];

export default async function RuOptPage() {
  const [brandLogos, visibleBrandLogos] = await Promise.all([
    getBrandLogosCached(),
    getVisibleBrandLogosCached(),
  ]);
  const brandTiles = mergeVisibleBrands(visibleBrandLogos).slice(0, 12);

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
      { '@type': 'ListItem', position: 1, name: 'Главная', item: `${BASE}/ru` },
      { '@type': 'ListItem', position: 2, name: 'Опт', item: `${BASE}/ru/opt` },
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
            <div className="opt-hero-grid" style={{ display: 'grid', gridTemplateColumns: '1.15fr 1fr', gap: '56px', alignItems: 'center' }}>
              <div>
                <Reveal>
                  <span className="eyebrow on-dark">Оптовое направление</span>
                  <h1 style={{ fontSize: 'clamp(30px, 4.5vw, 52px)', fontWeight: 900, color: '#fff', lineHeight: 1.15, margin: '14px 0 20px', letterSpacing: '-1px' }}>
                    Строительная химия<br />
                    <span className="grad-text">оптом</span>
                  </h1>
                </Reveal>
                <Reveal delay={90}>
                  <p style={{ fontSize: '17px', color: '#94A3B8', lineHeight: 1.7, marginBottom: '32px', maxWidth: '520px' }}>
                    Герметики, монтажные пены, клеи, грунтовки и гидроизоляция для дилеров,
                    подрядчиков и магазинов. Оптовые цены и фактические остатки — в личном
                    кабинете, без прайсов в почте.
                  </p>
                  <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                    <Link href="/register?type=dealer" style={{ height: '50px', padding: '0 30px', borderRadius: '12px', background: 'var(--brand-blue)', color: '#fff', fontSize: '15px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '8px', textDecoration: 'none', boxShadow: 'var(--brand-shadow)' }}>
                      Открыть оптовые цены <ArrowRight size={16} />
                    </Link>
                    <Link href="/ru/catalog" style={{ height: '50px', padding: '0 24px', borderRadius: '12px', border: '1.5px solid rgba(255,255,255,0.2)', color: '#E2E8F0', fontSize: '14px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '8px', textDecoration: 'none', background: 'rgba(255,255,255,0.04)' }}>
                      Уже есть аккаунт → Каталог
                    </Link>
                  </div>
                </Reveal>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {audience.map(({ icon: Icon, title, text }, i) => (
                  <Reveal key={title} delay={140 + i * 90}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: '16px', padding: '18px 20px', backdropFilter: 'blur(6px)' }}>
                      <div style={{ width: '40px', height: '40px', borderRadius: '11px', background: 'rgba(94,234,212,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Icon size={19} color="#5EEAD4" strokeWidth={2} />
                      </div>
                      <div>
                        <div style={{ fontSize: '14px', fontWeight: 700, color: '#F1F5F9' }}>{title}</div>
                        <div style={{ fontSize: '13px', color: '#94A3B8', marginTop: '4px', lineHeight: 1.55 }}>{text}</div>
                      </div>
                    </div>
                  </Reveal>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ===== Цифры ===== */}
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
                    <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', margin: '6px 0 6px' }}>{label}</div>
                    <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>{text}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ===== Как начать ===== */}
        <section style={{ background: 'var(--bg-soft)', padding: '72px 0' }}>
          <div className="page-container">
            <Reveal>
              <div style={{ textAlign: 'center', maxWidth: '620px', margin: '0 auto 48px' }}>
                <span className="eyebrow">Как начать</span>
                <h2 style={{ fontSize: 'clamp(24px, 3vw, 34px)', fontWeight: 900, color: 'var(--text-primary)', lineHeight: 1.3, margin: '12px 0 0', letterSpacing: '-0.5px' }}>
                  Четыре шага до первой отгрузки
                </h2>
              </div>
            </Reveal>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px' }} className="opt-steps">
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

        {/* ===== Сравнение моделей ===== */}
        <section style={{ background: 'var(--bg-card)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: '72px 0' }}>
          <div className="page-container">
            <Reveal>
              <div style={{ textAlign: 'center', maxWidth: '620px', margin: '0 auto 40px' }}>
                <span className="eyebrow alt">Что выбрать</span>
                <h2 style={{ fontSize: 'clamp(24px, 3vw, 34px)', fontWeight: 900, color: 'var(--text-primary)', lineHeight: 1.3, margin: '12px 0 0', letterSpacing: '-0.5px' }}>
                  Розница, опт или дропшиппинг
                </h2>
              </div>
            </Reveal>
            <Reveal delay={100}>
              <ModelCompare lang="ru" highlight="opt" />
            </Reveal>
            <Reveal delay={160}>
              <p style={{ textAlign: 'center', fontSize: '14px', color: 'var(--text-secondary)', margin: '28px 0 0' }}>
                Работаете без собственного склада?{' '}
                <Link href="/ru/dropship" style={{ color: 'var(--brand-blue)', fontWeight: 700, textDecoration: 'none' }}>
                  Условия дропшиппинга →
                </Link>
              </p>
            </Reveal>
          </div>
        </section>

        {/* ===== Условия ===== */}
        <section style={{ background: 'var(--bg-soft)', padding: '72px 0' }}>
          <div className="page-container">
            <Reveal>
              <div style={{ textAlign: 'center', maxWidth: '620px', margin: '0 auto 48px' }}>
                <span className="eyebrow">Условия работы</span>
                <h2 style={{ fontSize: 'clamp(24px, 3vw, 34px)', fontWeight: 900, color: 'var(--text-primary)', lineHeight: 1.3, margin: '12px 0 0', letterSpacing: '-0.5px' }}>
                  Без прайсов в почте и ожидания менеджера
                </h2>
              </div>
            </Reveal>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px' }} className="opt-benefits">
              {benefits.map(({ icon: Icon, title, text }, i) => (
                <Reveal key={title} delay={i * 70}>
                  <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '18px', padding: '26px', height: '100%' }}>
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

        {/* ===== Бренды ===== */}
        {brandTiles.length > 0 && (
          <section style={{ background: 'var(--bg-card)', borderTop: '1px solid var(--border)', padding: '64px 0' }}>
            <div className="page-container">
              <Reveal>
                <div style={{ textAlign: 'center', maxWidth: '620px', margin: '0 auto 36px' }}>
                  <span className="eyebrow alt">Ассортимент</span>
                  <h2 style={{ fontSize: 'clamp(22px, 2.6vw, 30px)', fontWeight: 900, color: 'var(--text-primary)', lineHeight: 1.3, margin: '12px 0 0', letterSpacing: '-0.5px' }}>
                    Бренды, которые вы получаете по оптовой цене
                  </h2>
                </div>
              </Reveal>
              <Reveal delay={100}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '12px' }} className="opt-brands">
                  {brandTiles.map(({ name, logo, href, color, style }) => {
                    const logoSrc = brandLogos[name.toUpperCase()] ?? logo;
                    return (
                      <Link key={name} href={`/ru${href}`} style={{
                        background: 'var(--bg-soft)', border: '1px solid var(--border)',
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
        <section style={{ background: 'var(--bg-soft)', padding: '72px 0' }}>
          <div className="page-container">
            <Reveal>
              <h2 style={{ fontSize: 'clamp(24px, 3vw, 32px)', fontWeight: 900, color: 'var(--text-primary)', marginBottom: '36px', textAlign: 'center', letterSpacing: '-0.5px' }}>
                Частые вопросы об опте
              </h2>
            </Reveal>
            <div className="faq-accordion" style={{ maxWidth: '820px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {faq.map(({ q, a }, i) => (
                <Reveal key={q} delay={i * 50}>
                  <details style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '14px', padding: '18px 22px' }}>
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
                Откройте <span className="grad-text">оптовые цены</span> за две минуты
              </h2>
              <p style={{ fontSize: '16px', color: '#94A3B8', margin: '0 auto 32px', maxWidth: '520px', lineHeight: 1.7 }}>
                Регистрация бесплатная, доступ включается сразу после подтверждения почты.
              </p>
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
                <Link href="/register?type=dealer" style={{ height: '50px', padding: '0 32px', borderRadius: '12px', background: 'var(--brand-blue)', color: '#fff', fontSize: '15px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '8px', textDecoration: 'none', boxShadow: 'var(--brand-shadow)' }}>
                  Зарегистрироваться <ArrowRight size={16} />
                </Link>
                <Link href="/ru/contacts" style={{ height: '50px', padding: '0 28px', borderRadius: '12px', border: '1.5px solid rgba(255,255,255,0.18)', color: '#E2E8F0', fontSize: '15px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.04)', textDecoration: 'none' }}>
                  Задать вопрос
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

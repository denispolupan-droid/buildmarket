import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowRight, Handshake, Hammer, Store, UserPlus, MailCheck, Tags, Truck,
  FileText, PackageCheck, Boxes, ShieldCheck,
} from 'lucide-react';
import Footer from '../../components/Footer';
import { WHOLESALE_MIN } from '../../../lib/site';

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
  {
    icon: Handshake,
    title: 'Дилерам и дистрибьюторам',
    text: 'Перепродажа и дистрибуция строительной химии. Актуальные остатки онлайн, чтобы не продавать то, чего нет на складе.',
  },
  {
    icon: Hammer,
    title: 'Подрядчикам и стройкомпаниям',
    text: 'Закупка материалов на объект одной поставкой — от герметиков и пены до гидроизоляции и пластификаторов.',
  },
  {
    icon: Store,
    title: 'Магазинам и ритейлерам',
    text: 'Наполнение полки ходовыми позициями: Ceresit, Lacrysil, AURA, Knauf, Bitugum, Lotus и другие бренды.',
  },
];

const steps = [
  {
    n: '01', icon: UserPlus,
    title: 'Регистрация',
    text: 'Выбираете свой тип: дилер, подрядчик или магазин. Регистрация бесплатная, заявку никто не рассматривает вручную.',
  },
  {
    n: '02', icon: MailCheck,
    title: 'Подтверждение почты',
    text: 'Переходите по ссылке из письма. Оптовый статус включается автоматически — ждать одобрения менеджера не нужно.',
  },
  {
    n: '03', icon: Tags,
    title: 'Оптовые цены в кабинете',
    text: 'В оптовом каталоге видите свою цену на каждую позицию и фактический остаток на складе.',
  },
  {
    n: '04', icon: Truck,
    title: 'Заказ и отгрузка',
    text: `Минимальная сумма оптового заказа — ${WHOLESALE_MIN} грн. Отправляем Новой почтой по всей Украине.`,
  },
];

const benefits = [
  { icon: Tags,        title: 'Цена под ваш тип',        text: 'Оптовая цена закреплена за аккаунтом и видна сразу в каталоге — без прайсов в почте и переписки с менеджером.' },
  { icon: Boxes,       title: 'Остатки в реальном времени', text: 'Склад синхронизируется с поставщиками автоматически, поэтому наличие в каталоге соответствует фактическому.' },
  { icon: FileText,    title: 'Счёт и накладная',        text: 'На каждый заказ формируем счёт-фактуру и расходную накладную — документы доступны в кабинете.' },
  { icon: Truck,       title: 'Доставка по Украине',     text: 'Новая Почта в любое отделение или почтомат. Отгружаем с собственного склада.' },
  { icon: Boxes,       title: 'Более 700 позиций',       text: 'Герметики, монтажные пены, клеи, грунтовки, гидроизоляция, краски, пластификаторы и расходные материалы в одном заказе.' },
  { icon: ShieldCheck, title: 'Оригинал от производителей', text: 'Работаем с официальными поставщиками — на каждую партию есть документы происхождения.' },
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
    a: `В опте вы выкупаете товар на свой склад по оптовой цене от ${WHOLESALE_MIN} грн. В дропшиппинге склад не нужен — мы отправляем напрямую вашему клиенту от имени FIXLINE, а вы зарабатываете на разнице. Это разные модели, для дропшиппинга есть отдельная страница.`,
  },
];

export default function RuOptPage() {
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

      {/* Hero */}
      <section style={{ background: 'linear-gradient(160deg, #0F172A 0%, #1E3A5F 100%)', padding: '64px 0 56px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '-120px', right: '-80px', width: '500px', height: '500px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(14,165,233,0.18) 0%, transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: '-100px', left: '-60px', width: '420px', height: '420px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(72,128,184,0.2) 0%, transparent 70%)', pointerEvents: 'none' }} />
        <div className="page-container" style={{ position: 'relative', zIndex: 1 }}>
          <div className="opt-hero-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '48px', alignItems: 'center' }}>
            <div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'rgba(72,128,184,0.2)', border: '1px solid rgba(72,128,184,0.4)', borderRadius: '20px', padding: '4px 14px', marginBottom: '24px' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#7FB3D3', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Опт</span>
              </div>
              <h1 style={{ fontSize: 'clamp(28px, 4vw, 48px)', fontWeight: 900, color: '#fff', lineHeight: 1.15, marginBottom: '20px', letterSpacing: '-0.5px' }}>
                Строительная химия оптом
              </h1>
              <p style={{ fontSize: '16px', color: '#94A3B8', lineHeight: 1.7, marginBottom: '36px' }}>
                Герметики, монтажные пены, клеи, грунтовки и гидроизоляция для дилеров,
                подрядчиков и магазинов. Оптовые цены и фактические остатки — в личном
                кабинете, минимальный заказ {WHOLESALE_MIN} грн.
              </p>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <Link href="/register?type=dealer" style={{ height: '48px', padding: '0 28px', borderRadius: '10px', background: '#4880B8', color: '#fff', fontSize: '15px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '8px', textDecoration: 'none' }}>
                  Открыть оптовые цены <ArrowRight size={16} />
                </Link>
                <Link href="/ru/catalog" style={{ height: '48px', padding: '0 22px', borderRadius: '10px', border: '1.5px solid rgba(255,255,255,0.2)', color: '#E2E8F0', fontSize: '14px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '8px', textDecoration: 'none', background: 'transparent' }}>
                  Уже есть аккаунт → Каталог
                </Link>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {audience.map(({ icon: Icon, title, text }) => (
                <div key={title} style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', background: 'rgba(72,128,184,0.14)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '16px 18px' }}>
                  <Icon size={22} color="#7FB3D3" strokeWidth={1.75} style={{ flexShrink: 0, marginTop: '2px' }} />
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: '#F1F5F9' }}>{title}</div>
                    <div style={{ fontSize: '12px', color: '#94A3B8', marginTop: '4px', lineHeight: 1.6 }}>{text}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Как начать */}
      <section style={{ background: 'var(--bg-soft)', padding: '64px 0' }}>
        <div className="page-container">
          <h2 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '8px', textAlign: 'center' }}>Как начать закупать оптом</h2>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', textAlign: 'center', marginBottom: '48px' }}>Четыре шага — от регистрации до первой отгрузки</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '24px' }} className="opt-steps">
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

      {/* Условия */}
      <section style={{ background: 'var(--bg-card)', padding: '64px 0' }}>
        <div className="page-container">
          <h2 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '8px', textAlign: 'center' }}>Условия оптовой работы</h2>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', textAlign: 'center', marginBottom: '48px' }}>Без прайсов в почте и ожидания ответа менеджера</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px' }} className="opt-benefits">
            {benefits.map(({ icon: Icon, title, text }) => (
              <div key={title} style={{ background: 'var(--bg-soft)', border: '1px solid var(--border)', borderRadius: '14px', padding: '24px' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '14px' }}>
                  <Icon size={20} color="#4880B8" strokeWidth={1.75} />
                </div>
                <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 8px' }}>{title}</h3>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Опт или дропшиппинг */}
      <section style={{ background: 'var(--bg-soft)', padding: '56px 0' }}>
        <div className="page-container">
          <div style={{ maxWidth: '820px', margin: '0 auto', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '32px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <PackageCheck size={22} color="#4880B8" strokeWidth={1.75} />
              <h2 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Опт или дропшиппинг?</h2>
            </div>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.7, margin: '0 0 16px' }}>
              Опт — вы выкупаете товар на свой склад по оптовой цене и дальше продаёте самостоятельно.
              Дропшиппинг — склад не нужен: мы отправляем напрямую вашему клиенту, а вы зарабатываете
              на разнице между своей ценой и дроп-ценой.
            </p>
            <Link href="/ru/dropship" style={{ fontSize: '14px', fontWeight: 700, color: '#4880B8', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              Условия дропшиппинга <ArrowRight size={15} />
            </Link>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section style={{ background: 'var(--bg-card)', padding: '64px 0' }}>
        <div className="page-container">
          <h2 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '40px', textAlign: 'center' }}>Частые вопросы об опте</h2>
          <div style={{ maxWidth: '820px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {faq.map(({ q, a }) => (
              <details key={q} style={{ background: 'var(--bg-soft)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px 20px' }}>
                <summary style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', cursor: 'pointer' }}>{q}</summary>
                <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.7, margin: '12px 0 0' }}>{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ background: 'linear-gradient(160deg, #0F172A 0%, #1E3A5F 100%)', padding: '56px 0' }}>
        <div className="page-container" style={{ textAlign: 'center' }}>
          <h2 style={{ fontSize: 'clamp(22px, 3vw, 30px)', fontWeight: 900, color: '#fff', margin: '0 0 12px' }}>
            Откройте оптовые цены за две минуты
          </h2>
          <p style={{ fontSize: '15px', color: '#94A3B8', margin: '0 0 28px' }}>
            Регистрация бесплатная, доступ включается сразу после подтверждения почты.
          </p>
          <Link href="/register?type=dealer" style={{ height: '48px', padding: '0 30px', borderRadius: '10px', background: '#4880B8', color: '#fff', fontSize: '15px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '8px', textDecoration: 'none' }}>
            Зарегистрироваться <ArrowRight size={16} />
          </Link>
        </div>
      </section>

      <Footer />
    </>
  );
}

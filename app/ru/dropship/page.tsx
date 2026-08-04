import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import {
  Package, RefreshCw, FileText, Truck, ArrowRight, ShieldCheck, BarChart2,
  Headphones, Wallet, CheckCircle, XCircle, CreditCard, ArrowDownCircle, Clock,
} from 'lucide-react';
import Footer from '../../components/Footer';
import Reveal from '../../components/Reveal';
import ModelCompare from '../../components/ModelCompare';
import { mergeVisibleBrands } from '../../../lib/brands';
import { getBrandLogosCached, getVisibleBrandLogosCached } from '../../../lib/supabase';

const BASE = 'https://fixline.com.ua';

export const metadata: Metadata = {
  title: 'Дропшиппинг строительной химии',
  description: 'Продавайте строительную химию без склада. Балансовая система, автоматическое оформление заказов, доставка напрямую клиенту от вашего имени по всей Украине.',
  keywords: ['дропшиппинг строительная химия', 'продавать без склада', 'XML прайс строительная химия', 'дропшип Украина'],
  alternates: {
    canonical: `${BASE}/ru/dropship`,
    languages: { uk: `${BASE}/dropship`, ru: `${BASE}/ru/dropship`, 'x-default': `${BASE}/dropship` },
  },
  openGraph: {
    title: 'Дропшиппинг строительной химии | FIXLINE',
    description: 'Продавайте строительную химию без склада. Балансовая система, автоматическое оформление заказов по Украине.',
    url: `${BASE}/ru/dropship`,
    siteName: 'FIXLINE',
    locale: 'ru_UA',
    type: 'website',
    images: [{ url: `${BASE}/opengraph-image`, width: 1200, height: 630, alt: 'FIXLINE — дропшиппинг строительной химии' }],
  },
};

const flow = [
  { emoji: '👤', label: 'Ваш клиент',     sub: 'Заказывает у Вас — платит Вам (предоплата) или нам при получении (НП)' },
  { emoji: '🛍️', label: 'Вы',             sub: 'Оформляете заказ в кабинете (2 мин)' },
  { emoji: '📦', label: 'FIXLINE',        sub: 'Создаёт ТТН, упаковывает и отправляет' },
  { emoji: '💰', label: 'Ваш заработок',  sub: 'Автоматически начисляется на баланс' },
];

const stats = [
  { icon: Wallet,    stat: '500 ₴', label: 'минимальное пополнение', text: 'Баланс — Ваш рабочий счёт для расчётов' },
  { icon: RefreshCw, stat: '2 часа', label: 'обновление фида',       text: 'XML/YML с остатками и Вашими ценами' },
  { icon: Package,   stat: '700+',  label: 'позиций в прайсе',       text: 'Строительная химия и расходные материалы' },
  { icon: Clock,     stat: '2 мин', label: 'на оформление',          text: 'ТТН и отправку берём на себя' },
];

const steps = [
  {
    n: '01', icon: Wallet,
    title: 'Регистрация и пополнение баланса',
    text: 'Регистрируетесь как дропшипер, получаете доступ к личному кабинету с Вашими ценами и пополняете баланс — это Ваш рабочий счёт для расчётов.',
  },
  {
    n: '02', icon: RefreshCw,
    title: 'Подключение прайс-фида',
    text: 'Получаете личную ссылку на XML/YML-фид с актуальными остатками и Вашими ценами. Подключаете к Prom.ua, Horoshop, OpenCart или любому другому магазину.',
  },
  {
    n: '03', icon: FileText,
    title: 'Оформление заказа в кабинете',
    text: 'Клиент заказывает у Вас. Предоплату Вы получаете самостоятельно (карта, Monobank и т.д.). Затем оформляете заказ в кабинете — указываете товары и данные клиента. Всё остальное — автоматически.',
  },
  {
    n: '04', icon: Truck,
    title: 'Мы отправляем и рассчитываемся',
    text: 'Мы создаём ТТН, упаковываем и отправляем от своего имени. При наложенном платеже средства поступают нам — мы начисляем Ваш заработок на баланс. При предоплате — Ваш клиент уже рассчитался с Вами, мы просто отправляем.',
  },
];

const benefits = [
  { icon: BarChart2,   title: 'Актуальный прайс',            text: 'XML/YML-фид обновляется каждые 2 часа. Остатки и цены всегда актуальны.' },
  { icon: Package,     title: 'Без собственного склада',      text: 'Не нужно закупать и хранить товар — продаёте то, что есть у нас.' },
  { icon: ShieldCheck, title: 'Проверенное качество',         text: 'Только оригинальная продукция от проверенных поставщиков.' },
  { icon: RefreshCw,   title: 'Автоматическое оформление',    text: 'Оформление заказа занимает 2 минуты. ТТН и отправку берём на себя.' },
  { icon: Wallet,      title: 'Прозрачная финансовая модель', text: 'Понятный баланс, каждая транзакция с объяснением. Вы видите каждую гривню.' },
  { icon: Headphones,  title: 'Поддержка',                    text: 'Персональный менеджер для вопросов по заказам, ценам и интеграции.' },
];

const rules = [
  {
    icon: CreditCard, color: '#4880B8', bg: '#EFF6FF',
    title: 'Пополнение баланса',
    items: [
      'Минимальное пополнение: 500 грн',
      'Банковский перевод на счёт FIXLINE',
      'Баланс должен покрывать закупочную цену заказа',
      'Без баланса — оформление заказа недоступно',
    ],
  },
  {
    icon: CheckCircle, color: '#15803D', bg: '#F0FDF4',
    title: 'После доставки',
    items: [
      'Наложенный платёж: клиент оплачивает НП при получении → средства поступают нам → Ваш заработок на баланс (3-7 дней)',
      'Предоплата: Вы уже получили средства от клиента → мы просто отправляем → закупочная цена списывается с баланса',
      'Всё отображается в разделе "Мои транзакции"',
    ],
  },
  {
    icon: XCircle, color: '#DC2626', bg: '#FEF2F2',
    title: 'Если клиент не забрал',
    items: [
      'Посылка возвращается к нам',
      'Стоимость обратной доставки списывается с Вашего баланса',
      'Закупочная цена возвращается на баланс',
      'Товар возвращается в наш каталог',
    ],
  },
  {
    icon: ArrowDownCircle, color: '#6366F1', bg: '#EEF2FF',
    title: 'Вывод средств',
    items: [
      'Товарный зачёт: покупаете товар за счёт баланса',
      'Выплата: заявка в кабинете, 1 раз в месяц от 500 грн',
      'Банковский перевод в течение 3 рабочих дней',
      'Комиссия за вывод: отсутствует',
    ],
  },
];

const faq = [
  {
    q: 'Какая минимальная сумма пополнения баланса?',
    a: 'Минимальная сумма пополнения — 500 грн. Баланс должен покрывать стоимость заказа по Вашей дроп-цене — без достаточного баланса оформление заказа недоступно.',
  },
  {
    q: 'Как формируются мои цены?',
    a: 'Вы получаете личные дроп-цены — как правило ниже розничных. Разница между Вашей ценой продажи клиенту и Вашей закупочной ценой — это Ваш заработок.',
  },
  {
    q: 'Какие способы оплаты поддерживаются?',
    a: 'Два варианта: 1) Наложенный платёж — клиент оплачивает при получении в отделении НП. Деньги поступают нам, и мы начисляем Ваш заработок на баланс. 2) Предоплата — клиент переводит средства напрямую Вам (Monobank, PrivatBank, карта и т.д.). Вы самостоятельно получаете оплату от клиента, а затем оформляете заказ в кабинете — мы отправляем без наложенного платежа. В любом случае Ваша закупочная цена списывается с баланса при оформлении заказа.',
  },
  {
    q: 'Кто является отправителем для моего клиента?',
    a: 'Мы отправляем от своего имени (FIXLINE). Это стандартная практика для дропшиппинга — клиент получает качественно упакованный товар, мы несём ответственность за отправку.',
  },
  {
    q: 'Когда я получаю свой заработок?',
    a: 'Зависит от способа оплаты. Наложенный платёж: средства от клиента поступают нам через НП (обычно 3-7 дней), после чего Ваш заработок начисляется на баланс. Предоплата: Вы самостоятельно получили средства от клиента — мы просто отправляем, ничего дополнительно не переводим. Ваша закупочная цена списывается с баланса в момент оформления заказа.',
  },
  {
    q: 'Что происходит, если клиент не забрал посылку?',
    a: 'Посылка возвращается к нам. Стоимость обратной доставки списывается с Вашего баланса. Закупочная цена товара возвращается на баланс, товар — в наш каталог.',
  },
  {
    q: 'Как вывести накопленные средства?',
    a: 'Два варианта: 1) Товарный зачёт — покупаете товар для себя или своих клиентов за счёт баланса. 2) Банковский перевод — заявка в кабинете, выплата 1 раз в месяц от 500 грн.',
  },
  {
    q: 'Есть ли комиссия за наложенный платёж?',
    a: 'Новая Почта удерживает комиссию ~2% за перевод наложенного платежа. Эта комиссия списывается с Вашего баланса отдельной строкой — всё прозрачно. Для предоплатных заказов эта комиссия отсутствует.',
  },
  {
    q: 'Как передать заказ, если нет своей системы?',
    a: 'В личном кабинете есть удобная форма оформления: указываете товары, количество, данные клиента и способ оплаты — мы всё делаем автоматически. Также доступна загрузка заказов через Excel-файл для пакетного оформления.',
  },
];

const eyebrow = {
  fontSize: '12px', fontWeight: 700, letterSpacing: '0.14em',
  textTransform: 'uppercase' as const, color: '#5EEAD4',
};

const gradientText = {
  background: 'linear-gradient(135deg, #93C5FD 0%, #5EEAD4 100%)',
  WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
} as const;

export default async function RuDropshipPage() {
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
      { '@type': 'ListItem', position: 2, name: 'Дропшиппинг', item: `${BASE}/ru/dropship` },
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
                  <span style={eyebrow}>Дропшиппинг</span>
                  {/* Заголовок длиннее, чем на /opt — меньший максимум кегля,
                      чтобы «химию» не оставалась сиротой на своей строке. */}
                  <h1 style={{ fontSize: 'clamp(28px, 3.6vw, 44px)', fontWeight: 900, color: '#fff', lineHeight: 1.18, margin: '14px 0 20px', letterSpacing: '-0.8px' }}>
                    Продавайте строительную химию<br />
                    <span style={gradientText}>без своего склада</span>
                  </h1>
                </Reveal>
                <Reveal delay={90}>
                  <p style={{ fontSize: '17px', color: '#94A3B8', lineHeight: 1.7, marginBottom: '32px', maxWidth: '520px' }}>
                    Оформляете заказы в личном кабинете — мы создаём ТТН, упаковываем
                    и отправляем, а Ваш заработок автоматически начисляется на баланс.
                  </p>
                  <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                    <Link href="/register?type=dropship" style={{ height: '50px', padding: '0 30px', borderRadius: '12px', background: '#4880B8', color: '#fff', fontSize: '15px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '8px', textDecoration: 'none', boxShadow: '0 8px 24px rgba(72,128,184,0.35)' }}>
                      Зарегистрироваться <ArrowRight size={16} />
                    </Link>
                    <Link href="/cabinet" style={{ height: '50px', padding: '0 24px', borderRadius: '12px', border: '1.5px solid rgba(255,255,255,0.2)', color: '#E2E8F0', fontSize: '14px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '8px', textDecoration: 'none', background: 'rgba(255,255,255,0.04)' }}>
                      Уже партнёр → Кабинет
                    </Link>
                  </div>
                </Reveal>
              </div>

              {/* Схема потока */}
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

        {/* ===== Цифры ===== */}
        <section style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border)', padding: '52px 0' }}>
          <div className="page-container">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '28px' }} className="opt-stats">
              {stats.map(({ icon: Icon, stat, label, text }, i) => (
                <Reveal key={label} delay={i * 90}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ width: '46px', height: '46px', borderRadius: '12px', background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                      <Icon size={21} color="#4880B8" strokeWidth={2} />
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

        {/* ===== Как это работает ===== */}
        <section style={{ background: 'var(--bg-soft)', padding: '72px 0' }}>
          <div className="page-container">
            <Reveal>
              <div style={{ textAlign: 'center', maxWidth: '620px', margin: '0 auto 48px' }}>
                <span style={{ ...eyebrow, color: '#4880B8' }}>Как это работает</span>
                <h2 style={{ fontSize: 'clamp(24px, 3vw, 34px)', fontWeight: 900, color: 'var(--text-primary)', lineHeight: 1.3, margin: '12px 0 0', letterSpacing: '-0.5px' }}>
                  Четыре шага от регистрации до первого заработка
                </h2>
              </div>
            </Reveal>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px' }} className="drop-steps">
              {steps.map(({ n, icon: Icon, title, text }, i) => (
                <Reveal key={n} delay={i * 90}>
                  <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '20px', padding: '30px 26px', display: 'flex', flexDirection: 'column', gap: '14px', height: '100%' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Icon size={21} color="#4880B8" strokeWidth={1.75} />
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

        {/* ===== Финансовая модель ===== */}
        <section style={{ background: 'var(--bg-card)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: '72px 0' }}>
          <div className="page-container">
            <Reveal>
              <div style={{ textAlign: 'center', maxWidth: '620px', margin: '0 auto 44px' }}>
                <span style={{ ...eyebrow, color: '#14B8A6' }}>Финансовая модель</span>
                <h2 style={{ fontSize: 'clamp(24px, 3vw, 34px)', fontWeight: 900, color: 'var(--text-primary)', lineHeight: 1.3, margin: '12px 0 0', letterSpacing: '-0.5px' }}>
                  Прозрачный баланс — Вы видите каждую гривню
                </h2>
              </div>
            </Reveal>

            <Reveal delay={100}>
              <div style={{ maxWidth: '860px', margin: '0 auto 44px', background: 'var(--bg-soft)', border: '1px solid var(--border)', borderRadius: '20px', padding: '34px' }}>
                <div style={{ ...eyebrow, color: 'var(--text-muted)', marginBottom: '22px' }}>Пример расчёта</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px' }} className="drop-example">
                  <div>
                    <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '14px', fontWeight: 700 }}>Ваши условия</div>
                    {[
                      ['Ваша цена для клиента',     '250 грн'],
                      ['Ваша закупочная цена',      '180 грн'],
                      ['Ваш заработок до комиссий', '70 грн'],
                    ].map(([label, val]) => (
                      <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '11px 0', borderBottom: '1px solid var(--border-light)' }}>
                        <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>{label}</span>
                        <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>{val}</span>
                      </div>
                    ))}
                  </div>
                  <div>
                    <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '14px', fontWeight: 700 }}>Движение средств</div>
                    {[
                      { label: 'С вашего баланса (закупочная)', val: '−180 грн', color: '#DC2626' },
                      { label: 'Клиент оплатил НП',             val: '+250 грн', color: '#15803D' },
                      { label: 'Комиссия НП (~2%)',             val: '−5 грн',   color: '#B45309' },
                      { label: 'Ваш чистый заработок',          val: '+65 грн',  color: '#15803D', bold: true },
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

        {/* ===== Сравнение моделей ===== */}
        <section style={{ background: 'var(--bg-soft)', padding: '72px 0' }}>
          <div className="page-container">
            <Reveal>
              <div style={{ textAlign: 'center', maxWidth: '620px', margin: '0 auto 40px' }}>
                <span style={{ ...eyebrow, color: '#4880B8' }}>Что выбрать</span>
                <h2 style={{ fontSize: 'clamp(24px, 3vw, 34px)', fontWeight: 900, color: 'var(--text-primary)', lineHeight: 1.3, margin: '12px 0 0', letterSpacing: '-0.5px' }}>
                  Розница, опт или дропшиппинг
                </h2>
              </div>
            </Reveal>
            <Reveal delay={100}>
              <ModelCompare lang="ru" highlight="drop" />
            </Reveal>
            <Reveal delay={160}>
              <p style={{ textAlign: 'center', fontSize: '14px', color: 'var(--text-secondary)', margin: '28px 0 0' }}>
                Готовы выкупать товар на свой склад?{' '}
                <Link href="/ru/opt" style={{ color: '#4880B8', fontWeight: 700, textDecoration: 'none' }}>
                  Условия опта →
                </Link>
              </p>
            </Reveal>
          </div>
        </section>

        {/* ===== Что вы получаете ===== */}
        <section style={{ background: 'var(--bg-card)', borderTop: '1px solid var(--border)', padding: '72px 0' }}>
          <div className="page-container">
            <Reveal>
              <div style={{ textAlign: 'center', maxWidth: '620px', margin: '0 auto 48px' }}>
                <span style={{ ...eyebrow, color: '#14B8A6' }}>Условия работы</span>
                <h2 style={{ fontSize: 'clamp(24px, 3vw, 34px)', fontWeight: 900, color: 'var(--text-primary)', lineHeight: 1.3, margin: '12px 0 0', letterSpacing: '-0.5px' }}>
                  Что вы получаете
                </h2>
              </div>
            </Reveal>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px' }} className="drop-benefits">
              {benefits.map(({ icon: Icon, title, text }, i) => (
                <Reveal key={title} delay={i * 70}>
                  <div style={{ background: 'var(--bg-soft)', border: '1px solid var(--border)', borderRadius: '18px', padding: '26px', height: '100%' }}>
                    <div style={{ width: '42px', height: '42px', borderRadius: '11px', background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
                      <Icon size={20} color="#4880B8" strokeWidth={1.75} />
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
          <section style={{ background: 'var(--bg-soft)', padding: '64px 0' }}>
            <div className="page-container">
              <Reveal>
                <div style={{ textAlign: 'center', maxWidth: '620px', margin: '0 auto 36px' }}>
                  <span style={{ ...eyebrow, color: '#14B8A6' }}>Ассортимент</span>
                  <h2 style={{ fontSize: 'clamp(22px, 2.6vw, 30px)', fontWeight: 900, color: 'var(--text-primary)', lineHeight: 1.3, margin: '12px 0 0', letterSpacing: '-0.5px' }}>
                    Бренды, которые вы продаёте
                  </h2>
                </div>
              </Reveal>
              <Reveal delay={100}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '12px' }} className="opt-brands">
                  {brandTiles.map(({ name, logo, href, color, style }) => {
                    const logoSrc = brandLogos[name.toUpperCase()] ?? logo;
                    return (
                      <Link key={name} href={`/ru${href}`} style={{
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
                Частые вопросы
              </h2>
            </Reveal>
            <div className="opt-faq" style={{ maxWidth: '820px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
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
                Готовы <span style={gradientText}>начать</span>?
              </h2>
              <p style={{ fontSize: '16px', color: '#94A3B8', margin: '0 auto 32px', maxWidth: '520px', lineHeight: 1.7 }}>
                Зарегистрируйтесь — получите доступ к личному кабинету, каталогу с дроп-ценами и XML-фиду.
              </p>
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
                <Link href="/register?type=dropship" style={{ height: '50px', padding: '0 32px', borderRadius: '12px', background: '#4880B8', color: '#fff', fontSize: '15px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '8px', textDecoration: 'none', boxShadow: '0 8px 24px rgba(72,128,184,0.35)' }}>
                  Зарегистрироваться <ArrowRight size={16} />
                </Link>
                <Link href="/cabinet" style={{ height: '50px', padding: '0 28px', borderRadius: '12px', border: '1.5px solid rgba(255,255,255,0.18)', color: '#E2E8F0', fontSize: '15px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.04)', textDecoration: 'none' }}>
                  Уже партнёр → Кабинет
                </Link>
                <Link href="/ru/contacts" style={{ height: '50px', padding: '0 28px', borderRadius: '12px', border: '1.5px solid rgba(255,255,255,0.10)', color: 'rgba(255,255,255,0.55)', fontSize: '15px', fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'transparent', textDecoration: 'none' }}>
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

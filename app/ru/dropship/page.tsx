import type { Metadata } from 'next';
import Link from 'next/link';
import {
  Package, RefreshCw, FileText, Truck, ArrowRight,
  ShieldCheck, BarChart2, Headphones, Wallet, AlertCircle,
  CheckCircle, XCircle, CreditCard, ArrowDownCircle,
} from 'lucide-react';
import Footer from '../../components/Footer';

const BASE = 'https://fixline.com.ua';

export const metadata: Metadata = {
  title: 'Дропшиппинг строительной химии',
  description: 'Продавайте строительную химию без склада. Балансовая система, автоматическое оформление заказов, доставка напрямую клиенту от вашего имени по всей Украине.',
  keywords: ['дропшиппинг строительная химия', 'продавать без склада', 'XML прайс строительная химия', 'дропшип Украина'],
  alternates: {
    canonical: `${BASE}/ru/dropship`,
    languages: { 'uk': `${BASE}/dropship`, 'ru': `${BASE}/ru/dropship`, 'x-default': `${BASE}/dropship` },
  },
  openGraph: {
    title: 'Дропшиппинг строительной химии | FIXLINE',
    description: 'Продавайте строительную химию без склада. Балансовая система, автоматическое оформление заказов по Украине.',
    url: `${BASE}/ru/dropship`,
    siteName: 'FIXLINE',
    locale: 'ru_RU',
    type: 'website',
    images: [{ url: 'https://fixline.com.ua/opengraph-image', width: 1200, height: 630, alt: 'FIXLINE — дропшиппинг строительной химии' }],
  },
};

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
  { icon: BarChart2,   title: 'Актуальный прайс',           text: 'XML/YML-фид обновляется каждые 2 часа. Остатки и цены всегда актуальны.' },
  { icon: Package,     title: 'Без собственного склада',     text: 'Не нужно закупать и хранить товар — продаёте то, что есть у нас.' },
  { icon: ShieldCheck, title: 'Проверенное качество',        text: 'Только оригинальная продукция от проверенных поставщиков.' },
  { icon: RefreshCw,   title: 'Автоматическое оформление',   text: 'Оформление заказа занимает 2 минуты. ТТН и отправку берём на себя.' },
  { icon: Wallet,      title: 'Прозрачная финансовая модель', text: 'Понятный баланс, каждая транзакция с объяснением. Вы видите каждую гривню.' },
  { icon: Headphones,  title: 'Поддержка',                   text: 'Персональный менеджер для вопросов по заказам, ценам и интеграции.' },
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

export default function DropshipRuPage() {
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
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#7FB3D3', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Дропшиппинг</span>
              </div>
              <h1 style={{ fontSize: 'clamp(28px, 4vw, 48px)', fontWeight: 900, color: '#fff', lineHeight: 1.15, marginBottom: '20px', letterSpacing: '-0.5px' }}>
                Продавайте строительную химию без собственного склада
              </h1>
              <p style={{ fontSize: '16px', color: '#94A3B8', lineHeight: 1.7, marginBottom: '36px' }}>
                Оформляйте заказы в личном кабинете — мы отправляем, а Ваш заработок автоматически начисляется на баланс.
              </p>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <Link href="/register?type=dropship" style={{ height: '48px', padding: '0 28px', borderRadius: '10px', background: '#4880B8', color: '#fff', fontSize: '15px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '8px', textDecoration: 'none' }}>
                  Зарегистрироваться <ArrowRight size={16} />
                </Link>
                <Link href="/cabinet" style={{ height: '48px', padding: '0 22px', borderRadius: '10px', border: '1.5px solid rgba(255,255,255,0.2)', color: '#E2E8F0', fontSize: '14px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '8px', textDecoration: 'none', background: 'transparent' }}>
                  Уже партнёр → Кабинет
                </Link>
              </div>
            </div>

            {/* Flow diagram */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0', alignItems: 'stretch' }}>
              {[
                { emoji: '👤', label: 'Ваш клиент',    sub: 'Заказывает у Вас — платит Вам (предоплата) или нам при получении (НП)', color: 'rgba(255,255,255,0.08)' },
                { emoji: '🛍️', label: 'Вы',             sub: 'Оформляете заказ в кабинете (2 мин)',                                   color: 'rgba(72,128,184,0.2)' },
                { emoji: '📦', label: 'FIXLINE',         sub: 'Создаёт ТТН, упаковывает и отправляет',                                color: 'rgba(72,128,184,0.2)' },
                { emoji: '💰', label: 'Ваш заработок',  sub: 'Автоматически начисляется на баланс',                                  color: 'rgba(22,163,74,0.15)' },
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
          <h2 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '8px', textAlign: 'center' }}>Как это работает</h2>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', textAlign: 'center', marginBottom: '48px' }}>Четыре шага от регистрации до первого заработка</p>
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

      {/* Financial model */}
      <section style={{ background: 'var(--bg-card)', padding: '64px 0' }}>
        <div className="page-container">
          <h2 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '8px', textAlign: 'center' }}>
            Финансовая модель
          </h2>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', textAlign: 'center', marginBottom: '48px' }}>
            Прозрачная система баланса — Вы видите каждую гривню
          </p>

          {/* Example calculation */}
          <div style={{ maxWidth: '820px', margin: '0 auto 48px', background: 'var(--bg-soft)', border: '1px solid var(--border)', borderRadius: '16px', padding: '32px' }}>
            <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '20px' }}>
              Пример расчёта
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px' }} className="drop-example">
              <div>
                <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px', fontWeight: 600 }}>Ваши условия</div>
                {[
                  ['Ваша цена для клиента',     '250 грн'],
                  ['Ваша закупочная цена',       '180 грн'],
                  ['Ваш заработок до комиссий',  '70 грн'],
                ].map(([label, val]) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border-light)' }}>
                    <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>{label}</span>
                    <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>{val}</span>
                  </div>
                ))}
              </div>
              <div>
                <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px', fontWeight: 600 }}>Движение средств</div>
                {[
                  { label: 'С вашего баланса (закупочная)', val: '−180 грн', color: '#DC2626' },
                  { label: 'Клиент оплатил НП',             val: '+250 грн', color: '#15803D' },
                  { label: 'Комиссия НП (~2%)',              val: '−5 грн',   color: '#B45309' },
                  { label: 'Ваш чистый заработок',          val: '+65 грн',  color: '#15803D', bold: true },
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
          <h2 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '40px', textAlign: 'center' }}>Что вы получаете</h2>
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
          <h2 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '40px', textAlign: 'center' }}>Часто задаваемые вопросы</h2>
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
          <h2 style={{ fontSize: '24px', fontWeight: 800, color: '#fff', marginBottom: '12px' }}>Готовы начать?</h2>
          <p style={{ fontSize: '14px', color: '#94A3B8', marginBottom: '32px', maxWidth: '480px', margin: '0 auto 32px' }}>
            Зарегистрируйтесь — получите доступ к личному кабинету, каталогу с дроп-ценами и XML-фиду.
          </p>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/register?type=dropship" style={{
              height: '48px', padding: '0 32px', borderRadius: '10px',
              background: '#4880B8', color: '#fff', fontSize: '15px', fontWeight: 700,
              display: 'inline-flex', alignItems: 'center', gap: '8px', textDecoration: 'none',
            }}>
              Зарегистрироваться <ArrowRight size={16} />
            </Link>
            <Link href="/cabinet" style={{
              height: '48px', padding: '0 28px', borderRadius: '10px',
              border: '1.5px solid rgba(255,255,255,0.2)', color: '#E2E8F0',
              fontSize: '15px', fontWeight: 600,
              display: 'inline-flex', alignItems: 'center', gap: '8px',
              background: 'transparent', textDecoration: 'none',
            }}>
              Уже партнёр → Кабинет
            </Link>
            <Link href="/ru/contacts" style={{
              height: '48px', padding: '0 28px', borderRadius: '10px',
              border: '1.5px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)',
              fontSize: '15px', fontWeight: 500,
              display: 'inline-flex', alignItems: 'center', gap: '8px',
              background: 'transparent', textDecoration: 'none',
            }}>
              Задать вопрос
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowRight, Handshake, Hammer, Store, UserPlus, MailCheck, Tags, Truck,
  FileText, PackageCheck, Boxes, ShieldCheck,
} from 'lucide-react';
import Footer from '../components/Footer';
import { WHOLESALE_MIN } from '../../lib/site';

const BASE = 'https://fixline.com.ua';

export const metadata: Metadata = {
  title: 'Будівельна хімія оптом — ціни для дилерів, підрядників і магазинів',
  description: `Оптові закупівлі будівельної хімії: герметики, монтажні піни, клеї, ґрунтовки, гідроізоляція. Оптові ціни в особистому кабінеті, мінімальне замовлення ${WHOLESALE_MIN} грн, доставка Новою поштою по всій Україні. Строительная химия оптом для дилеров и подрядчиков.`,
  keywords: [
    'будівельна хімія оптом', 'строительная химия оптом', 'оптом хімія будівельна',
    'герметики оптом', 'монтажна піна оптом', 'клеї оптом', 'ґрунтовка оптом',
    'опт будматеріали', 'постачальник будівельної хімії', 'дилер будівельної хімії',
  ],
  alternates: {
    canonical: `${BASE}/opt`,
    languages: { uk: `${BASE}/opt`, ru: `${BASE}/ru/opt`, 'x-default': `${BASE}/opt` },
  },
  openGraph: {
    title: 'Будівельна хімія оптом | FIXLINE',
    description: `Оптові ціни для дилерів, підрядників і магазинів. Мінімальне замовлення ${WHOLESALE_MIN} грн, доставка по всій Україні.`,
    url: `${BASE}/opt`,
    siteName: 'FIXLINE',
    locale: 'uk_UA',
    type: 'website',
    images: [{ url: `${BASE}/opengraph-image`, width: 1200, height: 630, alt: 'FIXLINE — будівельна хімія оптом' }],
  },
};

const audience = [
  {
    icon: Handshake,
    title: 'Дилерам і дистриб\'юторам',
    text: 'Перепродаж і дистрибуція будівельної хімії. Актуальні залишки онлайн, щоб не продавати те, чого немає на складі.',
  },
  {
    icon: Hammer,
    title: 'Підрядникам і будкомпаніям',
    text: 'Закупівля матеріалів на об\'єкт однією поставкою — від герметиків і піни до гідроізоляції та пластифікаторів.',
  },
  {
    icon: Store,
    title: 'Магазинам і рітейлерам',
    text: 'Наповнення полиці ходовими позиціями: Ceresit, Lacrysil, AURA, Knauf, Bitugum, Lotus та інші бренди.',
  },
];

const steps = [
  {
    n: '01', icon: UserPlus,
    title: 'Реєстрація',
    text: 'Обираєте свій тип: дилер, підрядник або магазин. Реєстрація безкоштовна, заявку ніхто не розглядає вручну.',
  },
  {
    n: '02', icon: MailCheck,
    title: 'Підтвердження пошти',
    text: 'Переходите за посиланням з листа. Оптовий статус вмикається автоматично — чекати на схвалення менеджера не потрібно.',
  },
  {
    n: '03', icon: Tags,
    title: 'Оптові ціни в кабінеті',
    text: 'В оптовому каталозі бачите свою ціну на кожну позицію та фактичний залишок на складі.',
  },
  {
    n: '04', icon: Truck,
    title: 'Замовлення і відвантаження',
    text: `Мінімальна сума оптового замовлення — ${WHOLESALE_MIN} грн. Відправляємо Новою поштою по всій Україні.`,
  },
];

const benefits = [
  { icon: Tags,        title: 'Ціна під ваш тип',        text: 'Оптова ціна закріплена за акаунтом і видно її одразу в каталозі — без прайсів у пошті й переписки з менеджером.' },
  { icon: Boxes,       title: 'Залишки в реальному часі', text: 'Склад синхронізується з постачальниками автоматично, тому наявність у каталозі відповідає фактичній.' },
  { icon: FileText,    title: 'Рахунок і накладна',       text: 'На кожне замовлення формуємо рахунок-фактуру та видаткову накладну — документи доступні в кабінеті.' },
  { icon: Truck,       title: 'Доставка по Україні',      text: 'Нова Пошта у будь-яке відділення або поштомат. Відвантажуємо з власного складу.' },
  { icon: Boxes,       title: 'Понад 700 позицій',        text: 'Герметики, монтажні піни, клеї, ґрунтовки, гідроізоляція, фарби, пластифікатори та витратні матеріали в одному замовленні.' },
  { icon: ShieldCheck, title: 'Оригінал від виробників',  text: 'Працюємо з офіційними постачальниками — на кожну партію є документи походження.' },
];

const faq = [
  {
    q: 'Яка мінімальна сума оптового замовлення?',
    a: `Мінімальна сума оптового замовлення — ${WHOLESALE_MIN} грн. У кошику видно, скільки залишилось до мінімуму. Для роздрібної покупки мінімуму немає — можна брати від 1 штуки в звичайному магазині.`,
  },
  {
    q: 'Хто може купувати оптом?',
    a: 'Дилери та дистриб\'ютори, підрядники й будівельні компанії, власники магазинів і рітейлери. Тип обирається під час реєстрації — від нього залежить ваша ціна в каталозі.',
  },
  {
    q: 'Як побачити оптові ціни?',
    a: 'Зареєструйтесь, оберіть свій тип і підтвердьте пошту — після цього відкриється оптовий каталог із цінами та залишками. Оптові ціни не показуються в публічному каталозі, тому побачити їх без реєстрації не вийде.',
  },
  {
    q: 'Чи потрібно чекати на схвалення заявки?',
    a: 'Ні. Оптовий доступ вмикається автоматично одразу після підтвердження пошти — ручної модерації немає.',
  },
  {
    q: 'Які документи ви надаєте?',
    a: 'На кожне замовлення формуємо рахунок-фактуру та видаткову накладну. Документи доступні в особистому кабінеті одразу після оформлення.',
  },
  {
    q: 'Як відбувається доставка оптових замовлень?',
    a: 'Новою поштою по всій Україні — у відділення або поштомат. Відвантажуємо з власного складу, тож відправлення йде день у день за наявності товару.',
  },
  {
    q: 'Чим опт відрізняється від дропшипінгу?',
    a: `В опті ви викуповуєте товар на свій склад за оптовою ціною від ${WHOLESALE_MIN} грн. У дропшипінгу склад не потрібен — ми відправляємо напряму вашому клієнту від імені FIXLINE, а ви заробляєте на різниці. Це різні моделі, для дропшипінгу є окрема сторінка.`,
  },
];

export default function OptPage() {
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
      { '@type': 'ListItem', position: 2, name: 'Опт', item: `${BASE}/opt` },
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
                Будівельна хімія оптом
              </h1>
              <p style={{ fontSize: '16px', color: '#94A3B8', lineHeight: 1.7, marginBottom: '36px' }}>
                Герметики, монтажні піни, клеї, ґрунтовки та гідроізоляція для дилерів,
                підрядників і магазинів. Оптові ціни та фактичні залишки — в особистому
                кабінеті, мінімальне замовлення {WHOLESALE_MIN} грн.
              </p>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <Link href="/register?type=dealer" style={{ height: '48px', padding: '0 28px', borderRadius: '10px', background: '#4880B8', color: '#fff', fontSize: '15px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '8px', textDecoration: 'none' }}>
                  Відкрити оптові ціни <ArrowRight size={16} />
                </Link>
                <Link href="/catalog" style={{ height: '48px', padding: '0 22px', borderRadius: '10px', border: '1.5px solid rgba(255,255,255,0.2)', color: '#E2E8F0', fontSize: '14px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '8px', textDecoration: 'none', background: 'transparent' }}>
                  Вже маю акаунт → Каталог
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

      {/* Як почати */}
      <section style={{ background: 'var(--bg-soft)', padding: '64px 0' }}>
        <div className="page-container">
          <h2 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '8px', textAlign: 'center' }}>Як почати закуповувати оптом</h2>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', textAlign: 'center', marginBottom: '48px' }}>Чотири кроки — від реєстрації до першого відвантаження</p>
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

      {/* Що отримуєте */}
      <section style={{ background: 'var(--bg-card)', padding: '64px 0' }}>
        <div className="page-container">
          <h2 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '8px', textAlign: 'center' }}>Умови оптової роботи</h2>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', textAlign: 'center', marginBottom: '48px' }}>Без прайсів у пошті та очікування відповіді менеджера</p>
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

      {/* Опт чи дропшипінг */}
      <section style={{ background: 'var(--bg-soft)', padding: '56px 0' }}>
        <div className="page-container">
          <div style={{ maxWidth: '820px', margin: '0 auto', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '16px', padding: '32px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <PackageCheck size={22} color="#4880B8" strokeWidth={1.75} />
              <h2 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Опт чи дропшипінг?</h2>
            </div>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.7, margin: '0 0 16px' }}>
              Опт — ви викуповуєте товар на свій склад за оптовою ціною і далі продаєте самостійно.
              Дропшипінг — складу не потрібно: ми відправляємо напряму вашому клієнту, а ви заробляєте
              на різниці між своєю ціною та дроп-ціною.
            </p>
            <Link href="/dropship" style={{ fontSize: '14px', fontWeight: 700, color: '#4880B8', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              Умови дропшипінгу <ArrowRight size={15} />
            </Link>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section style={{ background: 'var(--bg-card)', padding: '64px 0' }}>
        <div className="page-container">
          <h2 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '40px', textAlign: 'center' }}>Часті питання про опт</h2>
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
            Відкрийте оптові ціни за дві хвилини
          </h2>
          <p style={{ fontSize: '15px', color: '#94A3B8', margin: '0 0 28px' }}>
            Реєстрація безкоштовна, доступ вмикається одразу після підтвердження пошти.
          </p>
          <Link href="/register?type=dealer" style={{ height: '48px', padding: '0 30px', borderRadius: '10px', background: '#4880B8', color: '#fff', fontSize: '15px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '8px', textDecoration: 'none' }}>
            Зареєструватись <ArrowRight size={16} />
          </Link>
        </div>
      </section>

      <Footer />
    </>
  );
}

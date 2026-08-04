import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import {
  ArrowRight, Handshake, Hammer, Store, UserPlus, MailCheck, Tags, Truck,
  FileText, Boxes, ShieldCheck, Package, Layers, Clock,
} from 'lucide-react';
import Footer from '../components/Footer';
import Reveal from '../components/Reveal';
import ModelCompare from '../components/ModelCompare';
import { WHOLESALE_MIN } from '../../lib/site';
import { mergeVisibleBrands } from '../../lib/brands';
import { getBrandLogosCached, getVisibleBrandLogosCached } from '../../lib/supabase';

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
    text: 'Актуальні залишки онлайн, щоб не продавати те, чого немає на складі.',
  },
  {
    icon: Hammer,
    title: 'Підрядникам і будкомпаніям',
    text: 'Матеріали на об\'єкт однією поставкою — від піни до гідроізоляції.',
  },
  {
    icon: Store,
    title: 'Магазинам і рітейлерам',
    text: 'Наповнення полиці ходовими позиціями відомих брендів.',
  },
];

const stats = [
  { icon: Package, stat: '700+',  label: 'позицій у каталозі', text: 'Будівельна хімія та витратні матеріали' },
  { icon: Layers,  stat: '30+',   label: 'брендів',            text: 'Ceresit, Lacrysil, AURA, Knauf, Bitugum' },
  { icon: Tags,    stat: '3 000 ₴', label: 'мінімальне замовлення', text: 'Далі — ваша оптова ціна на кожну позицію' },
  { icon: Clock,   stat: '2 хв',  label: 'на реєстрацію',      text: 'Доступ вмикається без ручної модерації' },
];

const steps = [
  { n: '01', icon: UserPlus,  title: 'Реєстрація',              text: 'Обираєте свій тип: дилер, підрядник або магазин. Безкоштовно, заявку ніхто не розглядає вручну.' },
  { n: '02', icon: MailCheck, title: 'Підтвердження пошти',     text: 'Переходите за посиланням з листа. Оптовий статус вмикається автоматично.' },
  { n: '03', icon: Tags,      title: 'Оптові ціни в кабінеті',  text: 'В оптовому каталозі бачите свою ціну на кожну позицію та фактичний залишок.' },
  { n: '04', icon: Truck,     title: 'Замовлення й відвантаження', text: `Мінімальна сума — ${WHOLESALE_MIN} грн. Відправляємо Новою поштою по всій Україні.` },
];

const benefits = [
  { icon: Tags,        title: 'Ціна закріплена за акаунтом', text: 'Оптова ціна видно одразу в каталозі — без прайсів у пошті й листування з менеджером.' },
  { icon: Boxes,       title: 'Залишки в реальному часі',    text: 'Склад синхронізується з постачальниками автоматично, тож наявність відповідає фактичній.' },
  { icon: FileText,    title: 'Рахунок і накладна',          text: 'На кожне замовлення формуємо рахунок-фактуру та видаткову накладну — одразу в кабінеті.' },
  { icon: Truck,       title: 'Доставка по всій Україні',    text: 'Нова Пошта у будь-яке відділення або поштомат. Відвантажуємо з власного складу.' },
  { icon: Layers,      title: 'Уся хімія в одному замовленні', text: 'Герметики, піни, клеї, ґрунтовки, гідроізоляція, фарби та пластифікатори разом.' },
  { icon: ShieldCheck, title: 'Оригінал від виробників',     text: 'Працюємо з офіційними постачальниками — на кожну партію є документи походження.' },
];

const faq = [
  {
    q: 'Яка мінімальна сума оптового замовлення?',
    a: `Мінімальна сума оптового замовлення — ${WHOLESALE_MIN} грн. У кошику видно, скільки залишилось до мінімуму. Для роздрібної покупки мінімуму немає — можна брати від 1 штуки у звичайному магазині.`,
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
    a: `В опті ви викуповуєте товар на свій склад за оптовою ціною від ${WHOLESALE_MIN} грн. У дропшипінгу склад не потрібен — ми відправляємо напряму вашому клієнту від імені FIXLINE, а ви заробляєте на різниці.`,
  },
];

export default async function OptPage() {
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
      { '@type': 'ListItem', position: 1, name: 'Головна', item: BASE },
      { '@type': 'ListItem', position: 2, name: 'Опт', item: `${BASE}/opt` },
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
                  <span className="eyebrow on-dark">Оптовий напрям</span>
                  <h1 style={{ fontSize: 'clamp(30px, 4.5vw, 52px)', fontWeight: 900, color: '#fff', lineHeight: 1.15, margin: '14px 0 20px', letterSpacing: '-1px' }}>
                    Будівельна хімія<br />
                    <span className="grad-text">оптом</span>
                  </h1>
                </Reveal>
                <Reveal delay={90}>
                  <p style={{ fontSize: '17px', color: '#94A3B8', lineHeight: 1.7, marginBottom: '32px', maxWidth: '520px' }}>
                    Герметики, монтажні піни, клеї, ґрунтовки та гідроізоляція для дилерів,
                    підрядників і магазинів. Оптові ціни та фактичні залишки — в особистому
                    кабінеті, без прайсів у пошті.
                  </p>
                  <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                    <Link href="/register?type=dealer" style={{ height: '50px', padding: '0 30px', borderRadius: '12px', background: 'var(--brand-blue)', color: '#fff', fontSize: '15px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '8px', textDecoration: 'none', boxShadow: 'var(--brand-shadow)' }}>
                      Відкрити оптові ціни <ArrowRight size={16} />
                    </Link>
                    <Link href="/catalog" style={{ height: '50px', padding: '0 24px', borderRadius: '12px', border: '1.5px solid rgba(255,255,255,0.2)', color: '#E2E8F0', fontSize: '14px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '8px', textDecoration: 'none', background: 'rgba(255,255,255,0.04)' }}>
                      Вже маю акаунт → Каталог
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
                    <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', margin: '6px 0 6px' }}>{label}</div>
                    <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>{text}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ===== Як почати ===== */}
        <section style={{ background: 'var(--bg-soft)', padding: '72px 0' }}>
          <div className="page-container">
            <Reveal>
              <div style={{ textAlign: 'center', maxWidth: '620px', margin: '0 auto 48px' }}>
                <span className="eyebrow">Як почати</span>
                <h2 style={{ fontSize: 'clamp(24px, 3vw, 34px)', fontWeight: 900, color: 'var(--text-primary)', lineHeight: 1.3, margin: '12px 0 0', letterSpacing: '-0.5px' }}>
                  Чотири кроки до першого відвантаження
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

        {/* ===== Порівняння моделей ===== */}
        <section style={{ background: 'var(--bg-card)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', padding: '72px 0' }}>
          <div className="page-container">
            <Reveal>
              <div style={{ textAlign: 'center', maxWidth: '620px', margin: '0 auto 40px' }}>
                <span className="eyebrow alt">Що обрати</span>
                <h2 style={{ fontSize: 'clamp(24px, 3vw, 34px)', fontWeight: 900, color: 'var(--text-primary)', lineHeight: 1.3, margin: '12px 0 0', letterSpacing: '-0.5px' }}>
                  Роздріб, опт чи дропшипінг
                </h2>
              </div>
            </Reveal>
            <Reveal delay={100}>
              <ModelCompare lang="uk" highlight="opt" />
            </Reveal>
            <Reveal delay={160}>
              <p style={{ textAlign: 'center', fontSize: '14px', color: 'var(--text-secondary)', margin: '28px 0 0' }}>
                Працюєте без власного складу?{' '}
                <Link href="/dropship" style={{ color: 'var(--brand-blue)', fontWeight: 700, textDecoration: 'none' }}>
                  Умови дропшипінгу →
                </Link>
              </p>
            </Reveal>
          </div>
        </section>

        {/* ===== Умови ===== */}
        <section style={{ background: 'var(--bg-soft)', padding: '72px 0' }}>
          <div className="page-container">
            <Reveal>
              <div style={{ textAlign: 'center', maxWidth: '620px', margin: '0 auto 48px' }}>
                <span className="eyebrow">Умови роботи</span>
                <h2 style={{ fontSize: 'clamp(24px, 3vw, 34px)', fontWeight: 900, color: 'var(--text-primary)', lineHeight: 1.3, margin: '12px 0 0', letterSpacing: '-0.5px' }}>
                  Без прайсів у пошті та очікування менеджера
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

        {/* ===== Бренди ===== */}
        {brandTiles.length > 0 && (
          <section style={{ background: 'var(--bg-card)', borderTop: '1px solid var(--border)', padding: '64px 0' }}>
            <div className="page-container">
              <Reveal>
                <div style={{ textAlign: 'center', maxWidth: '620px', margin: '0 auto 36px' }}>
                  <span className="eyebrow alt">Асортимент</span>
                  <h2 style={{ fontSize: 'clamp(22px, 2.6vw, 30px)', fontWeight: 900, color: 'var(--text-primary)', lineHeight: 1.3, margin: '12px 0 0', letterSpacing: '-0.5px' }}>
                    Бренди, які ви отримуєте за оптовою ціною
                  </h2>
                </div>
              </Reveal>
              <Reveal delay={100}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '12px' }} className="opt-brands">
                  {brandTiles.map(({ name, logo, href, color, style }) => {
                    const logoSrc = brandLogos[name.toUpperCase()] ?? logo;
                    return (
                      <Link key={name} href={href} style={{
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
                Часті питання про опт
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
                Відкрийте <span className="grad-text">оптові ціни</span> за дві хвилини
              </h2>
              <p style={{ fontSize: '16px', color: '#94A3B8', margin: '0 auto 32px', maxWidth: '520px', lineHeight: 1.7 }}>
                Реєстрація безкоштовна, доступ вмикається одразу після підтвердження пошти.
              </p>
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
                <Link href="/register?type=dealer" style={{ height: '50px', padding: '0 32px', borderRadius: '12px', background: 'var(--brand-blue)', color: '#fff', fontSize: '15px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '8px', textDecoration: 'none', boxShadow: 'var(--brand-shadow)' }}>
                  Зареєструватись <ArrowRight size={16} />
                </Link>
                <Link href="/contacts" style={{ height: '50px', padding: '0 28px', borderRadius: '12px', border: '1.5px solid rgba(255,255,255,0.18)', color: '#E2E8F0', fontSize: '15px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.04)', textDecoration: 'none' }}>
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

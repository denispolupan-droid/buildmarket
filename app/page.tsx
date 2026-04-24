import Link from 'next/link';
import Image from 'next/image';
import { Zap, Users, Package, ClipboardList, ShieldCheck, Truck, Store, LayoutGrid } from 'lucide-react';
import { getCategories, getProducts } from '../lib/supabase';
import Footer from './components/Footer';
import CategorySection from './components/CategorySection';

const features = [
  {
    icon: Zap,
    title: 'Швидке замовлення',
    text: 'Додавання в кошик прямо з каталогу. Замовлення за артикулом.',
  },
  {
    icon: Users,
    title: 'Рівневі ціни',
    text: 'Персональні тарифи для дилерів, підрядників та магазинів.',
  },
  {
    icon: Package,
    title: 'Великий каталог',
    text: 'Понад 1000 артикулів з технічними характеристиками та фільтрами.',
  },
  {
    icon: ClipboardList,
    title: 'Управління замовленнями',
    text: 'Історія замовлень, повторне замовлення в один клік, відстеження доставок.',
  },
];

const trust = [
  {
    icon: ShieldCheck,
    bg: '#EFF6FF', iconColor: '#2563EB',
    title: 'Гарантована якість',
    text: 'Всі продукти сертифіковані. Доступні технічні паспорти. Комплексні гарантії.',
  },
  {
    icon: Truck,
    bg: '#EFF6FF', iconColor: '#2563EB',
    title: 'Швидка доставка',
    text: 'Надійна доставка. Видима наявність на складі. Персональний менеджер.',
  },
  {
    icon: Users,
    bg: '#EFF6FF', iconColor: '#2563EB',
    title: 'B2B фокус',
    text: 'Створено для оптової торгівлі. Знижки на великі обсяги. Шаблони для повторних замовлень.',
  },
];


export default async function Home() {
  const { createSupabaseServer } = await import('../lib/supabase-server');
  const { getRole } = await import('../lib/user-role');
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  const role = getRole(user);
  const saleHref = role === 'wholesale' ? '/catalog?sale=1' : '/shop?sale=1';

  const [categories, products] = await Promise.all([
    getCategories(),
    getProducts(),
  ]);

  const orgLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'FIXLINE',
    url: 'https://fixline.com.ua',
    logo: 'https://fixline.com.ua/fixline-logo.png',
    contactPoint: { '@type': 'ContactPoint', contactType: 'sales', availableLanguage: 'Ukrainian' },
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(orgLd) }} />
      {/* Promo banner */}
      <div style={{ background: '#1E3A5F', padding: '6px 24px', textAlign: 'center' }}>
        <span style={{ fontSize: '12px', fontWeight: 700, color: '#fff' }}>
          ⚡ 🎁 ВЕСНЯНА{' '}
          <Link href={saleHref} style={{
            color: '#FEF08A', textDecoration: 'underline', textUnderlineOffset: '2px',
          }}>
            АКЦІЯ
          </Link>
          ! Знижки до{' '}
          <span style={{ color: '#FEF08A' }}>25%</span>{' '}
          на герметики та монтажні піни до кінця квітня ⚡
        </span>
      </div>

      {/* Hero */}
      <section style={{
        position: 'relative', overflow: 'hidden',
        background: 'linear-gradient(160deg, #0F172A 0%, #1E3A5F 100%)',
        padding: '0',
      }}>
        {/* Dot grid */}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.07) 1px, transparent 1px)',
          backgroundSize: '28px 28px',
        }} />

        {/* Content */}
        <div style={{ position: 'relative', zIndex: 1, textAlign: 'center', padding: '48px 24px 52px' }}>
          <Image
            src="/fixline-logo.png" alt="FIXLINE"
            width={260} height={80} priority
            style={{ height: '72px', width: 'auto', display: 'block', margin: '0 auto 20px' }}
          />
          <h1 style={{
            fontSize: 'clamp(22px, 3vw, 34px)', fontWeight: 800,
            color: '#fff', lineHeight: 1.2, marginBottom: '10px',
          }}>
            Професійна будівельна хімія
          </h1>
          <p style={{ fontSize: '14px', color: '#94A3B8', marginBottom: '4px' }}>
            Герметики · Клеї · Монтажні піни · Ґрунтовки · Фарби · Рідкі цвяхи · Стрічки
          </p>
          <p style={{ fontSize: '13px', color: '#64748B', marginBottom: '24px' }}>
            гуртом та в роздріб · доставка по Україні
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <Link href="/shop" style={{
              height: '40px', padding: '0 24px', borderRadius: '10px',
              background: '#2563EB', color: '#fff', fontSize: '14px', fontWeight: 700,
              display: 'inline-flex', alignItems: 'center', gap: '8px',
            }}>
              <Store size={15} />Перейти до магазину
            </Link>
            <Link href="/catalog" style={{
              height: '40px', padding: '0 24px', borderRadius: '10px',
              border: '1.5px solid rgba(255,255,255,0.2)', color: '#E2E8F0',
              fontSize: '14px', fontWeight: 600,
              display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'transparent',
            }}>
              <LayoutGrid size={15} />Оптовий каталог
            </Link>
          </div>
        </div>
      </section>


      {/* Two paths */}
      <section style={{ background: 'var(--bg-card)', padding: '48px 0' }}>
        <div className="page-container">
          <h2 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', textAlign: 'center', marginBottom: '8px' }}>
            Оберіть зручний формат покупки
          </h2>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', textAlign: 'center', marginBottom: '32px' }}>
            Ми працюємо як з приватними покупцями, так і з бізнесом
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', maxWidth: '860px', margin: '0 auto' }}>

            {/* Retail */}
            <div style={{
              border: '1px solid var(--border)', borderRadius: '16px',
              padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: '14px',
              background: 'var(--bg-card)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'var(--bg-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Store size={20} color="var(--text-secondary)" strokeWidth={1.75} />
                </div>
                <h3 style={{ fontSize: '17px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Магазин</h3>
              </div>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
                Для приватних покупців. Купуйте від 1 одиниці за привабливими цінами. Реєстрація не обов&apos;язкова.
              </p>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '5px' }}>
                {['Від 1 штуки', 'Кращі ціни', 'Без реєстрації', 'Доставка по Україні'].map(item => (
                  <li key={item} style={{ fontSize: '13px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'var(--text-secondary)', flexShrink: 0, opacity: 0.4 }} />
                    {item}
                  </li>
                ))}
              </ul>
              <Link href="/shop" style={{
                marginTop: 'auto', height: '40px', borderRadius: '10px',
                background: '#2563EB', color: '#fff', fontSize: '13px', fontWeight: 700,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
              }}>
                <Store size={14} />Перейти до магазину
              </Link>
            </div>

            {/* Wholesale */}
            <div style={{
              border: '1px solid var(--border)', borderRadius: '16px',
              padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: '14px',
              background: 'var(--bg-card)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'var(--bg-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <LayoutGrid size={20} color="var(--text-secondary)" strokeWidth={1.75} />
                </div>
                <h3 style={{ fontSize: '17px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Оптовий каталог</h3>
              </div>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
                Для дилерів, підрядників та магазинів. Оптові ціни та персональні умови для вашого бізнесу.
              </p>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '5px' }}>
                {['Оптові ціни', 'Персональні тарифи', 'Табличний каталог', 'Рахунки-фактури'].map(item => (
                  <li key={item} style={{ fontSize: '13px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'var(--text-secondary)', flexShrink: 0, opacity: 0.4 }} />
                    {item}
                  </li>
                ))}
              </ul>
              <Link href="/login?next=/catalog" style={{
                marginTop: 'auto', height: '40px', borderRadius: '10px',
                background: '#2563EB', color: '#fff', fontSize: '13px', fontWeight: 700,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
              }}>
                <LayoutGrid size={14} />Оптовий каталог
              </Link>
            </div>

          </div>
        </div>
      </section>

      {/* Features */}
      <section style={{ background: 'var(--bg-page)', padding: '28px 0' }}>
        <div className="page-container">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '28px' }}>
            {features.map(({ icon: Icon, title, text }) => (
              <div key={title} style={{ textAlign: 'center' }}>
                <div style={{
                  width: '48px', height: '48px', borderRadius: '14px', background: 'var(--bg-soft)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px',
                }}>
                  <Icon size={22} color="var(--text-secondary)" strokeWidth={1.75} />
                </div>
                <h3 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>{title}</h3>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Categories carousel + interactive preview */}
      {categories.length > 0 && (
        <section style={{ background: 'var(--bg-soft)', padding: '20px 0 44px' }}>
          <div className="page-container">
            <h2 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)', textAlign: 'center', marginBottom: '6px' }}>
              Категорії продукції
            </h2>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', textAlign: 'center', marginBottom: '32px' }}>
              Оберіть категорію для швидкого доступу до магазину або оптового каталогу
            </p>
            <CategorySection categories={categories} products={products} role={role} />
          </div>
        </section>
      )}

      {/* Trust strip */}
      <section style={{ background: 'var(--bg-card)', padding: '40px 0' }}>
        <div className="page-container">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '36px' }}>
            {trust.map(({ icon: Icon, bg, iconColor, title, text }) => (
              <div key={title} style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
                <div style={{
                  width: '40px', height: '40px', borderRadius: '10px', flexShrink: 0,
                  background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Icon size={18} color={iconColor} strokeWidth={2} />
                </div>
                <div>
                  <h3 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '5px' }}>{title}</h3>
                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>{text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ background: '#0F172A', padding: '48px 0', textAlign: 'center' }}>
        <div className="page-container">
          <h2 style={{ fontSize: '24px', fontWeight: 800, color: '#fff', marginBottom: '10px' }}>
            Готові зробити замовлення?
          </h2>
          <p style={{ fontSize: '14px', color: '#64748B', marginBottom: '28px' }}>
            Магазин — без реєстрації. Оптовий каталог — після входу в акаунт.
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <Link href="/shop" style={{
              height: '44px', padding: '0 24px', borderRadius: '10px',
              background: '#2563EB', color: '#fff', fontSize: '14px', fontWeight: 700,
              display: 'inline-flex', alignItems: 'center', gap: '7px',
            }}>
              <Store size={15} />До магазину
            </Link>
            <Link href="/login?next=/catalog" style={{
              height: '44px', padding: '0 24px', borderRadius: '10px',
              border: '1px solid rgba(255,255,255,0.12)', color: '#94A3B8',
              fontSize: '14px', fontWeight: 600,
              display: 'inline-flex', alignItems: 'center', gap: '7px', background: 'transparent',
            }}>
              <LayoutGrid size={15} />Оптовий каталог
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </>
  );
}

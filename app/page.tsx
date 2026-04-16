import Link from 'next/link';
import { Zap, Users, Package, ClipboardList, ShieldCheck, Truck } from 'lucide-react';
import { getCategories, getProducts } from '../lib/supabase';
import Footer from './components/Footer';
import CategorySection from './components/CategorySection';

const features = [
  {
    icon: Zap,
    title: 'Швидке замовлення',
    text: 'Вигляд таблиці як у Excel. Додавання в кошик прямо з каталогу. Швидке замовлення за артикулом.',
  },
  {
    icon: Users,
    title: 'Рівневі ціни',
    text: 'Персоналізовані ціни залежно від рівня вашого бізнесу. Оптові тарифи 1, 2 або підрядник.',
  },
  {
    icon: Package,
    title: 'Великий каталог',
    text: 'Понад 1000 артикулів. Розширений фільтр. Пошук за характеристиками. Технічні дані доступні.',
  },
  {
    icon: ClipboardList,
    title: 'Управління замовленнями',
    text: 'Історія замовлень. Повторне замовлення в один клік. Відстеження доставок. Управління обліковим записом.',
  },
];

const trust = [
  {
    icon: ShieldCheck,
    bg: '#D1FAE5', iconColor: '#059669',
    title: 'Гарантована якість',
    text: 'Всі продукти сертифіковані. Доступні технічні паспорти. Комплексні гарантії.',
  },
  {
    icon: Truck,
    bg: '#DBEAFE', iconColor: '#2563EB',
    title: 'Швидка доставка',
    text: 'Надійна доставка. Видима наявність на складі. Персональний менеджер.',
  },
  {
    icon: Users,
    bg: '#EDE9FE', iconColor: '#7C3AED',
    title: 'B2B фокус',
    text: 'Створено для оптової торгівлі. Знижки на великі обсяги. Шаблони для повторних замовлень.',
  },
];

export default async function Home() {
  const [categories, products] = await Promise.all([
    getCategories(),
    getProducts(),
  ]);

  return (
    <>
      {/* Promo banner */}
      <div style={{ background: '#0EA5E9', padding: '6px 24px', textAlign: 'center' }}>
        <span style={{ fontSize: '12px', fontWeight: 700, color: '#fff' }}>
          ⚡ 🎁 ВЕСНЯНА АКЦІЯ! Знижки до{' '}
          <span style={{ color: '#FEF08A' }}>25%</span>{' '}
          на герметики та монтажні піни до кінця квітня ⚡
        </span>
      </div>

      {/* Hero */}
      <section style={{
        background: 'linear-gradient(160deg, #0F172A 0%, #1E3A5F 100%)',
        padding: '52px 24px 58px', textAlign: 'center',
      }}>
        <img
          src="/fixhub-logo2.png" alt="FIXLINE"
          style={{ height: '44px', display: 'block', margin: '0 auto 22px', filter: 'brightness(0) invert(1)' }}
        />
        <h1 style={{
          fontSize: 'clamp(24px, 3.5vw, 42px)', fontWeight: 800,
          color: '#fff', lineHeight: 1.15, marginBottom: '12px',
        }}>
          Професійна B2B платформа<br />будівельної хімії
        </h1>
        <p style={{ fontSize: '15px', color: '#94A3B8', marginBottom: '28px' }}>
          Герметики · Клеї · Монтажні піни · Швидке замовлення · Оптові ціни
        </p>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <Link href="/catalog" style={{
            height: '44px', padding: '0 28px', borderRadius: '10px',
            background: '#fff', color: '#0F172A', fontSize: '15px', fontWeight: 700,
            display: 'inline-flex', alignItems: 'center', gap: '8px',
          }}>
            Переглянути каталог →
          </Link>
          <Link href="/login" style={{
            height: '44px', padding: '0 28px', borderRadius: '10px',
            border: '1.5px solid rgba(255,255,255,0.25)', color: '#E2E8F0',
            fontSize: '15px', fontWeight: 600,
            display: 'inline-flex', alignItems: 'center', background: 'transparent',
          }}>
            Вхід
          </Link>
        </div>
      </section>


      {/* Features */}
      <section style={{ background: '#fff', padding: '40px 0 44px' }}>
        <div className="page-container">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '28px' }}>
            {features.map(({ icon: Icon, title, text }) => (
              <div key={title} style={{ textAlign: 'center' }}>
                <div style={{
                  width: '48px', height: '48px', borderRadius: '14px', background: '#F1F5F9',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px',
                }}>
                  <Icon size={22} color="#475569" strokeWidth={1.75} />
                </div>
                <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A', marginBottom: '8px' }}>{title}</h3>
                <p style={{ fontSize: '13px', color: '#64748B', lineHeight: 1.6 }}>{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Categories carousel + interactive preview */}
      {categories.length > 0 && (
        <section style={{ background: '#F8FAFC', padding: '36px 0 44px' }}>
          <div className="page-container">
            <h2 style={{ fontSize: '24px', fontWeight: 800, color: '#0F172A', textAlign: 'center', marginBottom: '6px' }}>
              Категорії продукції
            </h2>
            <p style={{ fontSize: '14px', color: '#64748B', textAlign: 'center', marginBottom: '32px' }}>
              Оберіть категорію для швидкого доступу до каталогу
            </p>
            <CategorySection categories={categories} products={products} />
          </div>
        </section>
      )}

      {/* Trust strip */}
      <section style={{ background: '#fff', padding: '40px 0' }}>
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
                  <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A', marginBottom: '5px' }}>{title}</h3>
                  <p style={{ fontSize: '13px', color: '#64748B', lineHeight: 1.6 }}>{text}</p>
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
            Готові почати замовлення?
          </h2>
          <p style={{ fontSize: '14px', color: '#64748B', marginBottom: '28px' }}>
            Увійдіть, щоб отримати доступ до персоналізованих цін та зробити перше замовлення
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <Link href="/login" style={{
              height: '44px', padding: '0 24px', borderRadius: '10px',
              background: '#2563EB', color: '#fff', fontSize: '14px', fontWeight: 700,
              display: 'inline-flex', alignItems: 'center',
            }}>
              Увійти →
            </Link>
            <Link href="/catalog" style={{
              height: '44px', padding: '0 24px', borderRadius: '10px',
              border: '1px solid rgba(255,255,255,0.12)', color: '#94A3B8',
              fontSize: '14px', fontWeight: 600,
              display: 'inline-flex', alignItems: 'center', background: 'transparent',
            }}>
              Переглянути каталог
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </>
  );
}

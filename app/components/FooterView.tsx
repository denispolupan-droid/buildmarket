'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Mail, Phone, MapPin, Clock4, Send } from 'lucide-react';
import { getCategoryNameRu } from '../../lib/ru';
import type { Category } from '../../lib/supabase';
import LanguageSwitcher from './LanguageSwitcher';
import CopyEmailButton from './CopyEmailButton';

import { brandSlug as brandToSlug } from '../../lib/seo/slug';

function ViberIcon() {
  return (
    <span
      style={{
        width: '18px', height: '18px', display: 'inline-block',
        backgroundColor: 'currentColor',
        WebkitMaskImage: 'url(/viber-icon.png)', maskImage: 'url(/viber-icon.png)',
        WebkitMaskSize: 'contain', maskSize: 'contain',
        WebkitMaskRepeat: 'no-repeat', maskRepeat: 'no-repeat',
        WebkitMaskPosition: 'center', maskPosition: 'center',
      }}
    />
  );
}

function SocialLink({ href, title, children }: { href: string; title: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={title}
      className="btn-social"
      style={{
        width: '36px', height: '36px', borderRadius: '8px',
        background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94A3B8',
        flexShrink: 0,
      }}
    >
      {children}
    </a>
  );
}

const serviceLinks = [
  // Оптовий напрям стоїть першим: на /opt вело лише одне контентне посилання з
  // усього сайту, хоча саме він — посадкова для комерційних оптових запитів.
  { labelUk: 'Будівельна хімія оптом', labelRu: 'Строительная химия оптом', hrefUk: '/opt',      hrefRu: '/ru/opt' },
  { labelUk: "Про компанію",        labelRu: 'О компании',               hrefUk: '/about',    hrefRu: '/ru/about' },
  { labelUk: "Зв'яжіться з нами",   labelRu: 'Свяжитесь с нами',         hrefUk: '/contacts', hrefRu: '/ru/contacts' },
  { labelUk: 'Умови доставки',      labelRu: 'Условия доставки',          hrefUk: '/delivery', hrefRu: '/ru/delivery' },
  { labelUk: 'Політика повернення', labelRu: 'Политика возврата',         hrefUk: '/returns',  hrefRu: '/ru/returns' },
  { labelUk: 'Калькулятори витрати', labelRu: 'Калькуляторы расхода',     hrefUk: '/calculators', hrefRu: '/ru/calculators' },
  { labelUk: 'Часті питання',       labelRu: 'Часто задаваемые вопросы',  hrefUk: '/blog',     hrefRu: '/ru/blog' },
];

export default function FooterView({ categories, topBrands }: { categories: Category[]; topBrands: string[] }) {
  // Мову визначаємо на клієнті (usePathname), а не через await headers() у server-компоненті —
  // інакше Footer переводив би кожну сторінку з ним у dynamic rendering і ламав ISR.
  const pathname = usePathname() ?? '';
  const isRu = pathname.startsWith('/ru');
  const shopBase = isRu ? '/ru/shop' : '/shop';
  const parentCats = categories.filter(c => !c.parent_slug);

  return (
    <footer style={{ background: '#1A2744' }}>
      <div className="footer-inner" style={{ maxWidth: '1280px', margin: '0 auto', padding: '48px 32px 0' }}>
        <div className="footer-grid" style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr 1fr 1fr', gap: '36px', paddingBottom: '40px' }}>

          {/* Brand */}
          <div>
            <Image
              src="/fixline-logo-white.svg" alt="FIXLINE"
              width={136} height={26}
              style={{ width: 'auto', height: '26px', display: 'block', marginBottom: '16px' }}
            />
            <p style={{ fontSize: '14px', color: '#94A3B8', lineHeight: '1.7', maxWidth: '300px', marginBottom: '20px' }}>
              {isRu
                ? 'Профессиональный B2B поставщик строительной химии: герметики, клеи, монтажные пены и сопутствующие материалы.'
                : 'Професійний B2B постачальник будівельної хімії: герметиків, клеїв, монтажних пін та супутніх матеріалів.'
              }
            </p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <CopyEmailButton email="info@fixline.com.ua" />
              <SocialLink href="https://t.me/+380991997788" title="Telegram">
                <Send size={18} strokeWidth={2} />
              </SocialLink>
              <SocialLink href="viber://chat?number=%2B380991997788" title="Viber">
                <ViberIcon />
              </SocialLink>
            </div>
          </div>

          {/* Categories */}
          <div>
            <p style={{ fontSize: '14px', fontWeight: 700, color: '#F1F5F9', marginBottom: '18px' }}>
              {isRu ? 'Категории' : 'Категорії'}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {parentCats.slice(0, 6).map(cat => (
                <Link key={cat.slug} href={`${shopBase}/${cat.slug}`} style={{ fontSize: '13px', color: '#94A3B8', textDecoration: 'none' }}>
                  {isRu ? getCategoryNameRu(cat.slug, cat.name) : cat.name}
                </Link>
              ))}
              {parentCats.length > 6 && (
                <details className="footer-details">
                  <summary>{isRu ? `Ещё ${parentCats.length - 6}` : `Ще ${parentCats.length - 6}`}</summary>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '10px' }}>
                    {parentCats.slice(6).map(cat => (
                      <Link key={cat.slug} href={`${shopBase}/${cat.slug}`} style={{ fontSize: '13px', color: '#94A3B8', textDecoration: 'none' }}>
                        {isRu ? getCategoryNameRu(cat.slug, cat.name) : cat.name}
                      </Link>
                    ))}
                  </div>
                </details>
              )}
            </div>
          </div>

          {/* Brands */}
          <div>
            <p style={{ fontSize: '14px', fontWeight: 700, color: '#F1F5F9', marginBottom: '18px' }}>
              {isRu ? 'Бренды' : 'Бренди'}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {topBrands.slice(0, 6).map(brand => (
                <Link key={brand} href={`${shopBase}/brand/${brandToSlug(brand)}`} style={{ fontSize: '13px', color: '#94A3B8', textDecoration: 'none' }}>
                  {brand}
                </Link>
              ))}
              {topBrands.length > 6 && (
                <details className="footer-details">
                  <summary>{isRu ? `Ещё ${topBrands.length - 6}` : `Ще ${topBrands.length - 6}`}</summary>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '10px' }}>
                    {topBrands.slice(6).map(brand => (
                      <Link key={brand} href={`${shopBase}/brand/${brandToSlug(brand)}`} style={{ fontSize: '13px', color: '#94A3B8', textDecoration: 'none' }}>
                        {brand}
                      </Link>
                    ))}
                  </div>
                </details>
              )}
            </div>
          </div>

          {/* Service */}
          <div>
            <p style={{ fontSize: '14px', fontWeight: 700, color: '#F1F5F9', marginBottom: '18px' }}>
              {isRu ? 'Сервис' : 'Обслуговування'}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {serviceLinks.map(({ labelUk, labelRu, hrefUk, hrefRu }) => (
                <Link key={hrefUk} href={isRu ? hrefRu : hrefUk} style={{ fontSize: '14px', color: '#94A3B8', textDecoration: 'none' }}>
                  {isRu ? labelRu : labelUk}
                </Link>
              ))}
            </div>
          </div>

          {/* Contacts */}
          <div>
            <p style={{ fontSize: '14px', fontWeight: 700, color: '#F1F5F9', marginBottom: '18px' }}>{isRu ? 'Контакты' : 'Контакти'}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <a href="mailto:info@fixline.com.ua" style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                fontSize: '14px', color: '#94A3B8', textDecoration: 'none',
              }}>
                <Mail size={15} strokeWidth={2} color="#7B90B2" />
                info@fixline.com.ua
              </a>
              <a href="tel:+380991997788" style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                fontSize: '14px', color: '#94A3B8', textDecoration: 'none',
              }}>
                <Phone size={15} strokeWidth={2} color="#7B90B2" />
                +38 (099) 199-77-88
              </a>
              <span style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', color: '#7B90B2' }}>
                <Clock4 size={15} strokeWidth={2} />
                Пн–Пт 9:00–16:00
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', color: '#7B90B2' }}>
                <MapPin size={15} strokeWidth={2} />
                {isRu ? 'Украина' : 'Україна'}
              </span>
            </div>

            {/* Mobile-only — the brand column (which carries these on desktop) is hidden
                on mobile, so give the messaging icons a spot that stays visible there. */}
            <div className="footer-social-row-mobile">
              <CopyEmailButton email="info@fixline.com.ua" />
              <SocialLink href="https://t.me/+380991997788" title="Telegram">
                <Send size={18} strokeWidth={2} />
              </SocialLink>
              <SocialLink href="viber://chat?number=%2B380991997788" title="Viber">
                <ViberIcon />
              </SocialLink>
            </div>
          </div>

        </div>

        <div style={{
          borderTop: '1px solid rgba(255,255,255,0.07)',
          padding: '18px 0',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{ fontSize: '13px', color: '#64748B' }}>
            {isRu ? '© 2026 FIXLINE. Все права защищены.' : '© 2026 FIXLINE. Всі права захищені.'}
          </span>
          <LanguageSwitcher />
        </div>
      </div>
    </footer>
  );
}

import Image from 'next/image';
import Link from 'next/link';
import { Mail, Phone, MapPin, Clock4 } from 'lucide-react';
import { headers } from 'next/headers';
import { getCategoriesCached, getProductsCached } from '../../lib/supabase';
import { getCategoryNameRu } from '../../lib/ru';
import LanguageSwitcher from './LanguageSwitcher';

function brandToSlug(brand: string): string {
  return brand.trim().toLowerCase().replace(/\s+/g, '-');
}

function InstagramIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/>
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" strokeWidth="3"/>
    </svg>
  );
}

function ViberIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3C7.03 3 3 6.58 3 11c0 2.5 1.22 4.73 3.13 6.26V20l2.87-1.43c.97.24 1.98.37 3 .37 4.97 0 9-3.58 9-8S16.97 3 12 3z"/>
      <path d="M9.5 9.5c.3.8.8 1.6 1.5 2.3s1.5 1.2 2.3 1.5"/>
      <path d="M14.5 14.5c.4-.1.7-.4.7-.8a3.3 3.3 0 0 0-1-2 3.3 3.3 0 0 0-2-1c-.4 0-.7.3-.8.7"/>
    </svg>
  );
}

const socials: { label: string; href: string; icon: React.ReactNode }[] = [
  { label: 'Email', href: 'mailto:info@fixline.com.ua', icon: <Mail size={20} strokeWidth={2} /> },
];

const serviceLinks = [
  { labelUk: "Про компанію",        labelRu: 'О компании',               hrefUk: '/about',    hrefRu: '/ru/about' },
  { labelUk: "Зв'яжіться з нами",   labelRu: 'Свяжитесь с нами',         hrefUk: '/contacts', hrefRu: '/ru/contacts' },
  { labelUk: 'Умови доставки',      labelRu: 'Условия доставки',          hrefUk: '/delivery', hrefRu: '/ru/delivery' },
  { labelUk: 'Політика повернення', labelRu: 'Политика возврата',         hrefUk: '/returns',  hrefRu: '/ru/returns' },
  { labelUk: 'Часті питання',       labelRu: 'Часто задаваемые вопросы',  hrefUk: '/blog',     hrefRu: '/ru/blog' },
];

export default async function Footer() {
  const [categories, allProducts, headersList] = await Promise.all([
    getCategoriesCached(),
    getProductsCached(),
    headers(),
  ]);
  const pathname = headersList.get('x-pathname') ?? '';
  const isRu = pathname.startsWith('/ru');
  const shopBase = isRu ? '/ru/shop' : '/shop';
  const parentCats = categories.filter(c => !c.parent_slug);

  const brandCounts = new Map<string, number>();
  for (const p of allProducts) {
    const b = p.brand?.trim();
    if (b) brandCounts.set(b, (brandCounts.get(b) ?? 0) + 1);
  }
  const topBrands = [...brandCounts.entries()]
    .filter(([, count]) => count >= 5)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([brand]) => brand);

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
              {socials.map(({ label, href, icon }) => (
                <a key={label} href={href} title={label} className="btn-social" style={{
                  width: '36px', height: '36px', borderRadius: '8px',
                  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94A3B8',
                }}>
                  {icon}
                </a>
              ))}
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

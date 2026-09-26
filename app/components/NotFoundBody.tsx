'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { getCategoryNameRu } from '../../lib/ru';

/**
 * Тіло сторінки 404. Клієнтський, бо not-found не знає адреси запиту, а
 * мова береться з неї (/ru…). Категорії приходять із сервера — лише ті, де є
 * товар (порожній листинг для заблукалого читача — друга 404 поспіль).
 */
export default function NotFoundBody({ categories }: { categories: { slug: string; name: string }[] }) {
  const pathname = usePathname();
  const ru = pathname.startsWith('/ru');
  const p = ru ? '/ru' : '';
  const L = ru
    ? { title: 'Страница не найдена', text: 'Возможно, товар сняли с продажи или адрес введён с ошибкой. Начните с каталога или популярных разделов.', shop: 'В каталог', home: 'На главную', cats: 'Популярные разделы', blog: 'Советы в блоге' }
    : { title: 'Сторінку не знайдено', text: 'Можливо, товар зняли з продажу або адресу введено з помилкою. Почніть з каталогу або популярних розділів.', shop: 'До каталогу', home: 'На головну', cats: 'Популярні розділи', blog: 'Поради в блозі' };

  return (
    <div style={{ minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-page)' }}>
      <div style={{ textAlign: 'center', padding: '40px 20px', maxWidth: '720px' }}>
        <div style={{
          fontSize: '84px', fontWeight: 900, lineHeight: 1, letterSpacing: '-3px',
          background: 'linear-gradient(135deg, var(--brand-blue) 20%, var(--brand-teal-bright))',
          WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent',
        }}>404</div>
        <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)', margin: '16px 0 8px' }}>{L.title}</h1>
        <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '28px' }}>{L.text}</p>
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href={`${p}/shop`} style={{
            height: '44px', padding: '0 24px', borderRadius: '10px', background: '#1E3A5F', color: '#fff',
            fontSize: '14px', fontWeight: 700, display: 'inline-flex', alignItems: 'center',
          }}>{L.shop}</Link>
          <Link href={p || '/'} style={{
            height: '44px', padding: '0 24px', borderRadius: '10px', border: '1px solid var(--border)',
            background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '14px', fontWeight: 600,
            display: 'inline-flex', alignItems: 'center',
          }}>{L.home}</Link>
          <Link href={`${p}/blog`} style={{
            height: '44px', padding: '0 24px', borderRadius: '10px', border: '1px solid var(--border)',
            background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '14px', fontWeight: 600,
            display: 'inline-flex', alignItems: 'center',
          }}>{L.blog}</Link>
        </div>
        {categories.length > 0 && (
          <nav aria-label={L.cats} style={{ marginTop: '36px' }}>
            <div style={{ fontSize: '12px', letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '12px' }}>{L.cats}</div>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center' }}>
              {categories.map(c => (
                <li key={c.slug}>
                  <Link href={`${p}/shop/${c.slug}`} style={{
                    display: 'inline-block', padding: '8px 14px', borderRadius: '999px', border: '1px solid var(--border)',
                    background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: '13px', textDecoration: 'none',
                  }}>{ru ? getCategoryNameRu(c.slug, c.name) : c.name}</Link>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </div>
    </div>
  );
}

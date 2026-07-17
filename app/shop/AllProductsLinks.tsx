import Link from 'next/link';
import type { ProductListItem } from '../../types';
import { productDisplayName, retailPrice } from '../../lib/seo/meta';

// SEO: клієнтський листинг рендерить лише перші 24 товари, «Показати більше» —
// кнопка без href, тож товари глибше 24-ї позиції не мають внутрішніх посилань.
// Цей серверний блок дає краулеру посилання на ВСІ товари листингу, не чіпаючи
// клієнтський UI та ISR-кеш.

type Props = {
  products: ProductListItem[];
  lang?: 'uk' | 'ru';
};

const MIN_PRODUCTS = 25; // до 24 товарів усі посилання і так у листингу

export default function AllProductsLinks({ products, lang = 'uk' }: Props) {
  if (products.length < MIN_PRODUCTS) return null;
  const prefix = lang === 'ru' ? '/ru' : '';
  const title = lang === 'ru' ? `Все товары раздела (${products.length})` : `Усі товари розділу (${products.length})`;

  return (
    <details style={{ marginTop: '24px', padding: '12px 20px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-card)' }}>
      <summary style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', cursor: 'pointer' }}>
        {title}
      </summary>
      <ul style={{ listStyle: 'none', margin: '12px 0 0', padding: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '6px 16px' }}>
        {products.map(p => {
          const price = retailPrice(p);
          return (
            <li key={p.sku} style={{ fontSize: '13px', lineHeight: 1.5 }}>
              <Link href={`${prefix}/product/${p.slug ?? p.sku}`} style={{ color: 'var(--brand-main)', textDecoration: 'none' }}>
                {productDisplayName(p, lang)}
              </Link>
              {price ? <span style={{ color: 'var(--text-muted)' }}> — {price} грн</span> : null}
            </li>
          );
        })}
      </ul>
    </details>
  );
}

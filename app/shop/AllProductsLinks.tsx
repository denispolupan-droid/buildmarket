import Link from 'next/link';
import type { ProductPublic } from '../../types';
import { productDisplayName, retailPrice } from '../../lib/seo/meta';

// SEO: клієнтський листинг рендерить лише перші 24 товари, «Показати більше» —
// кнопка без href, тож товари глибше 24-ї позиції не мають внутрішніх посилань.
// Цей серверний блок дає краулеру посилання на ВСІ товари листингу, не чіпаючи
// клієнтський UI та ISR-кеш.
//
// Людині, яка його розгорнула, він служить покажчиком, тому згруповано за
// брендом: суцільний список із 200+ однакових синіх рядків очима не читається.
// Мініатюр тут свідомо немає — перші 24 товари вже показані картками з фото
// вище, а в найбільшій категорії 207 позицій, і стільки ж зайвих зображень
// коштували б категорійній сторінці ваги на рівному місці.

type Props = {
  products: ProductPublic[];
  lang?: 'uk' | 'ru';
};

const MIN_PRODUCTS = 25; // до 24 товарів усі посилання і так у листингу

/**
 * Назва без бренду — усередині групи бренд і так у заголовку.
 * Прибираємо лише окреме слово й лише перше входження; якщо після цього
 * лишається огризок, віддаємо повну назву.
 */
function stripBrand(name: string, brand: string): string {
  const b = brand.trim();
  if (!b) return name;
  const escaped = b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const short = name.replace(new RegExp(`(?<!\\p{L})${escaped}(?!\\p{L})`, 'iu'), '').replace(/\s{2,}/g, ' ').trim();
  return short.length >= 6 ? short : name;
}

export default function AllProductsLinks({ products, lang = 'uk' }: Props) {
  if (products.length < MIN_PRODUCTS) return null;
  const prefix = lang === 'ru' ? '/ru' : '';
  const title = lang === 'ru' ? `Все товары раздела (${products.length})` : `Усі товари розділу (${products.length})`;

  // Групуємо за брендом; усередині — за назвою з числовим порівнянням, щоб
  // «3 кг» стояло перед «10 кг», а не після (звичайне сортування рядків).
  const byBrand = new Map<string, ProductPublic[]>();
  for (const p of products) {
    const brand = p.brand?.trim() || '—';
    if (!byBrand.has(brand)) byBrand.set(brand, []);
    byBrand.get(brand)!.push(p);
  }
  const groups = [...byBrand.entries()]
    .map(([brand, items]) => ({
      brand,
      items: [...items].sort((a, b) =>
        productDisplayName(a, lang).localeCompare(productDisplayName(b, lang), 'uk', { numeric: true })),
    }))
    .sort((a, b) => a.brand.localeCompare(b.brand, 'uk'));

  return (
    <details className="apl" style={{ marginTop: '24px', padding: '12px 20px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-card)' }}>
      <summary style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', cursor: 'pointer' }}>
        {title}
      </summary>

      <div className="apl-cols">
        {groups.map(({ brand, items }) => (
          <section key={brand} className="apl-group">
            <h3 className="apl-brand">
              {brand}
              <span className="apl-count">{items.length}</span>
            </h3>
            <ul className="apl-list">
              {items.map(p => {
                const price = retailPrice(p);
                return (
                  <li key={p.sku} className="apl-row">
                    <Link href={`${prefix}/product/${p.slug ?? p.sku}`} className="apl-link">
                      {stripBrand(productDisplayName(p, lang), p.brand ?? '')}
                    </Link>
                    {price ? <span className="apl-price">{price} грн</span> : <span />}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </details>
  );
}

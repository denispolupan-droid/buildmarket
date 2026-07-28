import Link from 'next/link';
import Image from 'next/image';
import { getProductsLightCached } from '../../../lib/supabase';

// Блок «Чим це зробити» — товари статті. Рендериться з ЖИВИХ даних:
// у blog_posts зберігаються лише артикули, ціна й наявність беруться з кешу
// товарів (60 с, той самий, що на вітрині). Раніше блок «запікався» в HTML
// статті разом із цінами — і через тиждень стаття брехала покупцю.

type Props = { skus: string[]; lang: 'uk' | 'ru' };

const T = {
  uk: { title: 'Чим це зробити', out: 'Немає в наявності', from: 'Детальніше' },
  ru: { title: 'Чем это сделать', out: 'Нет в наличии',    from: 'Подробнее' },
};

export default async function ArticleProducts({ skus, lang }: Props) {
  if (!skus?.length) return null;

  const all = await getProductsLightCached();
  const bySku = new Map(all.map(p => [p.sku, p]));
  // Порядок як у статті; зниклі/деактивовані товари просто випадають
  const items = skus
    .map(s => bySku.get(s))
    .filter((p): p is NonNullable<typeof p> => !!p);
  if (!items.length) return null;

  const t = T[lang];
  const prefix = lang === 'ru' ? '/ru' : '';

  return (
    <section style={{ marginTop: 40 }}>
      <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 16px' }}>
        {t.title}
      </h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 12 }}>
        {items.map(p => {
          // PostgREST віддає вкладену таблицю то об'єктом, то масивом (залежить
          // від того, чи бачить він зв'язок як 1:1) — беремо обидві форми, як і
          // решта коду, що читає product_stock.
          const raw = p.stock as typeof p.stock | (typeof p.stock)[] | null;
          const stock = Array.isArray(raw) ? raw[0] : raw;
          const price = stock?.price_promo ?? stock?.price_retail ?? null;
          const inStock = stock?.stock_status === 'in_stock' || (stock?.stock_qty ?? 0) >= 1;
          const name = (lang === 'ru' ? p.name_ru : null) ?? p.name;
          return (
            <Link
              key={p.sku}
              href={`${prefix}/product/${p.slug ?? p.sku}`}
              style={{
                display: 'flex', flexDirection: 'column', gap: 8, padding: 12,
                background: 'var(--bg-card)', border: '1px solid var(--border)',
                borderRadius: 12, textDecoration: 'none', opacity: inStock ? 1 : 0.6,
              }}
            >
              {p.image && (
                <div style={{ position: 'relative', width: '100%', height: 110 }}>
                  <Image
                    src={p.image}
                    alt={name}
                    fill
                    sizes="210px"
                    style={{ objectFit: 'contain' }}
                  />
                </div>
              )}
              <div style={{ fontSize: 13, lineHeight: 1.4, color: 'var(--text-primary)', fontWeight: 500 }}>
                {name}
              </div>
              {p.volume && (
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{p.volume}</div>
              )}
              <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'baseline', gap: 8 }}>
                {price != null && (
                  <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
                    {Math.round(price)} ₴
                  </span>
                )}
                <span style={{ fontSize: 11, color: inStock ? '#16A34A' : '#EF4444' }}>
                  {inStock ? '' : t.out}
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

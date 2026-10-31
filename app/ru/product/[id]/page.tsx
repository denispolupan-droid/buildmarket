import type { Metadata } from 'next';
import { permanentRedirect } from 'next/navigation';
import { getProductBySkuCached } from '../../../../lib/supabase';
import { productMeta, productPath } from '../../../../lib/seo/meta';
import { isLineVariant } from '../../../../lib/seo/variants';
import ProductView, { resolveProduct } from './ProductView';

// Аудит 31.10.2026: сторінка товару була force-dynamic — найвідвідуваніша
// сторінка рендерилась на кожен запит (getUser + 7 запитів) повз CDN. Тепер
// це ISR: роздрібна картка однакова для всіх, свіжість тримає тег 'products'
// (ціни/залишки скидають кеш, як і листинги) і TTL години. Оптовий перегляд
// (?from=catalog) proxy.ts тихо переписує на ./b2b — там персональні ціни
// рахуються динамічно й у спільний кеш не потрапляють.
export const revalidate = 3600;

// Порожній список = кожен товар рендериться при першому відвідуванні й далі
// віддається з кешу; білд не пререндерить сотні карток (див. next.config).
export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const product = await resolveProduct(id);
  if (!product) return { title: 'Товар не найден', robots: { index: false } };
  // 308 со старого SKU-URL на слаг до начала стриминга страницы
  if (product.slug && id !== product.slug) permanentRedirect(`/ru/product/${product.slug}`);
  const main = isLineVariant(product) && product.variant_canonical ? await getProductBySkuCached(product.variant_main_sku!) : null;
  return productMeta(product, 'ru', { canonicalPath: main ? productPath(main) : null });
}

export default async function RuProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ProductView id={id} isRetail />;
}

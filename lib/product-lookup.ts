import { createServiceClient } from './supabase';
import { escapeOrTerm } from './pg-filter';
import { SITE_URL } from './site';

/**
 * Пошук товарів і картка товару у вигляді тексту — інструменти для
 * ШІ-помічників (чат сайту app/api/chat, помічник чатів маркетплейсів).
 * Раніше жили всередині роуту чату; тепер спільні, щоб два помічники не
 * розходились у тому, як вони бачать каталог.
 */

export async function searchProductsText(query: string, category?: string): Promise<string> {
  const db = createServiceClient();
  // Слова шукаємо окремо (неявне AND між ними)
  const words = query.trim().split(/\s+/).filter(w => w.length > 1).slice(0, 4);

  let q = db
    .from('products')
    .select(`sku, name, brand, volume, category_slug, description,
             stock:product_stock(price_retail, price_unit, stock_status)`)
    .eq('is_active', true)
    .limit(6);

  for (const word of words) {
    const term = `%${escapeOrTerm(word)}%`;
    q = q.or(`name.ilike.${term},brand.ilike.${term},description.ilike.${term},category_slug.ilike.${term}`);
  }

  if (category) q = q.eq('category_slug', category);

  const { data } = await q;
  if (!data?.length) return 'Товарів не знайдено.';

  return data.map(p => {
    const stock  = Array.isArray(p.stock) ? p.stock[0] : p.stock;
    const retail = stock?.price_retail ? `${stock.price_retail} грн` : '—';
    const status = stock?.stock_status === 'in_stock' ? 'є в наявності' : 'немає в наявності';
    return `${p.name} (SKU ${p.sku}) — ${retail}, ${status}\n${SITE_URL}/product/${p.sku}`;
  }).join('\n\n');
}

export async function productDetailsText(sku: string): Promise<string> {
  const db = createServiceClient();
  const { data: p } = await db
    .from('products')
    .select(`sku, name, brand, volume, description, min_order,
             stock:product_stock(price_retail, price_unit, price_drop, stock_status, stock_qty)`)
    .eq('sku', sku)
    .eq('is_active', true)
    .maybeSingle();

  if (!p) return `Товар з SKU ${sku} не знайдено.`;

  const stock = Array.isArray(p.stock) ? p.stock[0] : p.stock;
  const lines = [
    `${p.name}`,
    `Ціна роздріб: ${stock?.price_retail ? stock.price_retail + ' грн' : '—'}`,
    stock?.stock_status === 'in_stock' ? 'Є в наявності' : 'Немає в наявності',
    p.min_order && p.min_order > 1 ? `Мін. замовлення (опт): ${p.min_order} шт` : null,
    p.description ?? null,
    `${SITE_URL}/product/${p.sku}`,
  ].filter(Boolean);

  return lines.join('\n');
}

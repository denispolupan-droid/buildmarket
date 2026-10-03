import { createServiceClient } from './supabase';

/**
 * Наступний SKU для нової картки: домінантний префікс категорії + наступний
 * номер (напр. 1600-089). Без категорії — NEW-NNN; порожня категорія — новий
 * префікс на 100 більший за найбільший у каталозі.
 *
 * Жила всередині POST /api/admin/products; винесена, щоб скрипти заведення й
 * агент картки давали той самий артикул, що й форма.
 */
export async function generateSku(categorySlug: string | null): Promise<string> {
  const db = createServiceClient();
  if (!categorySlug) {
    const { count } = await db.from('products').select('*', { count: 'exact', head: true });
    return `NEW-${String((count ?? 0) + 1).padStart(3, '0')}`;
  }

  const { data: categoryProducts } = await db.from('products').select('sku').eq('category_slug', categorySlug).limit(5000);

  if (!categoryProducts || categoryProducts.length === 0) {
    const { data: allProducts } = await db.from('products').select('sku').order('sku', { ascending: false }).limit(1);
    if (allProducts && allProducts[0]) {
      const lastPrefix = parseInt(allProducts[0].sku.split('-')[0]) || 1000;
      return `${lastPrefix + 100}-001`;
    }
    return '1000-001';
  }

  const prefixCounts: Record<string, number> = {};
  let maxNum = 0;
  let mostCommonPrefix = '';
  categoryProducts.forEach(p => {
    const parts = p.sku.split('-');
    if (parts.length === 2) {
      const prefix = parts[0];
      const num = parseInt(parts[1]) || 0;
      prefixCounts[prefix] = (prefixCounts[prefix] || 0) + 1;
      if (num > maxNum) maxNum = num;
      if (!mostCommonPrefix || prefixCounts[prefix] > prefixCounts[mostCommonPrefix]) mostCommonPrefix = prefix;
    }
  });
  if (!mostCommonPrefix) return `1000-${String(maxNum + 1).padStart(3, '0')}`;

  const { data: prefixProducts } = await db.from('products').select('sku').like('sku', `${mostCommonPrefix}-%`).limit(5000);
  let maxInPrefix = 0;
  prefixProducts?.forEach(p => {
    const num = parseInt(p.sku.split('-')[1]) || 0;
    if (num > maxInPrefix) maxInPrefix = num;
  });
  return `${mostCommonPrefix}-${String(maxInPrefix + 1).padStart(3, '0')}`;
}

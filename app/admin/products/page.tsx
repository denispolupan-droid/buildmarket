import { createClient } from '@supabase/supabase-js';
import { redirect } from 'next/navigation';
import { createSupabaseServer } from '../../../lib/supabase-server';
import ProductsTable from './ProductsTable';
import Link from 'next/link';
import { Plus, Upload, Download } from 'lucide-react';

const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export default async function AdminProductsPage() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user || user.app_metadata?.role !== 'admin') redirect('/');

  const { data: products } = await serviceClient
    .from('products')
    .select(`
      *,
      stock:product_stock(*),
      characteristics:product_characteristics(*)
    `)
    .order('category_slug', { ascending: true })
    .order('sku', { ascending: true });

  const { data: categories } = await serviceClient
    .from('categories')
    .select('*')
    .order('sort_order');

  // SKU з прайсів постачальників (supplier_stock) — для фільтра "сиріт".
  // Пагінація: supabase обрізає вибірки до 1000 рядків
  const supplierSkuSet = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await serviceClient
      .from('supplier_stock')
      .select('sku')
      .range(from, from + 999);
    if (error) break;
    for (const r of data ?? []) supplierSkuSet.add(r.sku);
    if (!data || data.length < 1000) break;
  }

  const { data: brandLogoRows } = await serviceClient
    .from('brand_logos')
    .select('brand_name, logo_url, show_on_home');
  const brandLogos: Record<string, { logoUrl: string; showOnHome: boolean }> = {};
  (brandLogoRows ?? []).forEach(row => {
    brandLogos[row.brand_name.toUpperCase()] = { logoUrl: row.logo_url, showOnHome: row.show_on_home };
  });

  return (
    <div style={{ padding: '32px 36px 64px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '28px' }}>
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Товари</h1>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            {products?.length ?? 0} товарів у базі
          </p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <a
            href="/api/admin/products/export"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '8px',
              height: '40px', padding: '0 18px', borderRadius: '10px',
              background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)',
              fontSize: '13px', fontWeight: 600, textDecoration: 'none',
            }}
          >
            <Download size={16} /> Експорт
          </a>
          <Link
            href="/admin/products/import"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '8px',
              height: '40px', padding: '0 18px', borderRadius: '10px',
              background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)',
              fontSize: '13px', fontWeight: 600, textDecoration: 'none',
            }}
          >
            <Upload size={16} /> Імпорт
          </Link>
          <Link
            href="/admin/products/new"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '8px',
              height: '40px', padding: '0 18px', borderRadius: '10px',
              background: '#1E3A5F', color: '#fff', fontSize: '13px', fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            <Plus size={16} /> Додати товар
          </Link>
        </div>
      </div>
      <ProductsTable products={products ?? []} categories={categories ?? []} brandLogos={brandLogos} supplierSkus={[...supplierSkuSet]} />
    </div>
  );
}

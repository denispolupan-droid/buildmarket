import { Suspense } from 'react';
import { createClient } from '@supabase/supabase-js';
import { redirect } from 'next/navigation';
import { createSupabaseServer } from '../../../lib/supabase-server';
import { fetchAllRows } from '../../../lib/db-paginate';
import ProductsTable from './ProductsTable';
import type { AdminProductRow } from '../../../types';
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

  // Пагінація: 768 товарів вже майже впритул до ліміту 1000; без range() лічильник
  // і сам список мовчки обрізалися б, щойно каталог перевищить 1000 SKU.
  //
  // Списку потрібні не тексти описів, а факти про них: у select(*) 5 із 5,5 МБ
  // каталогу — описи й keywords, і все це їхало в браузер як props таблиці.
  // Тексти читаємо на сервері (той самий регіон, що й база) і віддаємо довжини.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped supabase client, форму задає AdminProductRow нижче
  const raw = await fetchAllRows<any>((f, t) => serviceClient
    .from('products')
    .select('id, sku, name, name_ru, brand, category_slug, volume, image, is_active, is_hit, is_new, sort_order, updated_at, description_full, description_full_ru, description_ru, keywords, stock:product_stock(*), characteristics:product_characteristics(id)')
    .order('category_slug', { ascending: true })
    .order('sku', { ascending: true })
    .range(f, t));
  const products: AdminProductRow[] = raw.map(p => ({
    id: p.id, sku: p.sku, name: p.name, name_ru: p.name_ru ?? null, brand: p.brand, category_slug: p.category_slug ?? null,
    volume: p.volume ?? null, image: p.image ?? null, is_active: !!p.is_active, is_hit: !!p.is_hit, is_new: !!p.is_new,
    sort_order: p.sort_order ?? 0, updated_at: p.updated_at,
    stock: Array.isArray(p.stock) ? (p.stock[0] ?? null) : (p.stock ?? null),
    description_full_len: (p.description_full ?? '').length,
    description_full_ru_len: (p.description_full_ru ?? '').length,
    has_description_ru: !!p.description_ru,
    has_keywords: !!p.keywords,
    characteristics_count: Array.isArray(p.characteristics) ? p.characteristics.length : 0,
  }));

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
            {products.length} товарів у базі
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
      {/* Suspense — бо ProductsTable читає useSearchParams (ініціалізація фільтрів з URL) */}
      <Suspense fallback={null}>
        <ProductsTable products={products} categories={categories ?? []} brandLogos={brandLogos} supplierSkus={[...supplierSkuSet]} />
      </Suspense>
    </div>
  );
}

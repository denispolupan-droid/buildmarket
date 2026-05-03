import { createClient } from '@supabase/supabase-js';
import { redirect } from 'next/navigation';
import { createSupabaseServer } from '../../../lib/supabase-server';
import ProductsTable from './ProductsTable';
import Link from 'next/link';
import { Plus, Upload } from 'lucide-react';

const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export default async function AdminProductsPage() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user || user.user_metadata?.role !== 'admin') redirect('/');

  const { data: products } = await serviceClient
    .from('products')
    .select(`
      *,
      stock:product_stock(*),
      characteristics:product_characteristics(*)
    `)
    .order('updated_at', { ascending: false })
    .limit(500);

  const { data: categories } = await serviceClient
    .from('categories')
    .select('*')
    .order('sort_order');

  return (
    <div style={{ background: '#F8FAFC', minHeight: '100vh' }}>
      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
              Панель менеджера
            </h1>
            <p style={{ fontSize: '14px', color: '#64748B', marginTop: '4px' }}>
              {products?.length ?? 0} товарів у базі
            </p>
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <Link
              href="/admin/products/import"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '8px',
                height: '44px', padding: '0 20px', borderRadius: '10px',
                background: '#fff', border: '1px solid #E2E8F0', color: '#475569',
                fontSize: '14px', fontWeight: 600, textDecoration: 'none',
              }}
            >
              <Upload size={18} /> Імпорт
            </Link>
            <Link
              href="/admin/products/new"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '8px',
                height: '44px', padding: '0 20px', borderRadius: '10px',
                background: '#1E3A5F', color: '#fff', fontSize: '14px', fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              <Plus size={18} /> Додати товар
            </Link>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px', marginBottom: '28px' }}>
          <a
            href="/admin"
            style={{
              padding: '10px 20px', borderRadius: '8px', fontSize: '14px', fontWeight: 600,
              background: '#fff', border: '1px solid #E2E8F0', color: '#475569', textDecoration: 'none',
            }}
          >
            Замовлення
          </a>
          <a
            href="/admin/products"
            style={{
              padding: '10px 20px', borderRadius: '8px', fontSize: '14px', fontWeight: 600,
              background: '#1E3A5F', color: '#fff', textDecoration: 'none',
            }}
          >
            Товари
          </a>
        </div>

        <ProductsTable products={products ?? []} categories={categories ?? []} />
      </div>
    </div>
  );
}

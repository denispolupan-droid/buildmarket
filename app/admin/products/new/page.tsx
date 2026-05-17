import { createClient } from '@supabase/supabase-js';
import { redirect } from 'next/navigation';
import { createSupabaseServer } from '../../../../lib/supabase-server';
import ProductForm from '../[sku]/ProductForm';
import Link from 'next/link';

const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export default async function NewProductPage() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user || user.user_metadata?.role !== 'admin') redirect('/');

  const { data: categories } = await serviceClient
    .from('categories')
    .select('*')
    .order('sort_order');

  return (
    <div style={{ background: 'var(--bg-soft)', minHeight: '100vh' }}>
      <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '32px' }}>
        <div style={{ marginBottom: '24px' }}>
          <Link href="/admin/products" style={{ color: 'var(--text-secondary)', fontSize: '14px', textDecoration: 'none' }}>
            ← Назад до списку товарів
          </Link>
        </div>

        <div style={{ marginBottom: '24px' }}>
          <h1 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
            Новий товар
          </h1>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Заповніть інформацію про новий товар
          </p>
        </div>

        <ProductForm product={null} categories={categories ?? []} isNew={true} />
      </div>
    </div>
  );
}

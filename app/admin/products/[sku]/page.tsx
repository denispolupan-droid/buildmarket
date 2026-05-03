import { createClient } from '@supabase/supabase-js';
import { redirect, notFound } from 'next/navigation';
import { createSupabaseServer } from '../../../../lib/supabase-server';
import ProductForm from './ProductForm';
import Link from 'next/link';

const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

type Props = {
  params: Promise<{ sku: string }>;
};

export default async function EditProductPage({ params }: Props) {
  const { sku } = await params;

  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user || user.user_metadata?.role !== 'admin') redirect('/');

  const { data: product } = await serviceClient
    .from('products')
    .select(`
      *,
      stock:product_stock(*),
      characteristics:product_characteristics(*)
    `)
    .eq('sku', sku)
    .single();

  if (!product) notFound();

  const { data: categories } = await serviceClient
    .from('categories')
    .select('*')
    .order('sort_order');

  return (
    <div style={{ background: '#F8FAFC', minHeight: '100vh' }}>
      <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '32px' }}>
        <div style={{ marginBottom: '24px' }}>
          <Link href="/admin/products" style={{ color: '#64748B', fontSize: '14px', textDecoration: 'none' }}>
            ← Назад до списку товарів
          </Link>
        </div>

        <div style={{ marginBottom: '24px' }}>
          <h1 style={{ fontSize: '24px', fontWeight: 800, color: '#0F172A', margin: 0 }}>
            Редагування товару
          </h1>
          <p style={{ fontSize: '14px', color: '#64748B', marginTop: '4px' }}>
            SKU: {product.sku}
          </p>
        </div>

        <ProductForm product={product} categories={categories ?? []} isNew={false} />
      </div>
    </div>
  );
}

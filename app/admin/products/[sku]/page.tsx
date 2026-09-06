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
  searchParams: Promise<{ back?: string }>;
};

/** Хвіст ?back=… зі списку: пересобираємо лише відомі фільтри — нічого чужого в href. */
function backHref(back: string | undefined): string {
  if (!back) return '/admin/products';
  const src = new URLSearchParams(back.replace(/^\?/, ''));
  const out = new URLSearchParams();
  for (const k of ['q', 'cat', 'brand', 'status']) {
    const v = src.get(k);
    if (v) out.set(k, v);
  }
  const s = out.toString();
  return s ? `/admin/products?${s}` : '/admin/products';
}

export default async function EditProductPage({ params, searchParams }: Props) {
  const { sku } = await params;
  const { back } = await searchParams;

  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user || user.app_metadata?.role !== 'admin') redirect('/');

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

  const seenUrls = new Set<string>();
  const promUrls: { url: string; name: string }[] = [];
  for (const c of categories ?? []) {
    if (c.prom_section_url && !seenUrls.has(c.prom_section_url)) {
      seenUrls.add(c.prom_section_url);
      promUrls.push({ url: c.prom_section_url, name: c.name });
    }
  }

  return (
    <div style={{ background: 'var(--bg-soft)', minHeight: '100vh' }}>
      <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '32px' }}>
        <div style={{ marginBottom: '24px' }}>
          <Link href={backHref(back)} style={{ color: 'var(--text-secondary)', fontSize: '14px', textDecoration: 'none' }}>
            ← Назад до списку товарів
          </Link>
        </div>

        <div style={{ marginBottom: '24px' }}>
          <h1 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
            Редагування товару
          </h1>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            SKU: {product.sku}
          </p>
        </div>

        <ProductForm product={product} categories={categories ?? []} isNew={false} promUrls={promUrls} />
      </div>
    </div>
  );
}

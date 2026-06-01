import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '../../../../lib/supabase-server';
import { createClient } from '@supabase/supabase-js';

const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function checkAdmin() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  return user && user.user_metadata?.role === 'admin';
}

async function generateSku(categorySlug: string | null): Promise<string> {
  if (!categorySlug) {
    const { count } = await serviceClient
      .from('products')
      .select('*', { count: 'exact', head: true });
    return `NEW-${String((count ?? 0) + 1).padStart(3, '0')}`;
  }

  const { data: categoryProducts } = await serviceClient
    .from('products')
    .select('sku')
    .eq('category_slug', categorySlug);

  if (!categoryProducts || categoryProducts.length === 0) {
    const { data: allProducts } = await serviceClient
      .from('products')
      .select('sku')
      .order('sku', { ascending: false })
      .limit(1);

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
      if (!mostCommonPrefix || prefixCounts[prefix] > prefixCounts[mostCommonPrefix]) {
        mostCommonPrefix = prefix;
      }
    }
  });

  if (!mostCommonPrefix) {
    return `1000-${String(maxNum + 1).padStart(3, '0')}`;
  }

  const { data: prefixProducts } = await serviceClient
    .from('products')
    .select('sku')
    .like('sku', `${mostCommonPrefix}-%`);

  let maxInPrefix = 0;
  prefixProducts?.forEach(p => {
    const num = parseInt(p.sku.split('-')[1]) || 0;
    if (num > maxInPrefix) maxInPrefix = num;
  });

  return `${mostCommonPrefix}-${String(maxInPrefix + 1).padStart(3, '0')}`;
}

export async function POST(req: NextRequest) {
  if (!await checkAdmin()) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const { product, stock, characteristics } = body;

  if (!product.sku || product.sku === 'auto') {
    product.sku = await generateSku(product.category_slug);
    if (stock) stock.sku = product.sku;
  }

  const { data: existing } = await serviceClient
    .from('products')
    .select('sku')
    .eq('sku', product.sku)
    .single();

  if (existing) {
    return NextResponse.json({ error: 'Товар з таким SKU вже існує' }, { status: 400 });
  }

  const { error: productError } = await serviceClient
    .from('products')
    .insert(product);

  if (productError) {
    return NextResponse.json({ error: productError.message }, { status: 500 });
  }

  if (stock) {
    const { error: stockError } = await serviceClient
      .from('product_stock')
      .insert(stock);

    if (stockError) {
      await serviceClient.from('products').delete().eq('sku', product.sku);
      return NextResponse.json({ error: stockError.message }, { status: 500 });
    }
  }

  if (characteristics && characteristics.length > 0) {
    const charRows = characteristics.map((c: { label: string; value: string }) => ({
      product_sku: product.sku,
      label: c.label,
      value: c.value,
    }));

    const { error: charError } = await serviceClient
      .from('product_characteristics')
      .insert(charRows);

    if (charError) {
      console.error('Characteristics insert error:', charError);
    }
  }

  return NextResponse.json({ ok: true, sku: product.sku });
}

export async function PUT(req: NextRequest) {
  if (!await checkAdmin()) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const { sku, product, stock, characteristics } = body;

  const { error: productError } = await serviceClient
    .from('products')
    .update(product)
    .eq('sku', sku);

  if (productError) {
    return NextResponse.json({ error: productError.message }, { status: 500 });
  }

  if (stock) {
    const { error: stockError } = await serviceClient
      .from('product_stock')
      .upsert(stock, { onConflict: 'sku' });

    if (stockError) {
      return NextResponse.json({ error: stockError.message }, { status: 500 });
    }
  }

  await serviceClient
    .from('product_characteristics')
    .delete()
    .eq('product_sku', sku);

  if (characteristics && characteristics.length > 0) {
    const charRows = characteristics.map((c: { label: string; value: string }) => ({
      product_sku: sku,
      label: c.label,
      value: c.value,
    }));

    const { error: charError } = await serviceClient
      .from('product_characteristics')
      .insert(charRows);

    if (charError) {
      console.error('Characteristics insert error:', charError);
    }
  }

  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest) {
  if (!await checkAdmin()) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const sku = req.nextUrl.searchParams.get('sku');
  if (!sku) return NextResponse.json({ error: 'SKU required' }, { status: 400 });

  const body = await req.json() as Record<string, unknown>;
  const allowed = ['is_active', 'sort_order'];
  const update: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) update[key] = body[key];
  }
  if (!Object.keys(update).length) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  const { error } = await serviceClient.from('products').update(update).eq('sku', sku);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  if (!await checkAdmin()) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const sku = req.nextUrl.searchParams.get('sku');
  if (!sku) {
    return NextResponse.json({ error: 'SKU required' }, { status: 400 });
  }

  // Видаляємо всі пов'язані записи перед продуктом
  await Promise.allSettled([
    serviceClient.from('product_characteristics').delete().eq('product_sku', sku),
    serviceClient.from('product_stock').delete().eq('sku', sku),
    serviceClient.from('supplier_stock').delete().eq('sku', sku),
    serviceClient.from('supplier_sku_map').delete().eq('our_sku', sku),
    serviceClient.from('product_reviews').delete().eq('product_sku', sku),
  ]);

  const { error } = await serviceClient
    .from('products')
    .delete()
    .eq('sku', sku);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

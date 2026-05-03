import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '../../../../../lib/supabase-server';
import { createClient } from '@supabase/supabase-js';

const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user || user.user_metadata?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const brand = req.nextUrl.searchParams.get('brand');
  const category = req.nextUrl.searchParams.get('category');

  const result: {
    bc?: string;
    ac?: string;
    characteristics?: string[];
    values?: string[];
  } = {};

  if (brand) {
    const { data: brandProduct } = await serviceClient
      .from('products')
      .select('bc, ac')
      .eq('brand', brand)
      .not('bc', 'is', null)
      .limit(1)
      .single();

    if (brandProduct) {
      result.bc = brandProduct.bc;
      result.ac = brandProduct.ac;
    }
  }

  if (category) {
    const { data: categoryProducts } = await serviceClient
      .from('products')
      .select('sku')
      .eq('category_slug', category)
      .limit(50);

    if (categoryProducts && categoryProducts.length > 0) {
      const skus = categoryProducts.map(p => p.sku);
      const { data: chars } = await serviceClient
        .from('product_characteristics')
        .select('label')
        .in('product_sku', skus);

      if (chars && chars.length > 0) {
        const labelCounts: Record<string, number> = {};
        chars.forEach((c: { label: string }) => {
          labelCounts[c.label] = (labelCounts[c.label] || 0) + 1;
        });
        const sorted = Object.entries(labelCounts)
          .sort((a, b) => b[1] - a[1])
          .map(([label]) => label);
        result.characteristics = sorted.slice(0, 15);
      }
    }
  }

  const label = req.nextUrl.searchParams.get('label');

  if (label) {
    const { data: values } = await serviceClient
      .from('product_characteristics')
      .select('value')
      .eq('label', label)
      .limit(500);

    if (values && values.length > 0) {
      const valueCounts: Record<string, number> = {};
      values.forEach((v: { value: string }) => {
        if (v.value?.trim()) {
          valueCounts[v.value] = (valueCounts[v.value] || 0) + 1;
        }
      });
      const sorted = Object.entries(valueCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([value]) => value);
      result.values = sorted.slice(0, 30);
    }
  }

  return NextResponse.json(result);
}

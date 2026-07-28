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

  if (!user || user.app_metadata?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const brand = req.nextUrl.searchParams.get('brand');
  const category = req.nextUrl.searchParams.get('category');

  const result: {
    bc?: string;
    ac?: string;
    characteristics?: string[];
    required?: string[];
    values?: string[];
    labels?: string[];
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
    // Насамперед — словник категорії (обов'язкові + типові), required попереду
    const { data: dictRows } = await serviceClient
      .from('category_characteristics')
      .select('required, sort_order, characteristic_definitions(label, sort_order)')
      .eq('category_slug', category)
      .limit(100);

    type DictRow = { required: boolean; sort_order: number | null; characteristic_definitions: { label: string; sort_order: number } | null };
    // PostgREST повертає to-one embed об'єктом, але untyped-клієнт виводить масив
    const dict = ((dictRows ?? []) as unknown as DictRow[])
      .filter(r => r.characteristic_definitions)
      .sort((a, b) => (a.sort_order ?? a.characteristic_definitions!.sort_order) - (b.sort_order ?? b.characteristic_definitions!.sort_order));

    if (dict.length) {
      result.required = dict.filter(r => r.required).map(r => r.characteristic_definitions!.label);
      result.characteristics = [
        ...result.required,
        ...dict.filter(r => !r.required).map(r => r.characteristic_definitions!.label),
      ];
    } else {
      // Fallback до заливки словника: статистика лейблів категорії
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
  }

  // Список існуючих ярликів характеристик (для автокомпліту «фільтра»):
  // спершу популярні в цій категорії, далі — решта по всьому каталогу.
  if (req.nextUrl.searchParams.get('labels')) {
    // Канонічні лейбли словника — попереду автокомпліту (в порядку словника)
    const { data: defs } = await serviceClient
      .from('characteristic_definitions')
      .select('label, sort_order')
      .order('sort_order')
      .limit(1000);
    const canonical = (defs ?? []).map((d: { label: string }) => d.label);

    const { data: allChars } = await serviceClient
      .from('product_characteristics')
      .select('label')
      .limit(4000);
    const counts: Record<string, number> = {};
    (allChars ?? []).forEach((c: { label: string }) => {
      const l = c.label?.trim();
      if (l) counts[l] = (counts[l] || 0) + 1;
    });
    const globalSorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([l]) => l);
    const merged: string[] = [];
    const seen = new Set<string>();
    for (const l of [...(result.characteristics ?? []), ...canonical, ...globalSorted]) {
      const k = l.toLowerCase();
      if (!seen.has(k)) { seen.add(k); merged.push(l); }
    }
    result.labels = merged.slice(0, 200);
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

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '../../../../../lib/supabase-server';
import { createClient } from '@supabase/supabase-js';

const serviceClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function checkAdmin() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.user_metadata?.role === 'admin';
}

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  if (!await checkAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await params;

  const [{ data: supplier, error }, { data: syncLogs }, { data: productOverrides }] = await Promise.all([
    serviceClient
      .from('suppliers')
      .select('*, brand_discounts:supplier_brand_discounts(*)')
      .eq('id', id)
      .single(),
    serviceClient
      .from('supplier_sync_log')
      .select('*')
      .eq('supplier_id', id)
      .order('started_at', { ascending: false })
      .limit(10),
    serviceClient
      .from('supplier_product_overrides')
      .select('our_sku, markup_retail, markup_wholesale, markup_drop, fixed_retail, fixed_wholesale, fixed_drop, notes')
      .eq('supplier_id', id),
  ]);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ...supplier, sync_logs: syncLogs ?? [], product_overrides: productOverrides ?? [] });
}

export async function PUT(req: NextRequest, { params }: Params) {
  if (!await checkAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await params;
  const body = await req.json();
  const { brand_discounts, last_sync, sync_logs, product_overrides, ...supplier } = body;

  // Зберігаємо product_overrides окремо
  if (Array.isArray(product_overrides)) {
    await serviceClient.from('supplier_product_overrides').delete().eq('supplier_id', id);
    const toInsert = product_overrides
      .filter((o: { our_sku?: string }) => o.our_sku)
      .map((o: Record<string, unknown>) => ({
        supplier_id:      Number(id),
        our_sku:          o.our_sku,
        markup_retail:    o.markup_retail   ? Number(o.markup_retail)   : null,
        markup_wholesale: o.markup_wholesale ? Number(o.markup_wholesale) : null,
        markup_drop:      o.markup_drop     ? Number(o.markup_drop)     : null,
        fixed_retail:     o.fixed_retail    ? Number(o.fixed_retail)    : null,
        fixed_wholesale:  o.fixed_wholesale  ? Number(o.fixed_wholesale)  : null,
        fixed_drop:       o.fixed_drop      ? Number(o.fixed_drop)      : null,
        notes:            o.notes ?? null,
      }));
    if (toInsert.length > 0) {
      await serviceClient.from('supplier_product_overrides').insert(toInsert);
    }
  }

  const { data, error } = await serviceClient
    .from('suppliers')
    .update(supplier)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Пересохраняем скидки на бренды полностью
  await serviceClient.from('supplier_brand_discounts').delete().eq('supplier_id', id);
  if (brand_discounts?.length) {
    await serviceClient.from('supplier_brand_discounts').insert(
      brand_discounts.map((d: { brand: string; discount_pct: number }) => ({ ...d, supplier_id: Number(id) }))
    );
  }

  return NextResponse.json(data);
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  if (!await checkAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await params;

  const { error } = await serviceClient.from('suppliers').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

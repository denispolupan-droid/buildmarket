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

  const [{ data: supplier, error }, { data: syncLogs }] = await Promise.all([
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
  ]);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ...supplier, sync_logs: syncLogs ?? [] });
}

export async function PUT(req: NextRequest, { params }: Params) {
  if (!await checkAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await params;
  const body = await req.json();
  // Прибираємо всі поля, яких немає в таблиці suppliers
  const { brand_discounts, last_sync, sync_logs, ...supplier } = body;

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

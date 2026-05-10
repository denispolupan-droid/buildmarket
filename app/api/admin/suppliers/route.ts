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
  return user?.user_metadata?.role === 'admin';
}

export async function GET() {
  if (!await checkAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const [{ data: suppliers, error }, { data: syncLogs }] = await Promise.all([
    serviceClient
      .from('suppliers')
      .select('*, brand_discounts:supplier_brand_discounts(*)')
      .order('name'),
    serviceClient
      .from('supplier_sync_log')
      .select('supplier_id, rows_updated, rows_unmapped, error_message')
      .order('started_at', { ascending: false })
      .limit(100),
  ]);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const lastSyncMap = new Map<number, object>();
  for (const log of syncLogs ?? []) {
    if (!lastSyncMap.has(log.supplier_id)) lastSyncMap.set(log.supplier_id, log);
  }

  const data = (suppliers ?? []).map(s => ({
    ...s,
    last_sync: lastSyncMap.has(s.id) ? [lastSyncMap.get(s.id)] : [],
  }));

  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  if (!await checkAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json();
  const { brand_discounts, last_sync, sync_logs, ...supplier } = body;

  const { data, error } = await serviceClient
    .from('suppliers')
    .insert(supplier)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (brand_discounts?.length) {
    await serviceClient.from('supplier_brand_discounts').insert(
      brand_discounts.map((d: { brand: string; discount_pct: number }) => ({ ...d, supplier_id: data.id }))
    );
  }

  return NextResponse.json(data, { status: 201 });
}

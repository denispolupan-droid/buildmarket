import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { createSupabaseServer } from '../../../../../lib/supabase-server';
import { createClient } from '@supabase/supabase-js';

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// Зняти власну наценку товару: далі ціну рахує наценка бренду/постачальника,
// і найближчий синк перерахує її з прайса. Записує наценку переоцінка
// (PATCH /api/admin/prices/bulk) — тут лише скидання, поштучна дія з таблиці цін.
export async function DELETE(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !['admin', 'manager'].includes(user.app_metadata?.role ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const sku = req.nextUrl.searchParams.get('sku')?.trim();
  if (!sku) return NextResponse.json({ error: 'sku обовʼязковий' }, { status: 400 });

  const { error } = await db.from('supplier_product_overrides').delete().eq('our_sku', sku);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  revalidateTag('products', 'max');
  return NextResponse.json({ ok: true });
}

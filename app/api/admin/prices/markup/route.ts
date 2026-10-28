import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { requireStaff } from '../../../../../lib/auth-guard';

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// Зняти власну наценку товару: далі ціну рахує наценка бренду/постачальника,
// і найближчий синк перерахує її з прайса. Записує наценку переоцінка
// (PATCH /api/admin/prices/bulk) — тут лише скидання, поштучна дія з таблиці цін.
export async function DELETE(req: NextRequest) {
  const auth = await requireStaff('admin', 'manager');
  if (!auth.ok) return auth.response;

  const sku = req.nextUrl.searchParams.get('sku')?.trim();
  if (!sku) return NextResponse.json({ error: 'sku обовʼязковий' }, { status: 400 });

  const { error } = await db.from('supplier_product_overrides').delete().eq('our_sku', sku);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  revalidateTag('products', 'max');
  return NextResponse.json({ ok: true });
}

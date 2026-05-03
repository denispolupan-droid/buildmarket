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

// POST — зберегти маппінг і видалити з немаплених
export async function POST(req: NextRequest) {
  if (!await checkAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { supplier_id, supplier_sku, our_sku } = await req.json();
  if (!supplier_id || !supplier_sku || !our_sku) {
    return NextResponse.json({ error: 'Відсутні обов\'язкові поля' }, { status: 400 });
  }

  const { error } = await serviceClient
    .from('supplier_sku_map')
    .upsert({ supplier_id, supplier_sku, our_sku }, { onConflict: 'supplier_id,supplier_sku' });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Видаляємо з черги немаплених
  await serviceClient
    .from('supplier_unmapped_skus')
    .delete()
    .eq('supplier_id', supplier_id)
    .eq('supplier_sku', supplier_sku);

  return NextResponse.json({ ok: true });
}

// DELETE — ігнорувати артикул (просто видалити з черги без маппінгу)
export async function DELETE(req: NextRequest) {
  if (!await checkAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { supplier_id, supplier_sku } = await req.json();

  await serviceClient
    .from('supplier_unmapped_skus')
    .delete()
    .eq('supplier_id', supplier_id)
    .eq('supplier_sku', supplier_sku);

  return NextResponse.json({ ok: true });
}

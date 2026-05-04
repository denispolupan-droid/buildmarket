import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '../../../lib/supabase-server';

export async function GET() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ skus: [], authenticated: false });

  const { data } = await supabase
    .from('wishlists')
    .select('product_sku')
    .eq('user_id', user.id);

  return NextResponse.json({ skus: (data ?? []).map(r => r.product_sku), authenticated: true });
}

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const { sku } = await req.json();
  if (!sku) return NextResponse.json({ ok: false }, { status: 400 });

  const { data: existing } = await supabase
    .from('wishlists')
    .select('id')
    .eq('user_id', user.id)
    .eq('product_sku', sku)
    .maybeSingle();

  if (existing) {
    await supabase.from('wishlists').delete().eq('id', existing.id);
    return NextResponse.json({ ok: true, action: 'removed' });
  } else {
    await supabase.from('wishlists').insert({ user_id: user.id, product_sku: sku });
    return NextResponse.json({ ok: true, action: 'added' });
  }
}

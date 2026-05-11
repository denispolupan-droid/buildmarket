import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdmin } from '../../../../../lib/supabase-server';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  if (!token) return NextResponse.json({ error: 'Invalid token' }, { status: 400 });

  const admin = createSupabaseAdmin();

  const { data, error } = await admin
    .from('abandoned_carts')
    .select('items, total_price')
    .eq('recover_token', token)
    .is('recovered_at', null)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: 'Cart not found or already recovered' }, { status: 404 });
  }

  return NextResponse.json({ items: data.items, totalPrice: data.total_price });
}

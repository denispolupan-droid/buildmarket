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

  const q     = req.nextUrl.searchParams.get('q')?.trim() ?? '';
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') ?? '10'), 100);

  let query = serviceClient
    .from('customers')
    .select('id, name, company, legal_name, phone, email, type, price_tier, city')
    .eq('is_active', true)
    .order('last_order_at', { ascending: false, nullsFirst: false })
    .limit(limit);

  if (q.length >= 2) {
    query = query.or(
      `name.ilike.%${q}%,company.ilike.%${q}%,phone.ilike.%${q}%,email.ilike.%${q}%`
    );
  }

  const { data } = await query;
  return NextResponse.json(data ?? []);
}

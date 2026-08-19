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

  // id — точковий запит: так форма замовлення підтягує прив'язаного клієнта,
  // коли з чернетки прийшов лише customerId (копія замовлення).
  const id    = req.nextUrl.searchParams.get('id')?.trim() ?? '';
  const q     = req.nextUrl.searchParams.get('q')?.trim() ?? '';
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') ?? '10'), 100);

  let query = serviceClient
    .from('customers')
    .select('id, name, company, phone, email, type, price_tier, city')
    .eq('is_active', true)
    .order('last_order_at', { ascending: false, nullsFirst: false })
    .limit(limit);

  if (id) {
    const { data } = await serviceClient
      .from('customers')
      .select('id, name, company, phone, email, type, price_tier, city')
      .eq('id', id)
      .limit(1);
    return NextResponse.json(data ?? []);
  }

  if (q.length >= 2) {
    query = query.or(
      `name.ilike.%${q}%,company.ilike.%${q}%,phone.ilike.%${q}%,email.ilike.%${q}%`
    );
  }

  const { data } = await query;
  return NextResponse.json(data ?? []);
}

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

  const q = req.nextUrl.searchParams.get('q')?.trim() ?? '';
  if (q.length < 2) return NextResponse.json([]);

  const { data } = await serviceClient
    .from('customers')
    .select('id, name, company, legal_name, phone, email, type, price_tier, city')
    .or(`name.ilike.%${q}%,company.ilike.%${q}%,phone.ilike.%${q}%,email.ilike.%${q}%`)
    .eq('is_active', true)
    .order('name')
    .limit(10);

  return NextResponse.json(data ?? []);
}

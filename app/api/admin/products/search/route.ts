import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '../../../../../lib/supabase-server';
import { createClient } from '@supabase/supabase-js';
import { escapeOrTerm } from '../../../../../lib/pg-filter';

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

  const q = req.nextUrl.searchParams.get('q')?.trim() ?? '';
  if (q.length < 2) return NextResponse.json([]);
  const term = escapeOrTerm(q);

  const { data } = await serviceClient
    .from('products')
    .select('sku, name, brand, volume')
    .or(`sku.ilike.%${term}%,name.ilike.%${term}%,brand.ilike.%${term}%`)
    .order('name')
    .limit(15);

  return NextResponse.json(data ?? []);
}
